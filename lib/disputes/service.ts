import { ApiError } from '../api-error.ts';
import type { EvidenceDb } from '../evidence/submit.ts';
import { enqueue, type QueueBindings } from '../ai-jobs/queue.ts';
import { recomputeSkill } from '../learner-model/recompute.ts';

/** Disputes over a grade (docs/hub2/AI-API.md §8). Every change keeps the old grade and its history. */
export type DisputeReason = 'answer_correct' | 'feedback_wrong' | 'item_wrong' | 'other';
export type DisputeInput = { reason: DisputeReason; message: string; recheck: boolean };
export type Resolution =
  | { decision: 'keep'; note: string }
  | { decision: 'void'; note: string }
  | { decision: 'set'; result: 'correct' | 'partial' | 'incorrect'; score: number; feedback: string; note: string };

export const DISPUTES_PER_DAY = 20;
const reasons = new Set(['answer_correct', 'feedback_wrong', 'item_wrong', 'other']);
const OPEN = "('open','rechecking','needs_human')";
const bad = (message: string) => new ApiError(400, message);
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const makeId = (prefix: string) => prefix + Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(16).padStart(2, '0')).join('');

export function parseDispute(body: unknown): DisputeInput {
  if (!isRecord(body) || Object.keys(body).some((key) => !['reason', 'message', 'recheck'].includes(key))) throw bad('Phản đối không hợp lệ.');
  if (!reasons.has(body.reason as string)) throw bad('Chọn lý do phản đối.');
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (message.length > 1000) throw bad('Lời nhắn tối đa 1000 ký tự.');
  if (body.recheck !== undefined && typeof body.recheck !== 'boolean') throw bad('recheck phải là true hoặc false.');
  return { reason: body.reason as DisputeReason, message, recheck: body.recheck !== false };
}

export function parseResolution(body: unknown): Resolution {
  if (!isRecord(body)) throw bad('Quyết định không hợp lệ.');
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > 1000) throw bad('Ghi chú tối đa 1000 ký tự.');
  if (body.decision === 'keep' || body.decision === 'void') return { decision: body.decision, note };
  if (body.decision !== 'set') throw bad('Chọn giữ, đặt điểm hoặc huỷ câu.');
  if (!['correct', 'partial', 'incorrect'].includes(body.result as string)) throw bad('Kết quả không hợp lệ.');
  const score = Number(body.score);
  if (!Number.isFinite(score) || score < 0 || score > 1) throw bad('Điểm cần từ 0 đến 1.');
  const feedback = typeof body.feedback === 'string' ? body.feedback.trim() : '';
  if (!feedback || feedback.length > 1500) throw bad('Lời phê cần 1–1500 ký tự.');
  return { decision: 'set', result: body.result as 'correct' | 'partial' | 'incorrect', score, feedback, note };
}

type AttemptRow = { id: string; subject_id: string; skill_ids: string; status: string; current_grade_id: string | null; lesson_id: string; item_id: string };

async function recomputeAttemptSkills(db: EvidenceDb, learnerId: string, skillIds: string, now: Date) {
  for (const skillId of JSON.parse(skillIds) as string[]) await recomputeSkill(db, learnerId, skillId, now);
}

/** The learner disputes a grade: the attempt leaves the rules at once; a recheck job is queued when allowed. */
export async function createDispute(
  db: EvidenceDb,
  bindings: QueueBindings,
  learnerId: string,
  raisedBy: string,
  attemptId: string,
  input: DisputeInput,
  now = new Date(),
) {
  const attempt = await db
    .prepare('SELECT id,subject_id,skill_ids,status,current_grade_id,lesson_id,item_id FROM attempts WHERE id=? AND learner_id=?')
    .bind(attemptId, learnerId)
    .first<AttemptRow>();
  if (!attempt) throw new ApiError(404, 'Không tìm thấy câu đã làm.');
  if (attempt.status !== 'graded' || !attempt.current_grade_id) throw new ApiError(409, 'Câu này chưa có điểm hoặc đang được xem lại.');
  const recent = await db
    .prepare('SELECT count(*) AS n FROM disputes WHERE learner_id=? AND created_at>?')
    .bind(learnerId, new Date(now.getTime() - 86400000).toISOString())
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= DISPUTES_PER_DAY) throw new ApiError(429, 'Hôm nay đã gửi nhiều phản đối. Nhờ phụ huynh xem giúp.');
  const id = makeId('dsp_'),
    stamp = now.toISOString();
  // Status changes only from 'graded', so a double click cannot open two disputes.
  const [, changed] = (await db.batch([
    db
      .prepare(
        `INSERT INTO disputes(id,attempt_id,grade_id,learner_id,raised_by,reason,message,recheck_requested,status,created_at)
         SELECT ?,?,?,?,?,?,?,?,'open',? WHERE EXISTS(SELECT 1 FROM attempts WHERE id=? AND status='graded' AND current_grade_id=?)`,
      )
      .bind(id, attemptId, attempt.current_grade_id, learnerId, raisedBy, input.reason, input.message, input.recheck ? 1 : 0, stamp, attemptId, attempt.current_grade_id),
    db.prepare("UPDATE attempts SET status='disputed' WHERE id=? AND status='graded' AND EXISTS(SELECT 1 FROM disputes WHERE id=?)").bind(attemptId, id),
  ])) as { meta?: { changes?: number } }[];
  if (!changed?.meta?.changes) throw new ApiError(409, 'Câu này vừa được phản đối. Tải lại để xem.');
  await recomputeAttemptSkills(db, learnerId, attempt.skill_ids, now);

  let status = 'open',
    jobId: string | null = null;
  if (input.recheck) {
    const rechecked = await db
      .prepare("SELECT 1 AS found FROM disputes WHERE attempt_id=? AND id<>? AND resolved_by='ai' LIMIT 1")
      .bind(attemptId, id)
      .first();
    // One AI recheck per answer; after that, or without budget, a parent or admin decides.
    const job = rechecked
      ? null
      : await enqueue(db, bindings, { learnerId, kind: 'assess', purpose: 'recheck', refId: id, subjectId: attempt.subject_id }, now).catch((error) => {
          console.error('Recheck job not queued:', error instanceof Error ? error.message : error);
          return null;
        });
    jobId = job?.id ? String(job.id) : null;
    status = jobId ? 'rechecking' : 'needs_human';
    await db.prepare('UPDATE disputes SET status=? WHERE id=?').bind(status, id).run();
  }
  return { id, status, jobId };
}

