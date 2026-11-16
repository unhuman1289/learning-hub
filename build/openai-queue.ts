import { QueueAudioError, uploadOpenAiPlanAudio } from './openai-tts.ts';
import { uploadAudio } from '../lib/audio/upload.ts';
import { openAiGermanVoices, openAiTtsSubjects } from '../lib/audio/openai-voices.ts';
import { openAiEngine } from '../integrations/home-runner/openai.mjs';
import { contractFor, processJob } from '../integrations/home-runner/job.mjs';
import { applyResult } from '../lib/ai-jobs/result.ts';
import { failLeasedJob, heartbeat, leasedJob, leaseJobs, readJob } from '../lib/ai-jobs/lease.ts';
import { openAiSubjects } from '../lib/ai-jobs/queue.ts';
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

export async function consumeOpenAi(batch: MessageBatch<{ jobId?: string }>, env: Cloudflare.Env, getPrompt: (kind: string, purpose: string) => string, fetcher = fetch) {
  const subjectIds = openAiSubjects(env);
  const ttsSubjectIds = openAiTtsSubjects(env);
  const { DB: db, OPENAI_API_KEY: apiKey, UPLOADS: bucket } = env;
  for (const message of batch.messages) {
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
        kinds: [job.kind], subjectIds, jobId: id, textOnly: true, max: 1,
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
      const logAudioFailure = (event: string, details: object) => console.warn(JSON.stringify({
        component: 'openai-queue-tts', jobId: id, leaseCount: active.lease_count, event, ...details,
      }));
      const engine = openAiEngine({ apiKey, kind: job.kind, purpose: job.purpose, fetcher });
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
        fail: async (_lease: unknown, _reason: string, retryable: boolean) =>
          failLeasedJob(db, await leasedJob(db, client, id, token), retryable),
      }, lease, engine, {
        getPrompt,
        ...(tts && bucket ? { prepareAudio: async (context: Parameters<typeof uploadOpenAiPlanAudio>[0],
          result: Parameters<typeof uploadOpenAiPlanAudio>[1], uploaded: Set<string>) => {
          try {
            return await uploadOpenAiPlanAudio(context, result, apiKey, async (request, hash) => {
              const verify = () => leasedJob(db, client, id, token);
              return uploadAudio(db, bucket, request, await verify(), hash, verify);
            }, uploaded, entry => console.info(JSON.stringify({ component: 'openai-queue-tts', jobId: id, ...entry })), fetcher);
          } catch (error) {
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
        const detail = 'error' in processed && typeof processed.error === 'string'
          ? processed.error.match(/OpenAI (?:HTTP \d{3}(?: \([a-z_]+\))?|schema preparation failed|request timed out|request transport failed|response status: (?:failed|incomplete|cancelled|queued|in_progress|unknown)(?: \((?:max_output_tokens|content_filter)\))?|declined this response|response was not valid JSON)/)?.[0] : undefined;
        if (detail) await db.prepare("UPDATE ai_jobs SET error=? WHERE id=? AND status='failed' AND lease_client_id=?")
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
  const subjectIds = openAiSubjects(env);
  if (!env.DB || !env.AI_QUEUE || !env.OPENAI_API_KEY || !subjectIds.length) return;
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
}
