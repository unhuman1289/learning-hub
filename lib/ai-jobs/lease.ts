import type { TtsVoices } from '../contracts/lesson-package-v3.ts';
import type { PlanContext } from '../contracts/ai-common.ts';
import type { EvidenceDb } from '../evidence/submit.ts';
import { berlinDay } from '../daily-policy.ts';
import { ApiError } from '../api-error.ts';
import { sha256Hex, type AutomationClient } from '../auth/automation.ts';
import { buildPlanContext } from './context/plan.ts';
import { buildAssessContext } from './context/assess.ts';
import type { Job } from './context/common.ts';
export async function readJob(db: EvidenceDb, id: string) {
  return db.prepare('SELECT * FROM ai_jobs WHERE id=?').bind(id).first<Job>();
}
export function permits(client: AutomationClient, job: Pick<Job, 'kind' | 'purpose' | 'trigger' | 'learner_id'>) {
  return (
    client.scopes.includes(job.kind === 'plan' ? 'jobs:plan' : 'jobs:assess') &&
    !!client.purposes?.includes(job.purpose) &&
    !!client.triggers?.includes(job.trigger) &&
    (!client.learnerIds || client.learnerIds.includes(job.learner_id))
  );
}
/** At most one write a minute per client: polling every 15 s must not spend the D1 write budget. */
export async function recordPresence(db: EvidenceDb, clientId: string, runner: unknown, capabilities: string[], now = new Date()) {
  const stamp = now.toISOString();
  await db
    .prepare(
      'INSERT INTO runner_presence(client_id,runner,capabilities,last_seen_at) VALUES(?,?,?,?) ON CONFLICT(client_id) DO UPDATE SET runner=excluded.runner,capabilities=excluded.capabilities,last_seen_at=excluded.last_seen_at WHERE runner_presence.last_seen_at<? OR runner_presence.runner<>excluded.runner OR runner_presence.capabilities<>excluded.capabilities',
    )
    .bind(clientId, JSON.stringify(runner).slice(0, 400), JSON.stringify(capabilities), stamp, new Date(now.getTime() - 60000).toISOString())
    .run();
}
/** The grading runner counts as online when it asked for work within the last 3 minutes. */
export async function runnerStatus(db: EvidenceDb, clientId: string, now = new Date()) {
  const row = await db.prepare('SELECT last_seen_at FROM runner_presence WHERE client_id=?').bind(clientId).first<{ last_seen_at: string }>();
  const lastSeenAt = row?.last_seen_at ?? null;
  return { online: !!lastSeenAt && Date.parse(lastSeenAt) >= now.getTime() - 3 * 60000, lastSeenAt };
}
export async function maintainJobs(db: EvidenceDb, now = new Date()) {
  const stamp = now.toISOString();
  await db.batch([
    db
      .prepare("UPDATE ai_jobs SET status='expired',finished_at=?,updated_at=? WHERE status IN ('queued','leased') AND expires_at<=?")
      .bind(stamp, stamp, stamp),
    db
      .prepare(
        "UPDATE ai_jobs SET status=CASE WHEN lease_count>=3 THEN 'failed' ELSE 'queued' END,error='Lease hết hạn',finished_at=CASE WHEN lease_count>=3 THEN ? ELSE NULL END,lease_token_sha256=NULL,lease_expires_at=NULL,apply_token=NULL,updated_at=? WHERE status='leased' AND lease_expires_at<=?",
      )
      .bind(stamp, stamp, stamp),
    db
      .prepare("UPDATE ai_jobs SET trigger='deferred',priority=20,updated_at=? WHERE status='queued' AND trigger='on_demand' AND created_at<?")
      .bind(stamp, new Date(now.getTime() - 15 * 60000).toISOString()),
  ]);
}
export async function leaseJobs(
  db: EvidenceDb,
  client: AutomationClient,
  input: { kinds: string[]; subjectIds?: string[]; excludeSubjectIds?: string[]; jobId?: string; textOnly?: boolean; purposes?: string[]; triggers?: string[]; max: number; runner: { name: string; version: string; model: string }; capabilities?: string[]; ttsVoices?: TtsVoices },
  environment: string,
  now = new Date(),
) {
  if(input.subjectIds && !input.subjectIds.length) return [];
  await maintainJobs(db, now);
  const kinds = input.kinds.filter((k) => client.scopes.includes(k === 'plan' ? 'jobs:plan' : 'jobs:assess'));
  const purposes = (client.purposes ?? []).filter((x) => !input.purposes || input.purposes.includes(x));
  const triggers = (client.triggers ?? []).filter((x) => !input.triggers || input.triggers.includes(x));
  if (!kinds.length || !purposes.length || !triggers.length) throw new ApiError(403, 'Client không được lease loại công việc này.');
  await recordPresence(db, client.id, input.runner, input.capabilities ?? [], now);
  const languages = Object.keys(input.ttsVoices ?? {}) as NonNullable<PlanContext['tts']>['languages'];
  const tts = input.capabilities?.includes('tts') && input.ttsVoices && languages.length
    ? { languages, voices: input.ttsVoices } : undefined;
  const vision = input.capabilities?.includes('vision') && client.scopes.includes('attachments:read') ? 1 : 0;
  const packageFilter = input.capabilities?.includes('lesson-v3') ? '' : `
    AND kind<>'plan'
    AND (kind<>'assess' OR NOT EXISTS(
      SELECT 1 FROM learning_lessons l WHERE l.user_id=ai_jobs.learner_id AND l.package_version='3' AND l.id=CASE ai_jobs.purpose
        WHEN 'submission' THEN (SELECT s.lesson_id FROM submissions s WHERE s.id=ai_jobs.ref_id AND s.learner_id=ai_jobs.learner_id)
        WHEN 'recheck' THEN (SELECT a.lesson_id FROM disputes d JOIN attempts a ON a.id=d.attempt_id WHERE d.id=ai_jobs.ref_id AND a.learner_id=ai_jobs.learner_id)
      END
    ))`;
  const jobs = [];
  const placeholders = (x: unknown[]) => x.map(() => '?').join(',');
  for (let n = 0; n < input.max; n++) {
    const token = crypto.randomUUID() + crypto.randomUUID(),
      hash = await sha256Hex(token),
      stamp = now.toISOString();
    const job = await db
      .prepare(
        `UPDATE ai_jobs SET status='leased',learning_day=CASE WHEN kind='plan' AND purpose<>'daily' THEN ? ELSE learning_day END,lease_client_id=?,lease_token_sha256=?,lease_expires_at=strftime('%Y-%m-%dT%H:%M:%fZ',?,CASE WHEN kind='plan' THEN '+60 minutes' ELSE '+10 minutes' END),lease_count=lease_count+1,context_snapshot=NULL,context_hash=NULL,runner=?,updated_at=? WHERE id=(SELECT id FROM ai_jobs WHERE status='queued' AND kind IN (${placeholders(kinds)}) AND purpose IN (${placeholders(purposes)}) AND trigger IN (${placeholders(triggers)}) AND expires_at>? AND needs_vision<=? AND (adaptive=0 OR (kind='plan' AND ?=1) OR (kind='assess' AND purpose='submission' AND ?=1) OR (kind='assess' AND purpose='recheck' AND ?=1)) AND NOT (purpose='request' AND trigger='deferred' AND learning_day>=? AND created_at=updated_at AND EXISTS (SELECT 1 FROM learner_requests r WHERE r.id=ai_jobs.ref_id AND r.kind='extra_practice')) ${client.learnerIds ? 'AND learner_id IN (SELECT value FROM json_each(?))' : ''} ${input.subjectIds ? 'AND subject_id IN (' + placeholders(input.subjectIds) + ')' : ''} ${input.textOnly ? `AND NOT EXISTS (SELECT 1 FROM attempts a WHERE a.learner_id=ai_jobs.learner_id AND a.attachment_ids<>'[]' AND (a.submission_id=ai_jobs.ref_id OR a.id=(SELECT attempt_id FROM disputes WHERE id=ai_jobs.ref_id AND learner_id=ai_jobs.learner_id)))` : ''} ${input.jobId ? 'AND id=?' : ''} ${input.excludeSubjectIds?.length ? 'AND (subject_id IS NULL OR subject_id NOT IN (SELECT value FROM json_each(?)))' : ''} ${packageFilter} ORDER BY priority DESC,created_at,id LIMIT 1) AND status='queued' RETURNING *`,
      )
      .bind(
        berlinDay(now),
        client.id,
        hash,
        stamp,
        JSON.stringify(input.runner),
        stamp,
        ...kinds,
        ...purposes,
        ...triggers,
        stamp,
        vision,
        Number(input.capabilities?.includes('adaptive-plan') ?? false),
        Number(input.capabilities?.includes('local-grading') ?? false),
        Number(input.capabilities?.includes('adaptive-plan') ?? false),
        berlinDay(now),
        ...(client.learnerIds ? [JSON.stringify(client.learnerIds)] : []),
        ...(input.subjectIds ?? []),
        ...(input.jobId ? [input.jobId] : []),
        ...(input.excludeSubjectIds?.length ? [JSON.stringify(input.excludeSubjectIds)] : []),
      )
      .first<Job>();
    if (!job) break;
    try {
      const context = job.kind === 'plan' ? await buildPlanContext(db, job, environment, input.capabilities?.includes('roadmap-v2') ?? false, tts) : await buildAssessContext(db, job, environment, now);
      const changed = await db
        .prepare("UPDATE ai_jobs SET context_snapshot=?,context_hash=? WHERE id=? AND status='leased' AND lease_token_sha256=?")
        .bind(JSON.stringify(context), context.contextHash, job.id, hash)
        .run();
      if (!changed.meta.changes) throw new ApiError(409, 'Lease đã thay đổi khi dựng ngữ cảnh.');
      jobs.push({
        jobId: job.id,
        ...(job.adaptive ? { adaptive: true } : {}),
        kind: job.kind,
        purpose: job.purpose,
        trigger: job.trigger,
        leaseToken: token,
        leaseExpiresAt: job.lease_expires_at,
        contextUrl: `/api/automation/v2/jobs/${job.id}/context`,
      });
    } catch (error) {
      await db
        .prepare(
          "UPDATE ai_jobs SET status=CASE WHEN lease_count>=3 THEN 'failed' ELSE 'queued' END,finished_at=CASE WHEN lease_count>=3 THEN ? ELSE NULL END,lease_token_sha256=NULL,lease_expires_at=NULL,error='Không dựng được ngữ cảnh an toàn',updated_at=? WHERE id=? AND lease_token_sha256=?",
        )
        .bind(stamp, stamp, job.id, hash)
        .run();
      // Jobs already leased in this call must reach the runner, or they sit locked until the lease expires.
      if (!jobs.length) throw error;
      console.error('Lease stopped after a context failure:', error instanceof Error ? error.message : error);
      break;
    }
  }
  return jobs;
}
export async function leasedJob(db: EvidenceDb, client: AutomationClient, id: string, token: string | null, now = new Date(), allowFinished = false) {
  const job = await readJob(db, id);
  if (!job || job.lease_client_id !== client.id || !permits(client, job)) throw new ApiError(404, 'Không tìm thấy công việc.');
  if (!token || (await sha256Hex(token)) !== job.lease_token_sha256) throw new ApiError(401, 'Lease token không hợp lệ.');
  if (allowFinished && job.status === 'succeeded') return job;
  if (job.status !== 'leased' || !job.lease_expires_at || job.lease_expires_at <= now.toISOString() || job.expires_at <= now.toISOString())
    throw new ApiError(410, 'Lease đã hết hạn. Đọc lại trạng thái công việc.');
  return job;
}
export async function heartbeat(db: EvidenceDb, client: AutomationClient, id: string, token: string | null, now = new Date()) {
  const job = await leasedJob(db, client, id, token, now);
  const contextTime = await db.prepare('SELECT updated_at FROM ai_jobs WHERE id=?').bind(id).first<{ updated_at: string }>();
  // Heartbeats may not extend past the original lease's bound or the job expiry.
  const cap = new Date(Date.parse(contextTime!.updated_at) + (job.kind === 'plan' ? 120 : 30) * 60000).getTime();
  const expires = new Date(Math.min(cap, Date.parse(job.expires_at), now.getTime() + (job.kind === 'plan' ? 60 : 10) * 60000)).toISOString();
  await db
    .prepare("UPDATE ai_jobs SET lease_expires_at=? WHERE id=? AND status='leased' AND lease_token_sha256=?")
    .bind(expires, id, job.lease_token_sha256)
    .run();
  return { leaseExpiresAt: expires };
}

