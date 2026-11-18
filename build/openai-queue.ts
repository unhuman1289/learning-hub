import { notifySavedFeedback } from '../lib/ai-jobs/feedback-signal.ts';
import { consumeCalibration, recoverCalibrationJobs } from './calibration-queue.ts';
import { answerTutor } from '../lib/tutor/openai.ts';
import { QueueAudioError, speechJobLimit, uploadOpenAiPlanAudio } from './openai-tts.ts';
import { uploadAudio } from '../lib/audio/upload.ts';
import { openAiGermanVoices } from '../lib/audio/openai-voices.ts';
import { openAiEngine } from '../integrations/home-runner/openai.mjs';
import { contractFor, processJob } from '../integrations/home-runner/job.mjs';
import { applyResult } from '../lib/ai-jobs/result.ts';
import { failLeasedJob, heartbeat, leasedJob, leaseJobs, readJob } from '../lib/ai-jobs/lease.ts';
import { aiSubjects } from '../lib/ai-controls.ts';
import type { AutomationClient } from '../lib/auth/automation';

const client: AutomationClient = {
  id: 'openai-staging',
  keySha256: '',
  accessClientId: '',
  scopes: ['jobs:plan', 'jobs:assess', 'attachments:read'],
  purposes: ['initial', 'daily', 'request', 'submission', 'recheck'],
  triggers: ['on_demand', 'scheduled', 'deferred'],
};

const contentEvents = new Set(['contract_error', 'listening_contract_error', 'local_duplicates', 'audio_validation_error', 'dry_run_422']);

function planFieldNames(node: unknown, fields: Set<string>) {
  if (!node || typeof node !== 'object') return fields;
  if ('properties' in node && node.properties && typeof node.properties === 'object')
    for (const field of Object.keys(node.properties)) fields.add(field);
  for (const child of Object.values(node)) planFieldNames(child, fields);
  return fields;
}

let planFields: Set<string> | undefined;
let assessFields: Set<string> | undefined;
function contentIssues(event: string, issues: unknown[] = []) {
  planFields ??= planFieldNames(contractFor('plan').json, new Set());
  const fields = planFields;
  return issues.slice(0, 10).map(issue => {
    const [code, path] = typeof issue === 'string' ? (event === 'local_duplicates' ? ['duplicate_item', issue] : issue.split(' ', 2))
      : issue && typeof issue === 'object' && 'code' in issue && 'path' in issue ? [issue.code, issue.path] : [];
    const safeCode = typeof code === 'string' && /^[a-z_]{1,40}$/.test(code) ? code : 'validation_failed';
    const safePath = typeof path === 'string' && path.startsWith('/')
      ? '/' + path.slice(1).split('/').slice(0, 16).map(part => fields.has(part) || /^[0-9]{1,3}$/.test(part) ? part : '*').join('/')
      : undefined;
    return { code: safeCode, ...(safePath ? { path: safePath } : {}) };
  });
}

/** Persist only known validator codes and schema paths, never model text. */
export function assessIssue(entry: {event:string; errors?:unknown[]}) {
  if (entry.event === 'engine_error') return 'engine_error';
  if (!['contract_error', 'dry_run_422'].includes(entry.event)) return null;
  assessFields ??= planFieldNames(contractFor('assess').json, new Set());
  const raw = entry.errors?.[0];
  const [code, path] = typeof raw === 'string' ? raw.split(' ', 2)
    : raw && typeof raw === 'object' && 'code' in raw && 'path' in raw ? [raw.code, raw.path] : [];
  const safeCode = typeof code === 'string' && /^[a-z_]{1,40}$/.test(code) ? code : 'validation_failed';
  const safePath = typeof path === 'string' && path.startsWith('/')
    ? '/' + path.slice(1).split('/').slice(0, 16).map(part => assessFields!.has(part) || /^[0-9]{1,3}$/.test(part) ? part : '*').join('/') : '';
  return `${entry.event}:${safeCode}${safePath ? ' ' + safePath : ''}`;
}