/** Still disagreeing after an AI decision (or never asked for one): a parent, or the admin for adults, decides. */
export async function escalateDispute(db: EvidenceDb, learnerId: string, id: string) {
  const result = await db
    .prepare("UPDATE disputes SET status='needs_human' WHERE id=? AND learner_id=? AND status IN ('open','upheld')")
    .bind(id, learnerId)
    .run();
  if (!result.meta.changes) throw new ApiError(409, 'Phản đối này không chuyển được nữa.');
  return { id, status: 'needs_human' };
}

/** Final decision by a parent or admin: keep, set a grade, or void the item. */
export async function resolveDispute(db: EvidenceDb, learnerId: string, id: string, resolver: { id: string; asAdmin: boolean }, input: Resolution, now = new Date()) {
  const dispute = await db
    .prepare(
      `SELECT d.id,d.attempt_id,d.grade_id,d.status,a.skill_ids,a.lesson_id,a.item_id,g.grader,g.result FROM disputes d
       JOIN attempts a ON a.id=d.attempt_id JOIN grades g ON g.id=d.grade_id WHERE d.id=? AND d.learner_id=?`,
    )
    .bind(id, learnerId)
    .first<{ id: string; attempt_id: string; grade_id: string; status: string; skill_ids: string; lesson_id: string; item_id: string; grader: string; result: string }>();
  if (!dispute) throw new ApiError(404, 'Không tìm thấy phản đối.');
  if (!['open', 'needs_human', 'upheld'].includes(dispute.status)) throw new ApiError(409, 'Phản đối đã được xử lý hoặc đang chấm lại.');
  const stamp = now.toISOString();
  const statements = [
    db
      .prepare(`UPDATE disputes SET status=?,resolved_by=?,resolution_note=?,resolved_at=? WHERE id=? AND status IN ('open','needs_human','upheld')`)
      .bind(
        input.decision === 'void' ? 'item_void' : input.decision === 'set' && input.result !== dispute.result ? 'overturned' : 'closed',
        resolver.id,
        input.note,
        stamp,
        id,
      ),
  ];
  // Every following write requires the claim above, so two parents cannot both decide.
  const claimed = 'EXISTS(SELECT 1 FROM disputes WHERE id=? AND resolved_at=? AND resolved_by=?)';
  const claimArgs = [id, stamp, resolver.id];
  if (input.decision === 'keep')
    statements.push(db.prepare(`UPDATE attempts SET status='graded' WHERE id=? AND status='disputed' AND ${claimed}`).bind(dispute.attempt_id, ...claimArgs));
  else if (input.decision === 'void')
    statements.push(
      db.prepare(`UPDATE attempts SET status='void' WHERE id=? AND ${claimed}`).bind(dispute.attempt_id, ...claimArgs),
      db
        .prepare(`UPDATE lesson_items SET flag='item_void' WHERE lesson_id=? AND item_id=? AND learner_id=? AND ${claimed}`)
        .bind(dispute.lesson_id, dispute.item_id, learnerId, ...claimArgs),
    );
  else {
    const gradeId = makeId('gr_');
    statements.push(
      db
        .prepare(
          `INSERT INTO grades(id,attempt_id,grader,result,score,feedback,correction,errors,created_at) SELECT ?,?,?,?,?,?,'','[]',? WHERE ${claimed}`,
        )
        .bind(gradeId, dispute.attempt_id, resolver.asAdmin ? 'admin' : 'guardian', input.result, input.score, input.feedback, stamp, ...claimArgs),
      db.prepare(`UPDATE grades SET superseded_by=? WHERE id=? AND ${claimed}`).bind(gradeId, dispute.grade_id, ...claimArgs),
      db
        .prepare(`UPDATE attempts SET status='graded',current_grade_id=? WHERE id=? AND ${claimed}`)
        .bind(gradeId, dispute.attempt_id, ...claimArgs),
      db.prepare(`UPDATE disputes SET resolution_grade_id=? WHERE id=? AND ${claimed}`).bind(gradeId, id, ...claimArgs),
    );
    // An automatic key that a parent overrules is a faulty answer key; the planner sees it in grading quality.
    if (dispute.grader === 'auto' && input.result !== dispute.result)
      statements.push(
        db
          .prepare(`UPDATE lesson_items SET flag='key_issue' WHERE lesson_id=? AND item_id=? AND learner_id=? AND flag IS NULL AND ${claimed}`)
          .bind(dispute.lesson_id, dispute.item_id, learnerId, ...claimArgs),
      );
  }
  const [first] = (await db.batch(statements)) as { meta?: { changes?: number } }[];
  if (!first?.meta?.changes) throw new ApiError(409, 'Phản đối vừa được người khác xử lý.');
  await recomputeAttemptSkills(db, learnerId, dispute.skill_ids, now);
  return readDispute(db, learnerId, id);
}

