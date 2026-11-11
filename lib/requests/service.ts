import { ApiError } from '../api-error.ts';
import type { EvidenceDb } from '../evidence/submit.ts';
import { enqueue, type QueueBindings } from '../ai-jobs/queue.ts';
import { openWorkMinutesSql } from '../ai-jobs/open-work.ts';
import { berlinDay } from '../daily-policy.ts';
import { addDays } from '../learner-model/rules.ts';
import { containsContactDetails } from '../automation/privacy.ts';

/**
 * Requests to the planner (DATA-MODEL §2.1 learner_requests, PLAN H6.3).
 * explore and extra_practice become a plan job of their own; school_topic and note stay in the
 * notebook's context for 14 days.
 */
export type RequestKind = 'explore' | 'extra_practice' | 'school_topic' | 'note';
export type RequestInput = { kind: RequestKind; subjectId: string | null; text: string; urgency: 'tonight' | 'now' };

export const REQUESTS_PER_HOUR = 10;
const kinds = new Set(['explore', 'extra_practice', 'school_topic', 'note']);
const bad = (message: string) => new ApiError(400, message);
const makeId = () => 'req_' + Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(16).padStart(2, '0')).join('');

/** Planner instructions (school topics, notes) are set by adults: a child sends questions and practice requests. */
export const needsGoalAccess = (kind: RequestKind) => kind === 'school_topic' || kind === 'note';

export function parseRequest(body: unknown): RequestInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('Yêu cầu không hợp lệ.');
  const value = body as Record<string, unknown>;
  if (Object.keys(value).some((key) => !['kind', 'subjectId', 'text', 'urgency'].includes(key))) throw bad('Yêu cầu có trường lạ.');
  if (!kinds.has(value.kind as string)) throw bad('Loại yêu cầu không hợp lệ.');
  const note = typeof value.text === 'string' ? value.text.trim() : '';
  const text = !note && value.kind === 'extra_practice' ? 'Bài tiếp theo' : note;
  if (text.length < 3 || text.length > 2000) throw bad('Nội dung cần 3–2000 ký tự.');
  if (containsContactDetails(text)) throw bad('Bỏ email hoặc số điện thoại khỏi yêu cầu.');
  const subjectId = value.subjectId === undefined || value.subjectId === null ? null : String(value.subjectId);
  if (subjectId !== null && !/^sub_[A-Za-z0-9]{6,40}$/.test(subjectId)) throw bad('Sổ không hợp lệ.');
  const kind = value.kind as RequestKind;
  if (kind !== 'explore' && !subjectId) throw bad('Chọn sổ cho yêu cầu này.');
  const urgency = value.urgency === 'now' ? 'now' : 'tonight';
  return { kind, subjectId, text, urgency: kind === 'explore' || kind === 'extra_practice' ? urgency : 'tonight' };
}

export async function createRequest(db: EvidenceDb, bindings: QueueBindings, learnerId: string, createdBy: string, input: RequestInput, now = new Date()) {
  if (input.subjectId) {
    const subject = await db
      .prepare("SELECT 1 AS ok FROM subjects WHERE id=? AND learner_id=? AND status IN ('setup','active')")
      .bind(input.subjectId, learnerId)
      .first();
    if (!subject) throw new ApiError(404, 'Không tìm thấy sổ.');
  }
  const recent = await db
    .prepare('SELECT count(*) AS n FROM learner_requests WHERE learner_id=? AND created_at>?')
    .bind(learnerId, new Date(now.getTime() - 3600000).toISOString())
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= REQUESTS_PER_HOUR) throw new ApiError(429, 'Bạn vừa gửi nhiều yêu cầu. Thử lại sau một giờ.');
  const id = makeId(),
    stamp = now.toISOString(),
    lasting = needsGoalAccess(input.kind);
  await db
    .prepare(
      `INSERT INTO learner_requests(id,learner_id,subject_id,kind,text,urgency,created_by,status,active_until,created_at)
       VALUES(?,?,?,?,?,?,?,'queued',?,?)`,
    )
    .bind(id, learnerId, input.subjectId, input.kind, input.text, input.urgency, createdBy, lasting ? addDays(berlinDay(now), 14) : null, stamp)
    .run();
  if (lasting) return readRequest(db, learnerId, id);
  let tonight = input.urgency === 'tonight';
  if (input.kind === 'extra_practice' && !tonight) {
    const cap = await db.prepare(`SELECT
      (SELECT count(*) FROM learning_lessons WHERE user_id=? AND assigned_date=? AND slot='extra') AS used,
      CASE WHEN (SELECT role FROM learner_settings WHERE user_id=?)='child' THEN 2 ELSE 4 END AS cap,
      coalesce((SELECT daily_target_minutes FROM learner_settings WHERE user_id=?),45)*1.5 AS max_minutes,
      (${openWorkMinutesSql}) AS open_minutes`)
      .bind(learnerId, berlinDay(now), learnerId, learnerId, learnerId)
      .first<{ used: number; cap: number; max_minutes: number; open_minutes: number }>();
    // Even the shortest lesson allowed by lesson-package/2 needs five minutes.
    tonight = !!cap && (cap.used >= cap.cap || cap.open_minutes + 5 > cap.max_minutes);
  }
  // A full queue leaves the request queued; the admin sees the job cap alert.
  const job = await enqueue(
    db,
    bindings,
    { learnerId, kind: 'plan', purpose: 'request', subjectId: input.subjectId, refId: id, tonight },
    now,
  ).catch((error) => {
    console.error('Request job not queued:', error instanceof Error ? error.message : error);
    return null;
  });
  if (job?.id) await db.prepare("UPDATE learner_requests SET status='in_job',job_id=? WHERE id=? AND status='queued'").bind(job.id, id).run();
  return readRequest(db, learnerId, id);
}

function requestView(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    subjectId: (row.subject_id as string | null) ?? null,
    kind: row.kind as RequestKind,
    text: row.text as string,
    urgency: row.urgency as 'tonight' | 'now',
    byLearner: row.created_by === row.learner_id,
    status: row.status as string,
    deferred: row.job_trigger === 'deferred',
    jobStatus: (row.job_status as string | null) ?? null,
    activeUntil: (row.active_until as string | null) ?? null,
    resultLessonId: (row.result_lesson_id as string | null) ?? null,
    responseNote: (row.response_note as string | null) ?? null,
    createdAt: row.created_at as string,
    processedAt: (row.processed_at as string | null) ?? null,
  };
}

export async function readRequest(db: EvidenceDb, learnerId: string, id: string) {
  const row = await db.prepare('SELECT r.*,j.trigger AS job_trigger,j.status AS job_status FROM learner_requests r LEFT JOIN ai_jobs j ON j.id=r.job_id WHERE r.id=? AND r.learner_id=?').bind(id, learnerId).first<Record<string, unknown>>();
  if (!row) throw new ApiError(404, 'Không tìm thấy yêu cầu.');
  return requestView(row);
}

export async function listRequests(db: EvidenceDb, learnerId: string) {
  const { results = [] } = await db
    .prepare('SELECT r.*,j.trigger AS job_trigger,j.status AS job_status FROM learner_requests r LEFT JOIN ai_jobs j ON j.id=r.job_id WHERE r.learner_id=? ORDER BY r.created_at DESC,r.rowid DESC LIMIT 30')
    .bind(learnerId)
    .all<Record<string, unknown>>();
  return results.map(requestView);
}
