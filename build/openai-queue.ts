import planPrompt from '../integrations/runner-prompts/plan-request.md?raw';
import assessPrompt from '../integrations/runner-prompts/assess-local.md?raw';
import recheckPrompt from '../integrations/runner-prompts/assess-recheck.md?raw';
import { openAiEngine } from '../integrations/home-runner/openai.mjs';
import { processJob } from '../integrations/home-runner/job.mjs';
import { applyResult } from '../lib/ai-jobs/result';
import { failLeasedJob, heartbeat, leasedJob, leaseJobs, readJob } from '../lib/ai-jobs/lease';
import { openAiSubjects } from '../lib/ai-jobs/queue';
import type { AutomationClient } from '../lib/auth/automation';

const client: AutomationClient = {
  id: 'openai-staging',
  keySha256: '',
  accessClientId: '',
  scopes: ['jobs:plan', 'jobs:assess'],
  purposes: ['initial', 'daily', 'request', 'submission', 'recheck'],
  triggers: ['on_demand', 'scheduled', 'deferred'],
};

export async function consumeOpenAi(batch: MessageBatch<{ jobId?: string }>, env: Cloudflare.Env) {
  const subjectIds = openAiSubjects(env);
  const { DB: db, OPENAI_API_KEY: apiKey } = env;
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
      const [lease] = await leaseJobs(db, client, {
        kinds: [job.kind], subjectIds, jobId: id, textOnly: true, max: 1,
        capabilities: ['adaptive-plan', 'local-grading', 'lesson-v3', 'roadmap-v2'],
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
      const engine = openAiEngine({ apiKey, kind: job.kind, purpose: job.purpose });
      const processed = await processJob({
        context: async () => JSON.parse(active.context_snapshot!),
        heartbeat: async () => heartbeat(db, client, id, token),
        result: async (_lease: unknown, body: unknown, dry: boolean) => {
          const response = await applyResult(db, client, id, token, body, dry, new Date(), env.AI_PRICE_TABLE);
          return { status: response.status, body: response };
        },
        state: async () => {
          const current = await readJob(db, id);
          return { status: current?.status, outcome: current?.outcome ? JSON.parse(current.outcome) : null };
        },
        fail: async (_lease: unknown, _reason: string, retryable: boolean) =>
          failLeasedJob(db, await leasedJob(db, client, id, token), retryable),
      }, lease, engine, {
        getPrompt: (kind: string, purpose: string) =>
          kind === 'plan' ? planPrompt : purpose === 'recheck' ? assessPrompt + '\n\n' + recheckPrompt : assessPrompt,
      });
      const current = await readJob(db, id);
      if (current?.status === 'failed') {
        const detail = 'error' in processed && typeof processed.error === 'string'
          ? processed.error.match(/OpenAI (?:HTTP \d{3}(?: \([a-z_]+\))?|schema preparation failed|request timed out|request transport failed|response status: (?:failed|incomplete|cancelled|queued|in_progress|unknown)(?: \((?:max_output_tokens|content_filter)\))?|declined this response|response was not valid JSON)/)?.[0] : undefined;
        if (detail) await db.prepare("UPDATE ai_jobs SET error=? WHERE id=? AND status='failed' AND lease_client_id=?")
          .bind(detail, id, client.id).run();
        console.warn(JSON.stringify({ component: 'openai-queue', jobId: id, kind: job.kind,
          status: current.status, ...(detail ? { detail } : {}) }));
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
