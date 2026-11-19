import { aiSubjectEnabled } from '../ai-controls.ts';
import type { EvidenceDb } from '../evidence/submit.ts';
import { berlinDay, cutoffFor } from '../daily-policy.ts';
import { addDays } from '../learner-model/rules.ts';
import { ApiError } from '../api-error.ts';
import { primaryBlocksDailySql, wholeLessonSubmissionSql } from './daily-eligibility.ts';
import { usesAdaptivePlan } from '../subjects/sql.ts';
export type QueueBindings = {
  ENVIRONMENT?: string;
  OPENAI_ENABLED?: string;
  OPENAI_SUBJECT_IDS?: string;
  OPENAI_TTS_SUBJECT_IDS?: string;
  ADAPTIVE_PILOT_SUBJECT_ID?: string;
  AI_JOBS_DAILY_CAP?: string;
  AI_QUEUE?: { send(body: unknown): Promise<unknown> };
  AI_DISPATCH_URL?: string;
  AI_DISPATCH_SECRET?: string;
  HUB2_ENABLED?: string;
};

export async function dispatchJob(
  bindings: QueueBindings,
  job: { id: string; kind: string; purpose: string; priority: number },
  now = new Date(),
  fetcher: typeof fetch = fetch,
) {
  if (bindings.AI_QUEUE) await bindings.AI_QUEUE.send({ jobId: job.id, kind: job.kind, purpose: job.purpose });
  if (bindings.AI_DISPATCH_URL && bindings.AI_DISPATCH_SECRET) {
    const url = new URL(bindings.AI_DISPATCH_URL);
    if (url.protocol !== 'https:') throw new Error('Webhook must use HTTPS.');
    const stamp = String(Math.floor(now.getTime() / 1000)),
      body = JSON.stringify({ event: 'job.queued', jobId: job.id, kind: job.kind, purpose: job.purpose, priority: job.priority });
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(bindings.AI_DISPATCH_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(stamp + '.' + body));
    const hex = Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, '0')).join('');
    const response = await fetcher(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-LH-Timestamp': stamp, 'X-LH-Signature': 'sha256=' + hex },
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Dispatch failed; job remains queued.');
  }
}
export async function enqueue(
  db: EvidenceDb,
  bindings: QueueBindings,
  input: {
    learnerId: string;
    kind: 'plan' | 'assess';
    purpose: 'daily' | 'initial' | 'request' | 'submission' | 'recheck';
    subjectId?: string | null;
    refId?: string | null;
    /** Stable scheduler invocation identity; retries reuse it, later checks can create another daily job. */
    dailyRunId?: string;
    manualRunId?: string;
    adaptiveRequest?: boolean;
    learningDay?: string;
    submittedPrimaryId?: string;
    /** Wait for the nightly runner instead of asking for an answer now. */
    tonight?: boolean;
  },
  now = new Date(),
) {
  const subject = input.subjectId && (input.purpose === 'daily' || input.adaptiveRequest)
    ? await db.prepare('SELECT id,legacy_track FROM subjects WHERE id=? AND learner_id=?')
      .bind(input.subjectId, input.learnerId).first<{ id: string; legacy_track: string | null }>()
    : null;
  const adaptive = input.kind === 'assess'
    ? !!input.subjectId && input.subjectId === bindings.ADAPTIVE_PILOT_SUBJECT_ID
    : !!subject && usesAdaptivePlan(subject.id, subject.legacy_track, bindings.ADAPTIVE_PILOT_SUBJECT_ID);
  const day = input.learningDay ?? berlinDay(now),
    stamp = now.toISOString(),
    dailyKey = input.manualRunId ? 'manual:' + input.manualRunId : input.subjectId && adaptive ? day : input.dailyRunId ?? stamp,
    dedupe =
      input.kind +
      ':' +
      input.purpose +
      ':' +
      input.learnerId +
      ':' +
      (input.purpose === 'daily' ? (input.subjectId ? input.subjectId + ':' : '') + dailyKey : (input.refId ?? input.subjectId ?? day));
  const existing = await db
    .prepare('SELECT id,status,trigger,kind,purpose,priority FROM ai_jobs WHERE dedupe_key=?')
    .bind(dedupe)
    .first<Record<string, unknown>>();
  if (existing) return { ...existing, created: false };
  const setting = await db
    .prepare('SELECT role,ai_budget FROM learner_settings WHERE user_id=?')
    .bind(input.learnerId)
    .first<{ role: string; ai_budget: string | null }>();
  const adult = setting?.role !== 'child',
    budget = JSON.parse(setting?.ai_budget ?? '{}');
  const cap = Number(bindings.AI_JOBS_DAILY_CAP ?? 300);
  if (!Number.isInteger(cap) || cap < 1 || cap > 10000) throw new Error('Invalid job daily cap.');
  let trigger = input.purpose === 'daily' ? 'scheduled' : input.tonight ? 'deferred' : 'on_demand';
  let priority =
    input.purpose === 'recheck' ? 90 : input.purpose === 'submission' ? 80 : input.purpose === 'request' ? 60 : input.purpose === 'initial' ? 50 : 40;
  const used = await db
    .prepare("SELECT count(*) AS n FROM ai_jobs WHERE learner_id=? AND learning_day=? AND purpose=? AND trigger='on_demand'")
    .bind(input.learnerId, day, input.purpose)
    .first<{ n: number }>();
  const limit =
    input.purpose === 'submission'
      ? Number(budget.assessPerDay ?? 60)
      : input.purpose === 'recheck'
        ? Number(budget.recheckPerDay ?? (adult ? 10 : 5))
        : input.purpose === 'request' && !adaptive
          ? Number(budget.requestNowPerDay ?? (adult ? 3 : 2))
          : Infinity;
  if ((used?.n ?? 0) >= limit) {
    if (input.purpose === 'recheck') return { id: null, status: 'needs_human', trigger: 'deferred', created: false };
    trigger = 'deferred';
    priority = 20;
  }
  // Photos can only go to a runner that declares it reads images.
  const vision =
    input.kind === 'assess' && input.refId
      ? (
          await db
            .prepare(
              input.purpose === 'recheck'
                ? "SELECT EXISTS(SELECT 1 FROM disputes d JOIN attempts a ON a.id=d.attempt_id WHERE d.id=? AND a.attachment_ids<>'[]') AS v"
                : "SELECT EXISTS(SELECT 1 FROM attempts WHERE submission_id=? AND attachment_ids<>'[]') AS v",
            )
            .bind(input.refId)
            .first<{ v: number }>()
        )?.v
        ? 1
        : 0
      : 0;
  const id = 'job_' + crypto.randomUUID().replaceAll('-', '').slice(0, 20),
    expires = input.purpose === 'daily' ? cutoffFor(addDays(day, 1)) : new Date(now.getTime() + 36 * 3600000).toISOString();
  // Bound both system and per-learner budgets in SQL to prevent concurrent requests exceeding caps.
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO ai_jobs(id,kind,purpose,trigger,learner_id,subject_id,ref_id,learning_day,priority,status,dedupe_key,created_at,updated_at,expires_at,needs_vision,adaptive)
 SELECT ?,?,?,CASE WHEN ?='on_demand' AND (SELECT count(*) FROM ai_jobs WHERE learner_id=? AND learning_day=? AND purpose=? AND trigger='on_demand')>=? THEN 'deferred' ELSE ? END,?,?,?,?,?, 'queued',?,?,?,?,?,? WHERE (SELECT count(*) FROM ai_jobs WHERE learning_day=?)<? AND (? IS NULL OR EXISTS(SELECT 1 FROM learning_lessons l JOIN subjects s ON s.id=l.subject_id AND s.learner_id=l.user_id JOIN user u ON u.id=l.user_id WHERE l.id=? AND l.user_id=? AND l.subject_id=? AND l.slot='primary' AND (${wholeLessonSubmissionSql})<?
   AND s.legacy_track IS NULL AND s.status='active' AND s.ai_enabled=1 AND u.status='active'
   AND NOT EXISTS(SELECT 1 FROM learning_lessons l WHERE l.user_id=s.learner_id AND l.subject_id=s.id AND l.slot='primary'
     AND (${primaryBlocksDailySql(true)}))))`,
    )
    .bind(
      id,
      input.kind,
      input.purpose,
      trigger,
      input.learnerId,
      day,
      input.purpose,
      Number.isFinite(limit) ? limit : 10000,
      trigger,
      input.learnerId,
      input.subjectId ?? null,
      input.refId ?? null,
      day,
      priority,
      dedupe,
      stamp,
      stamp,
      expires,
      vision,
      Number(adaptive),
      day,
      cap,
      input.submittedPrimaryId ?? null, input.submittedPrimaryId ?? null, input.learnerId, input.subjectId ?? null, cutoffFor(day), day, cutoffFor(day),
    )
    .run();
  const saved = await db
    .prepare('SELECT id,status,trigger,kind,purpose,priority FROM ai_jobs WHERE dedupe_key=?')
    .bind(dedupe)
    .first<{ id: string; status: string; trigger: string; kind: string; purpose: string; priority: number }>();
  if (!saved && input.submittedPrimaryId) return { id: null, status: 'unchanged', trigger, created: false };
  if (!saved) throw new ApiError(429, 'Hết ngân sách công việc trong ngày; không thay bài đang học.');
  const created = !!result.meta.changes;
  if (input.subjectId && await aiSubjectEnabled(db, bindings, input.subjectId) && saved.status === 'queued' &&
      (saved.trigger !== 'deferred' || input.purpose === 'submission' || input.purpose === 'recheck')) {
    await bindings.AI_QUEUE?.send({ jobId: saved.id }).catch(() => console.error('OpenAI dispatch unavailable; queued job retained.'));
  } else if (created && !adaptive) {
    if (saved.trigger === 'on_demand')
      await dispatchJob(bindings, saved, now).catch(() => console.error('Dispatch unavailable; queued job retained.'));
  }
  return { ...saved, created };
}
export async function queueSubmission(db: EvidenceDb, bindings: QueueBindings, learnerId: string, id: string, now = new Date()) {
  const { results = [] } = await db
    .prepare('SELECT a.status,g.result FROM attempts a LEFT JOIN grades g ON g.id=a.current_grade_id WHERE a.learner_id=? AND a.submission_id=?')
    .bind(learnerId, id)
    .all<{ status: string; result: string | null }>();
  if (!results.length || (results.every((a) => a.status === 'graded') && results.filter((a) => a.result === 'incorrect').length <= 1)) return null;
  const sub = await db
    .prepare("SELECT l.subject_id,s.ai_job_id,json_extract(l.payload,'$.gradingMode') AS grading_mode FROM submissions s JOIN learning_lessons l ON l.id=s.lesson_id WHERE s.id=? AND s.learner_id=?")
    .bind(id, learnerId)
    .first<{ subject_id: string; ai_job_id: string | null; grading_mode: string | null }>();
  if (!sub || (sub.grading_mode === 'whole-lesson' && results.every(a => a.status === 'graded'))) return null;
  const job = await enqueue(db, bindings, { learnerId, kind: 'assess', purpose: 'submission', subjectId: sub.subject_id, refId: id }, now);
  // Only link the job; never move a graded submission back to waiting (a replay returns the same job).
  await db.prepare('UPDATE submissions SET ai_job_id=? WHERE id=? AND learner_id=? AND ai_job_id IS NULL').bind(job.id, id, learnerId).run();
  return job;
}
export async function queueDaily(db: EvidenceDb, bindings: QueueBindings, now: Date) {
  const day = berlinDay(now);
  // One plan job per notebook keeps each lease, context and apply within the Free CPU and D1 query budget.
  const { results = [] } = await db
    .prepare(
      `SELECT s.id, s.learner_id FROM subjects s JOIN user u ON u.id=s.learner_id
       WHERE s.status='active' AND s.ai_enabled=1 AND u.status='active' AND NOT EXISTS(
         SELECT 1 FROM learning_lessons l WHERE l.subject_id=s.id AND l.user_id=s.learner_id AND l.package_version IN ('2','3')
         AND CASE WHEN s.legacy_track IS NULL OR s.id=? THEN
           l.slot='primary' AND (${primaryBlocksDailySql(true)})
         ELSE l.completed_at IS NULL END
       ) AND NOT EXISTS(SELECT 1 FROM ai_jobs j WHERE j.learner_id=s.learner_id AND j.subject_id=s.id AND j.kind='plan' AND j.purpose='daily' AND j.trigger='scheduled' AND j.learning_day=?) ORDER BY s.learner_id,s.weight DESC,s.id`,
    )
    .bind(bindings.ADAPTIVE_PILOT_SUBJECT_ID ?? '', day, cutoffFor(day), day)
    .all<{ id: string; learner_id: string }>();
  // One notebook's failure (daily cap, D1 hiccup) must not stop the others.
  let failed = 0;
  for (const r of results) {
    try {
      await enqueue(db, bindings, { learnerId: r.learner_id, kind: 'plan', purpose: 'daily', subjectId: r.id,dailyRunId:now.toISOString() }, now);
    } catch (error) {
      failed++;
      console.error('Daily plan job not queued:', error instanceof Error ? error.message : error);
    }
  }
  return { subjects: results.length, failed };
}

/** Prepare the next Berlin day after a whole-lesson submission in a scheduled custom notebook. */
export async function queuePreparedDaily(db: EvidenceDb, bindings: QueueBindings, learnerId: string, lessonId: string, now = new Date()) {
  const row = await db.prepare("SELECT l.subject_id FROM learning_lessons l JOIN subjects s ON s.id=l.subject_id AND s.learner_id=l.user_id WHERE l.id=? AND l.user_id=? AND l.slot='primary' AND s.legacy_track IS NULL AND s.status='active' AND s.ai_enabled=1")
    .bind(lessonId, learnerId).first<{subject_id:string}>();
  if (!row) return null;
  const learningDay = addDays(berlinDay(now), 1);
  return enqueue(db, bindings, {learnerId, subjectId:row.subject_id, kind:'plan', purpose:'daily', learningDay, refId:lessonId, submittedPrimaryId:lessonId}, now);
}
