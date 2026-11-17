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
  scopes: ['jobs:plan', 'jobs:assess'],
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

export async function consumeOpenAi(batch: MessageBatch<{ jobId?: string; tutorTurnId?: string }>, env: Cloudflare.Env, getPrompt: (kind: string, purpose: string) => string, fetcher = fetch, tutorPrompt = '') {
  const { DB: db, OPENAI_API_KEY: apiKey, UPLOADS: bucket } = env;
  const subjectIds = db ? await aiSubjects(db, env) : [];
  const ttsSubjectIds = db && apiKey && bucket ? await aiSubjects(db, env, true) : [];
  for (const message of batch.messages) {
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
    try {
      const tts = job.kind === 'plan' && ttsSubjectIds.includes(job.subject_id);
      const [lease] = await leaseJobs(db, client, {
        kinds: [job.kind], subjectIds: [job.subject_id], jobId: id, textOnly: true, max: 1,
        capabilities: ['adaptive-plan', 'local-grading', 'lesson-v3', 'roadmap-v2', ...(tts ? ['tts'] : [])],
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
      let speechLimit = false;
      const logAudioFailure = (event: string, details: object) => console.warn(JSON.stringify({
        component: 'openai-queue-tts', jobId: id, leaseCount: active.lease_count, event, ...details,
      }));
      const engine = openAiEngine({ apiKey, kind: job.kind, purpose: job.purpose, fetcher, beforeFetch: async () => {
        const counted = await db.prepare(`UPDATE ai_jobs SET openai_calls=openai_calls+1 WHERE id=? AND openai_calls<2
          AND status='leased' AND lease_token_sha256=? AND NOT EXISTS(SELECT 1 FROM ai_subject_controls WHERE subject_id=ai_jobs.subject_id AND openai_enabled=0)`)
          .bind(id, active.lease_token_sha256).run();
        if (!counted.meta.changes) throw new Error('Đã hết giới hạn 2 lần gọi hoặc quyền sử dụng đã thay đổi.');
      } });
      const processed = await processJob({
        context: async () => JSON.parse(active.context_snapshot!),
        heartbeat: async () => heartbeat(db, client, id, token),
        result: async (_lease: unknown, body: unknown, dry: boolean) => {
          const response = await applyResult(db, client, id, token, body, dry, new Date(), env.AI_PRICE_TABLE, bucket, ttsSubjectIds);
          return { status: response.status, body: response };
        },
        state: async () => {
          const current = await readJob(db, id);
          return { status: current?.status, outcome: current?.outcome ? JSON.parse(current.outcome) : null };
        },
        fail: async (_lease: unknown, _reason: string, retryable: boolean) => {
          const count = await db.prepare('SELECT openai_calls FROM ai_jobs WHERE id=?').bind(id).first<{openai_calls:number}>();
          return failLeasedJob(db, await leasedJob(db, client, id, token), retryable && (count?.openai_calls ?? 0) < 2);
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
        log: (entry?: { event: string; errors?: unknown[] }) => {
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
        else if (counter?.openai_calls === 2) await db.prepare("UPDATE ai_jobs SET error='Đã dùng hết 2 lần gọi OpenAI; lượt xử lý không hoàn thành.' WHERE id=? AND status='failed'").bind(id).run();
        const detail = 'error' in processed && typeof processed.error === 'string'
          ? processed.error.match(/OpenAI (?:HTTP \d{3}(?: \([a-z_]+\))?|schema preparation failed|request timed out|request transport failed|response status: (?:failed|incomplete|cancelled|queued|in_progress|unknown)(?: \((?:max_output_tokens|content_filter)\))?|declined this response|response was not valid JSON)/)?.[0] : undefined;
        if (detail && !speechLimit && counter?.openai_calls !== 2) await db.prepare("UPDATE ai_jobs SET error=? WHERE id=? AND status='failed' AND lease_client_id=?")
          .bind(detail, id, client.id).run();
        console.warn(JSON.stringify({ component: 'openai-queue', jobId: id, leaseCount: active.lease_count, kind: job.kind,
          event: 'queue_failed', status: current.status, ...(detail ? { detail } : {}) }));
      }
      if (current?.status === 'queued') message.retry({ delaySeconds: 30 });
      else message.ack();
    } catch {
      // A delivery can be repeated. Lease and result hashes remain the write boundary.
      message.retry({ delaySeconds: 60 });
    }
  }
}

export async function redispatchOpenAi(env: Cloudflare.Env, now: Date) {
  if (!env.DB || !env.AI_QUEUE || !env.OPENAI_API_KEY) return;
  const subjectIds = await aiSubjects(env.DB, env);
  if (!subjectIds.length) return;
  const { results } = await env.DB.prepare(
    `SELECT id FROM ai_jobs
      WHERE subject_id IN (SELECT value FROM json_each(?))
      AND expires_at>? AND updated_at<=?
      AND (status='queued' OR (status='leased' AND lease_client_id=? AND lease_expires_at<=?))
      AND (trigger<>'deferred' OR purpose IN ('submission','recheck'))
      AND needs_vision=0
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
