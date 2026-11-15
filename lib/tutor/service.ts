import { ApiError } from '../api-error.ts';
import { safeText } from '../automation/privacy.ts';
import {
  TUTOR_OPEN_TURN_LIMIT, TUTOR_QUESTION_LIMIT, TUTOR_TURN_LIMIT, tutorAnswer,
  type TutorQuestion, type TutorTurn,
} from '../contracts/tutor.ts';
import type { Db } from '../subjects/service.ts';
import type { SubjectSensitivity } from '../subjects/sql.ts';
import { onTutorTurn } from './support.ts';
import type { TutorRelay, TutorRelayInput } from './relay.ts';

export const TUTOR_QUEUED_MESSAGE = 'Gia sư đang nghỉ, câu hỏi sẽ được trả lời khi máy bật';

const eligibleItem = `FROM learning_lessons l JOIN lesson_items i ON i.lesson_id=l.id AND i.learner_id=l.user_id
  LEFT JOIN learner_settings s ON s.user_id=l.user_id
  WHERE l.id=? AND i.item_id=? AND l.user_id=? AND l.package_version IN ('2','3') AND i.flag IS NOT 'item_void'`;

export async function openTutorTurn(db: Db, learnerId: string, input: TutorQuestion, live: boolean, now = new Date()) {
  const scope = [input.lessonId, input.itemId, learnerId];
  const item = await db.prepare(`SELECT l.completed_at, i.payload, s.display_name,
    COALESCE(s.tutor_enabled,1) AS tutor_enabled,
    (SELECT sensitivity FROM subjects WHERE id=l.subject_id AND learner_id=l.user_id) AS sensitivity
    ${eligibleItem}`).bind(...scope).first<{
      completed_at: string | null; payload: string; display_name: string | null;
      tutor_enabled: number; sensitivity: SubjectSensitivity | null;
    }>();
  if (!item) throw new ApiError(404, 'Không tìm thấy câu trong bài.');
  if (!item.tutor_enabled) throw new ApiError(403, 'Gia sư đã được tắt cho hồ sơ này.');
  if (item.completed_at !== null) throw new ApiError(409, 'Bài đã hoàn thành.');

  const sensitivity = item.sensitivity ?? 'normal';
  const question = [...safeText(input.question, sensitivity)].slice(0, TUTOR_QUESTION_LIMIT).join('');
  const relayInput: TutorRelayInput = {
    question,
    nickname: safeText(item.display_name || 'Người học', sensitivity),
    prompt: safeText((JSON.parse(item.payload) as { prompt?: string }).prompt, sensitivity),
  };
  const id = 'tur_' + crypto.randomUUID();
  const status = live ? 'streaming' : 'queued';
  const createdAt = now.toISOString();
  // The write rechecks eligibility and both limits in a single SQLite statement.
  const result = await db.prepare(`INSERT INTO tutor_turns (id, lesson_id, item_id, learner_id, question, status, created_at)
    SELECT ?, l.id, i.item_id, l.user_id, ?, ?, ? ${eligibleItem}
      AND l.completed_at IS NULL AND COALESCE(s.tutor_enabled,1)=1
      AND (SELECT count(*) FROM tutor_turns WHERE lesson_id=l.id AND learner_id=l.user_id) < ?
      AND (SELECT count(*) FROM tutor_turns WHERE learner_id=l.user_id AND status IN ('queued','streaming')) < ?`)
    .bind(id, question, status, createdAt, ...scope, TUTOR_TURN_LIMIT, TUTOR_OPEN_TURN_LIMIT).run();
  if (!result.meta.changes) {
    throw new ApiError(409, 'Chỉ có thể chờ một câu trả lời mỗi lần và hỏi tối đa 20 lượt trong một bài.');
  }
  await onTutorTurn(db, { learnerId, lessonId: input.lessonId, itemId: input.itemId });
  return { id, status, relayInput };
}

export async function readTutorTurns(db: Db, learnerId: string, lessonId: string): Promise<TutorTurn[]> {
  const lesson = await db.prepare("SELECT 1 FROM learning_lessons WHERE id=? AND user_id=? AND package_version IN ('2','3')")
    .bind(lessonId, learnerId).first();
  if (!lesson) throw new ApiError(404, 'Không tìm thấy bài.');
  const { results = [] } = await db.prepare(`SELECT id, lesson_id, item_id, question, answer, status, leak_blocked,
    first_token_ms, created_at, answered_at FROM tutor_turns WHERE lesson_id=? AND learner_id=? ORDER BY created_at,rowid`)
    .bind(lessonId, learnerId).all<TutorTurn>();
  return results;
}

export function tutorStream(db: Db, turn: { id: string; relayInput: TutorRelayInput }, relay: TutorRelay, started: number) {
  const encoder = new TextEncoder();
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: string, data: object) => {
        if (!cancelled) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        emit('turn', { id: turn.id, status: 'streaming' });
        const answer = tutorAnswer.parse(await relay(turn.relayInput));
        const firstTokenMs = Math.round(Math.max(0, performance.now() - started));
        emit('delta', { text: answer });
        const result = await db.prepare(`UPDATE tutor_turns SET answer=?, status='answered', first_token_ms=?, answered_at=?
          WHERE id=? AND status='streaming'`).bind(answer, firstTokenMs, new Date().toISOString(), turn.id).run();
        if (!result.meta.changes) throw new Error('Tutor turn is no longer streaming');
        emit('done', { id: turn.id, status: 'answered' });
      } catch {
        try {
          await db.prepare("UPDATE tutor_turns SET status='failed' WHERE id=? AND status='streaming'").bind(turn.id).run();
        } catch {
          console.error('Chưa ghi được trạng thái lượt gia sư.', turn.id);
        }
        emit('error', { message: 'Chưa trả lời được câu hỏi.' });
      } finally {
        if (!cancelled) controller.close();
      }
    },
    cancel() { cancelled = true; },
  });
}