// A terminated Worker cannot execute a catch block. The scheduled sweep fences
// expired leases with exhausted model budgets before attempting redispatch.
export async function failExpiredOpenAiJobs(db: NonNullable<Cloudflare.Env['DB']>, now = new Date()) {
  const stamp = now.toISOString();
  await db.batch([
    db.prepare(`UPDATE disputes SET status='needs_human' WHERE status='rechecking' AND EXISTS (
      SELECT 1 FROM ai_jobs j WHERE j.ref_id=disputes.id AND j.learner_id=disputes.learner_id
        AND j.purpose='recheck' AND j.status='leased' AND j.lease_client_id=?
        AND j.lease_expires_at<=? AND j.openai_calls>=2 AND j.apply_token IS NULL)`)
      .bind(client.id, stamp),
    db.prepare(`UPDATE ai_jobs SET status='failed',error='Không hoàn tất được công việc sau khi gọi AI.',
      finished_at=?,updated_at=?,lease_token_sha256=NULL,lease_expires_at=NULL
      WHERE status='leased' AND lease_client_id=? AND lease_expires_at<=?
        AND openai_calls>=2 AND apply_token IS NULL`)
      .bind(stamp, stamp, client.id, stamp),
  ]);
}

export async function consumeOpenAi(batch: MessageBatch<{ jobId?: string; tutorTurnId?: string; calibrationJobId?: string }>, env: Cloudflare.Env, getPrompt: (kind: string, purpose: string) => string, fetcher = fetch, tutorPrompt = '') {
  const { DB: db, OPENAI_API_KEY: apiKey, UPLOADS: bucket } = env;
  const subjectIds = db ? await aiSubjects(db, env) : [];
  const ttsSubjectIds = db && apiKey && bucket ? await aiSubjects(db, env, true) : [];
  for (const message of batch.messages) {
    const calibrationId = message.body?.calibrationJobId;
    if (calibrationId && /^cal_[0-9a-f-]{36}$/.test(calibrationId)) {
      if (!db) { message.retry({delaySeconds:60}); continue; }
      try {
        const status = await consumeCalibration(db, env, calibrationId, getPrompt('assess','submission'), fetcher);
        if (status === 'unavailable') message.retry({delaySeconds:60}); else message.ack();
      } catch { message.retry({delaySeconds:60}); }
      continue;
    }
    const tutorId=message.body?.tutorTurnId;
    if (tutorId && /^tur_[0-9a-f-]{36}$/.test(tutorId)) {
      if (!db || !apiKey || !tutorPrompt) { message.retry({delaySeconds:60}); continue; }
      try {
        const outcome=await answerTutor(db,env,tutorId,tutorPrompt,()=>{},fetcher);
        if (outcome==='ineligible') await db.prepare(`UPDATE tutor_turns SET status='blocked' WHERE id=? AND status='queued'
          AND EXISTS(SELECT 1 FROM learning_lessons l WHERE l.id=tutor_turns.lesson_id AND l.completed_at IS NOT NULL)`).bind(tutorId).run();
        if (outcome==='queued' || outcome==='claimed') message.retry({delaySeconds:90}); else message.ack();
      } catch { message.retry({delaySeconds:90}); }
      continue;
    }
    const id = message.body?.jobId;
    if (!db || !id || !/^job_[0-9a-f]{20}$/.test(id) || !subjectIds.length) {
      message.ack();
      continue;
    }
    const job = await readJob(db, id);
    if (!job?.subject_id || !subjectIds.includes(job.subject_id) ||
      !['queued', 'leased'].includes(job.status)) {
      message.ack();
      continue;
    }
    if (!apiKey) {
      message.retry({ delaySeconds: 60 });
      continue;
    }
    let ownedLeaseHash: string | null = null;
    let stage = 'lease';
    let assessDiagnostic: string | null = null;
    try {
      const tts = job.kind === 'plan' && ttsSubjectIds.includes(job.subject_id);
      const [lease] = await leaseJobs(db, client, {
        kinds: [job.kind], subjectIds: [job.subject_id], jobId: id, max: 1,
        capabilities: ['adaptive-plan', 'local-grading', 'lesson-v3', 'roadmap-v2', 'vision', ...(tts ? ['tts'] : [])],
        ...(tts ? { ttsVoices: openAiGermanVoices } : {}),
        runner: { name: 'openai-staging', version: '1', model: 'openai' },
      }, 'staging');
      if (!lease) {
        const current = await readJob(db, id);
        if (current?.status === 'leased' && current.lease_client_id === client.id)
          message.retry({ delaySeconds: 60 });
        else message.ack();
        continue;
      }
      const token = lease.leaseToken;
      const active = await leasedJob(db, client, id, token);
      ownedLeaseHash = active.lease_token_sha256;
      let speechLimit = false;
      const logAudioFailure = (event: string, details: object) => console.warn(JSON.stringify({
        component: 'openai-queue-tts', jobId: id, leaseCount: active.lease_count, event, ...details,
      }));
      const engine = openAiEngine({ apiKey, kind: job.kind, purpose: job.purpose, fetcher, allowVision: true, beforeFetch: async () => {
        const counted = await db.prepare(`UPDATE ai_jobs SET openai_calls=openai_calls+1 WHERE id=? AND openai_calls<2
          AND status='leased' AND lease_token_sha256=? AND NOT EXISTS(SELECT 1 FROM ai_subject_controls WHERE subject_id=ai_jobs.subject_id AND openai_enabled=0)`)
          .bind(id, active.lease_token_sha256).run();
        if (!counted.meta.changes) throw new Error('Đã hết giới hạn 2 lần gọi hoặc quyền sử dụng đã thay đổi.');
      } });
      const snapshot = JSON.parse(active.context_snapshot!);
      const identity = await db.prepare('SELECT name FROM user WHERE id=?').bind(job.learner_id).first<{name:string}>();
      engine.privateNames = [job.learner_id, identity?.name].filter((name): name is string => !!name);
      const photos = (snapshot.attempts ?? []).flatMap((a: {attachments: {attachmentId: string; expired: boolean}[]}) => a.attachments);
      const attachmentCount = job.kind === 'assess' ? await db.prepare("SELECT coalesce(sum(json_array_length(attachment_ids)),0) AS n FROM attempts WHERE learner_id=? AND id IN (SELECT value FROM json_each(?))").bind(job.learner_id, JSON.stringify((snapshot.attempts ?? []).map((a: {attemptId:string}) => a.attemptId))).first<{n:number}>() : null;
      let photoError: string | null = attachmentCount && attachmentCount.n !== photos.length ? 'Có quá nhiều ảnh hoặc ảnh không còn; không thể chấm bài.' : null;
      const photoData = new Map<string, {mime: string; base64: string}>();
      let totalBytes = 0;
      for (const photo of photos) {
        if (photoError) break;
        const row = await db.prepare('SELECT r2_key,mime,bytes FROM attachments WHERE id=? AND learner_id=? AND deleted_at IS NULL AND expires_at>?').bind(photo.attachmentId, job.learner_id, new Date().toISOString()).first<{r2_key:string;mime:string;bytes:number}>();
        if (photo.expired || !row || !bucket) { photoError = 'Ảnh đã bị xoá hoặc hết hạn; không thể chấm bài.'; break; }
        if (row.bytes > 3000000 || !['image/jpeg','image/png','image/webp'].includes(row.mime)) { photoError = 'Ảnh quá lớn hoặc định dạng không được hỗ trợ; không thể chấm bài.'; break; }
        const object = await bucket.get(row.r2_key);
        if (!object) { photoError = 'Ảnh đã bị xoá hoặc không còn trong kho; không thể chấm bài.'; break; }
        if (object.size > 3000000) { photoError = 'Ảnh quá lớn; không thể chấm bài.'; break; }
        const bytes = new Uint8Array(await object.arrayBuffer());
        if (!bytes.length || bytes.length > 3000000) { photoError = 'Ảnh rỗng hoặc quá lớn; không thể chấm bài.'; break; }
        totalBytes += bytes.length;
        if (totalBytes > 8000000) { photoError = 'Tổng kích thước ảnh vượt 8 MB; không thể chấm bài.'; break; }
        let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        photoData.set(photo.attachmentId, {mime: row.mime, base64: btoa(binary)});
      }
      if (photoError) {
        await failLeasedJob(db, active, false);
        await db.prepare("UPDATE ai_jobs SET error=? WHERE id=? AND status='failed'").bind(photoError, id).run();
        message.ack(); continue;
      }
      const processed = await processJob({
        attachment: async (_lease: unknown, attachmentId: string) => { const image = photoData.get(attachmentId); if (!image) throw new Error('Ảnh đã hết hạn.'); return image; },
        context: async () => JSON.parse(active.context_snapshot!),
        heartbeat: async () => heartbeat(db, client, id, token),
        result: async (_lease: unknown, body: unknown, dry: boolean) => {
          stage = dry ? 'validate_result' : 'save_result';
          const response = await applyResult(db, client, id, token, body, dry, new Date(), env.AI_PRICE_TABLE, bucket, ttsSubjectIds);
          if (!dry && response.status === 200 && !response.replayed) await notifySavedFeedback(env.FEEDBACK_EVENTS, db, id).catch(() => {});
          return { status: response.status, body: response };
        },
        state: async () => {
          const current = await readJob(db, id);
          return { status: current?.status, outcome: current?.outcome ? JSON.parse(current.outcome) : null };
        },
        fail: async (_lease: unknown, _reason: string, retryable: boolean) => {
          const count = await db.prepare('SELECT openai_calls FROM ai_jobs WHERE id=?').bind(id).first<{openai_calls:number}>();
          return failLeasedJob(db, await leasedJob(db, client, id, token), retryable && (count?.openai_calls ?? 0) === 0);
        },
      }, lease, engine, {
        getPrompt,
        ...(tts && bucket ? { prepareAudio: async (context: Parameters<typeof uploadOpenAiPlanAudio>[0],
          result: Parameters<typeof uploadOpenAiPlanAudio>[1], uploaded: Set<string>) => {
          try {
            return await uploadOpenAiPlanAudio(context, result, apiKey, async (request, hash) => {
              const verify = () => leasedJob(db, client, id, token);
              return uploadAudio(db, bucket, request, await verify(), hash, verify);
            }, uploaded, entry => console.info(JSON.stringify({ component: 'openai-queue-tts', jobId: id, ...entry })), fetcher, db, id, speechJobLimit(env.OPENAI_SPEECH_MAX_PER_JOB));
          } catch (error) {
            if (error instanceof QueueAudioError && ['speech_call_limit', 'speech_job_limit'].includes(error.diagnostic.code)) speechLimit = true;
            logAudioFailure('audio_error', error instanceof QueueAudioError ? error.diagnostic : {
              stage: 'unexpected', code: 'audio_unexpected',
            });
            throw error;
          }
        } } : {}),
        log: (entry?: { event: string; errors?: unknown[]; passed?: boolean }) => {
          if (job.kind === 'assess' && entry?.event === 'assess_first_validation' && typeof entry.passed === 'boolean')
            console.info(JSON.stringify({component:'openai-queue',jobId:id,event:'assess_first_validation',passed:entry.passed}));
          if (job.kind === 'assess' && entry) assessDiagnostic = assessIssue(entry) ?? assessDiagnostic;
          if (tts && entry && contentEvents.has(entry.event))
            logAudioFailure(entry.event, { stage: 'lesson_validation', issues: contentIssues(entry.event, entry.errors) });
          if (job.purpose === 'recheck' && entry && ['engine_error', 'contract_error', 'dry_run_422'].includes(entry.event)) {
            console.warn(JSON.stringify({ component: 'openai-queue', jobId: id, purpose: job.purpose, event: entry.event }));
          }
        },
      });
      const current = await readJob(db, id);
      if (current?.status === 'failed') {
        const counter = await db.prepare('SELECT openai_calls FROM ai_jobs WHERE id=?').bind(id).first<{openai_calls:number}>();
        if (speechLimit) await db.prepare("UPDATE ai_jobs SET error='Chưa tạo được âm thanh: đã hết giới hạn lượt gọi hoặc quyền sử dụng đã thay đổi.' WHERE id=? AND status='failed'").bind(id).run();
        else if (job.kind === 'assess' && assessDiagnostic) await db.prepare("UPDATE ai_jobs SET error=? WHERE id=? AND status='failed'").bind(assessDiagnostic, id).run();
        else if (counter?.openai_calls === 2) await db.prepare("UPDATE ai_jobs SET error='Đã dùng hết 2 lần gọi OpenAI; lượt xử lý không hoàn thành.' WHERE id=? AND status='failed'").bind(id).run();
        const detail = 'error' in processed && typeof processed.error === 'string'
          ? processed.error.match(/OpenAI (?:HTTP \d{3}(?: \([a-z_]+\))?|schema preparation failed|request timed out|request transport failed|response status: (?:failed|incomplete|cancelled|queued|in_progress|unknown)(?: \((?:max_output_tokens|content_filter)\))?|declined this response|response was not valid JSON)/)?.[0] : undefined;
        if (detail && !speechLimit && !assessDiagnostic && counter?.openai_calls !== 2) await db.prepare("UPDATE ai_jobs SET error=? WHERE id=? AND status='failed' AND lease_client_id=?")
          .bind(detail, id, client.id).run();
        console.warn(JSON.stringify({ component: 'openai-queue', jobId: id, leaseCount: active.lease_count, kind: job.kind,
          event: 'queue_failed', status: current.status, ...(detail ? { detail } : {}) }));
      }
      if (current?.status === 'queued') message.retry({ delaySeconds: 30 });
      else if (current?.status === 'leased') throw new Error('Job remained leased after processing.');
      else message.ack();
    } catch {
      console.warn(JSON.stringify({ component: 'openai-queue', jobId: id, event: 'queue_exception', stage }));
      // A result write can have committed despite a lost response. Read it first;
      // only fail our own still-active, unclaimed lease, never a saved result.
      try {
        const current = await readJob(db, id);
        if (current?.status === 'succeeded' || current?.status === 'failed' || current?.status === 'expired' || current?.status === 'cancelled') {
          message.ack();
        } else if (current?.status === 'leased' && ownedLeaseHash && current.lease_token_sha256 === ownedLeaseHash) {
          const count = await db.prepare('SELECT openai_calls FROM ai_jobs WHERE id=?').bind(id).first<{openai_calls:number}>();
          if ((count?.openai_calls ?? 0) > 0) {
            await failLeasedJob(db, current, false);
            await db.prepare("UPDATE ai_jobs SET error=? WHERE id=? AND status='failed'").bind(assessDiagnostic ?? 'Không hoàn tất được công việc sau khi gọi AI.', id).run();
            message.ack();
          } else message.retry({ delaySeconds: 60 });
        } else message.retry({ delaySeconds: 60 });
      } catch {
        // A transient D1 failure leaves the delivery retryable; never guess the result.
        message.retry({ delaySeconds: 60 });
      }
    }
  }
}