export async function readDispute(db: EvidenceDb, learnerId: string, id: string) {
  const row = await db
    .prepare(
      'SELECT id,attempt_id,grade_id,reason,message,recheck_requested,status,resolution_grade_id,resolution_note,created_at,resolved_at FROM disputes WHERE id=? AND learner_id=?',
    )
    .bind(id, learnerId)
    .first<Record<string, unknown>>();
  if (!row) throw new ApiError(404, 'Không tìm thấy phản đối.');
  return disputeView(row);
}

function disputeView(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    attemptId: row.attempt_id as string,
    gradeId: row.grade_id as string,
    reason: row.reason as DisputeReason,
    message: row.message as string,
    recheckRequested: row.recheck_requested === 1,
    status: row.status as string,
    resolutionGradeId: (row.resolution_grade_id as string | null) ?? null,
    resolutionNote: (row.resolution_note as string | null) ?? null,
    createdAt: row.created_at as string,
    resolvedAt: (row.resolved_at as string | null) ?? null,
    ...(row.prompt !== undefined
      ? {
          lessonId: row.lesson_id as string,
          lessonTitle: (row.lesson_title as string | null) ?? '',
          subjectTitle: (row.subject_title as string | null) ?? '',
          prompt: (row.prompt as string | null) ?? '',
          answer: row.answer as string,
          grade: { grader: row.grader as string, result: row.result as string, score: row.score as number, feedback: row.feedback as string },
        }
      : {}),
  };
}

/** Disputes of one learner with the item, answer and disputed grade, newest first. */
export async function listDisputes(db: EvidenceDb, learnerId: string, filter: 'open' | 'all' = 'all') {
  const { results = [] } = await db
    .prepare(
      `SELECT d.*,a.lesson_id,a.answer,json_extract(i.payload,'$.prompt') AS prompt,json_extract(l.payload,'$.title') AS lesson_title,s.title AS subject_title,
         g.grader,g.result,g.score,g.feedback
       FROM disputes d JOIN attempts a ON a.id=d.attempt_id JOIN lesson_items i ON i.lesson_id=a.lesson_id AND i.item_id=a.item_id
       JOIN learning_lessons l ON l.id=a.lesson_id JOIN subjects s ON s.id=l.subject_id JOIN grades g ON g.id=d.grade_id
       WHERE d.learner_id=? ${filter === 'open' ? `AND d.status IN ${OPEN}` : ''} ORDER BY d.created_at DESC LIMIT 50`,
    )
    .bind(learnerId)
    .all<Record<string, unknown>>();
  return results.map(disputeView);
}

/** Admin view: every dispute that waits for a person. */
export async function listDisputesNeedingHuman(db: EvidenceDb) {
  const { results = [] } = await db
    .prepare(
      `SELECT d.*,a.lesson_id,a.answer,json_extract(i.payload,'$.prompt') AS prompt,json_extract(l.payload,'$.title') AS lesson_title,s.title AS subject_title,
         g.grader,g.result,g.score,g.feedback
       FROM disputes d JOIN attempts a ON a.id=d.attempt_id JOIN lesson_items i ON i.lesson_id=a.lesson_id AND i.item_id=a.item_id
       JOIN learning_lessons l ON l.id=a.lesson_id JOIN subjects s ON s.id=l.subject_id JOIN grades g ON g.id=d.grade_id
       WHERE d.status='needs_human' ORDER BY d.created_at LIMIT 100`,
    )
    .all<Record<string, unknown>>();
  return results.map((row) => ({ ...disputeView(row), learnerId: row.learner_id as string }));
}