/** A dispute owns the human-review state. Batch this before the terminal job update. */
export function recheckEscalation(db: EvidenceDb, job: Job, minimumValidationFailures: number) {
  return db
    .prepare(
      `UPDATE disputes SET status='needs_human'
       WHERE id=? AND learner_id=? AND status='rechecking' AND EXISTS(
         SELECT 1 FROM ai_jobs WHERE id=? AND status='leased' AND lease_token_sha256=?
           AND apply_token IS NULL AND validation_failures>=?
       )`,
    )
    .bind(job.ref_id, job.learner_id, job.id, job.lease_token_sha256, minimumValidationFailures);
}

export async function failLeasedJob(db: EvidenceDb, job: Job, retryable: boolean, now = new Date()) {
  const status = retryable && job.lease_count < 3 ? 'queued' : 'failed';
  const stamp = now.toISOString();
  // Runner text may contain answers or credentials.
  const update = db
    .prepare(
      "UPDATE ai_jobs SET status=?,error='Runner báo thất bại',updated_at=?,finished_at=?,lease_token_sha256=NULL,lease_expires_at=NULL WHERE id=? AND status='leased' AND lease_token_sha256=? AND apply_token IS NULL",
    )
    .bind(status, stamp, status === 'failed' ? stamp : null, job.id, job.lease_token_sha256);
  const changed = status === 'failed' && job.purpose === 'recheck'
    ? (await db.batch([recheckEscalation(db, job, 0), update]) as { meta: { changes?: number } }[])[1]
    : await update.run();
  if (!changed.meta.changes) throw new ApiError(409, 'Lease vừa thay đổi.');
  return { status };
}
