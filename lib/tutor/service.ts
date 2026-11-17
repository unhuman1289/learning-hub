import { berlinDay, cutoffFor } from '../daily-policy.ts';
import { addDays } from '../learner-model/rules.ts';
import { ApiError } from '../api-error.ts';
import { safeText } from '../automation/privacy.ts';
import {
  TUTOR_OPEN_TURN_LIMIT, TUTOR_QUESTION_LIMIT, TUTOR_TURN_LIMIT,
  type TutorQuestion, type TutorTurn,
} from '../contracts/tutor.ts';
import type { Db } from '../subjects/service.ts';
import type { EvidenceDb } from '../evidence/submit.ts';
import type { SubjectSensitivity } from '../subjects/sql.ts';


const eligibleItem = `FROM learning_lessons l JOIN lesson_items i ON i.lesson_id=l.id AND i.learner_id=l.user_id
  LEFT JOIN learner_settings s ON s.user_id=l.user_id
  WHERE l.id=? AND i.item_id=? AND l.user_id=? AND l.package_version IN ('2','3') AND i.flag IS NOT 'item_void'`;

export async function openTutorTurn(db: EvidenceDb, learnerId: string, input: TutorQuestion, live: boolean, now = new Date()) {
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
  const id = 'tur_' + crypto.randomUUID();
  const status = live ? 'streaming' : 'queued';
  const createdAt = now.toISOString();
  const day = berlinDay(now), start = cutoffFor(day), end = cutoffFor(addDays(day, 1));
  // The write rechecks eligibility and both limits in a single SQLite statement.
  const insert = db.prepare(`INSERT INTO tutor_turns (id, lesson_id, item_id, learner_id, question, status, created_at)
    SELECT ?, l.id, i.item_id, l.user_id, ?, ?, ? ${eligibleItem}
      AND l.completed_at IS NULL AND COALESCE(s.tutor_enabled,1)=1
      AND (SELECT count(*) FROM tutor_turns WHERE lesson_id=l.id AND learner_id=l.user_id) < ?
      AND (SELECT count(*) FROM tutor_turns WHERE learner_id=l.user_id AND status IN ('queued','streaming')) < ?
      AND (SELECT count(*) FROM tutor_turns WHERE learner_id=l.user_id AND created_at>=? AND created_at<?) < 60`)
    .bind(id, question, status, createdAt, ...scope, TUTOR_TURN_LIMIT, TUTOR_OPEN_TURN_LIMIT, start, end);
  // The support update shares the insertion transaction with the submission gate.
  // It never lowers existing support and does not alter already submitted work.
  const support = db.prepare(`UPDATE learning_lessons SET support=json_set(support,?, 'hint1')
    WHERE id=? AND user_id=? AND EXISTS(SELECT 1 FROM tutor_turns WHERE id=? AND status=?)
      AND NOT EXISTS(SELECT 1 FROM attempts WHERE lesson_id=? AND item_id=? AND learner_id=?)
      AND coalesce(json_extract(support,?), '') NOT IN ('hint1','hint2','solution')`)
    .bind('$.'+input.itemId,input.lessonId,learnerId,id,status,input.lessonId,input.itemId,learnerId,'$.'+input.itemId);
  const [result] = await db.batch([insert,support]) as {meta:{changes?:number}}[];
  if (!result.meta.changes) {
    throw new ApiError(409, 'Chỉ có thể chờ một câu trả lời mỗi lần, hỏi tối đa 20 lượt mỗi bài và 60 lượt mỗi ngày.');
  }
  return { id, status };
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