export async function redispatchOpenAi(env: Cloudflare.Env, now: Date) {
  if (!env.DB) return;
  await failExpiredOpenAiJobs(env.DB, now);
  await recoverCalibrationJobs(env.DB, env, now);
  if (!env.AI_QUEUE || !env.OPENAI_API_KEY) return;
  const subjectIds = await aiSubjects(env.DB, env);
  if (!subjectIds.length) return;
  const { results } = await env.DB.prepare(
    `SELECT id FROM ai_jobs
      WHERE subject_id IN (SELECT value FROM json_each(?))
      AND expires_at>? AND updated_at<=?
      AND (status='queued' OR (status='leased' AND lease_client_id=? AND lease_expires_at<=?))
      AND (trigger<>'deferred' OR purpose IN ('submission','recheck'))
      ORDER BY priority DESC, created_at, id LIMIT 10`,
  ).bind(JSON.stringify(subjectIds), now.toISOString(), new Date(now.getTime() - 120000).toISOString(),
    client.id, now.toISOString()).all<{ id: string }>();
  for (const job of results) await env.AI_QUEUE.send({ jobId: job.id });
  const {results:turns}=await env.DB.prepare(`SELECT t.id FROM tutor_turns t JOIN learning_lessons l ON l.id=t.lesson_id
    JOIN learner_settings s ON s.user_id=t.learner_id JOIN lesson_items i ON i.lesson_id=t.lesson_id AND i.item_id=t.item_id
    WHERE l.subject_id IN (SELECT value FROM json_each(?)) AND s.tutor_enabled=1 AND l.completed_at IS NULL
    AND i.flag IS NOT 'item_void' AND ((t.status='queued' AND t.created_at<=?) OR (t.status='streaming' AND t.lease_expires_at<=?))
    ORDER BY t.created_at LIMIT 10`).bind(JSON.stringify(subjectIds),new Date(now.getTime()-120000).toISOString(),now.toISOString()).all<{id:string}>();
  for (const turn of turns) await env.AI_QUEUE.send({tutorTurnId:turn.id});
}
