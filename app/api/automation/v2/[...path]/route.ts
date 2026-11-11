import { sendAlertDigest } from '../../../../../lib/alerts';
import { env } from 'cloudflare:workers';
import { z } from 'zod/v4';
import { storage } from '../../../../../db/storage';
import { authorizeAutomation } from '../../../../../lib/auth/automation';
import { apiFailure, ApiError } from '../../../../../lib/api-error';
import { leaseJobs, leasedJob, readJob, heartbeat, permits } from '../../../../../lib/ai-jobs/lease';
import { applyResult } from '../../../../../lib/ai-jobs/result';
import { planContext, planResult, assessContext, assessResult } from '../../../../../lib/contracts/ai-common';
import { lessonPackageV2 } from '../../../../../lib/contracts/lesson-package-v2';
import { historyMarkdown, readHistory } from '../../../../../lib/history';
import { learnerStatus } from '../../../../../lib/status';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
const leaseBody = z
  .object({
    kinds: z
      .array(z.enum(['plan', 'assess']))
      .min(1)
      .max(2),
    purposes: z
      .array(z.enum(['daily', 'initial', 'request', 'submission', 'recheck']))
      .max(5)
      .optional(),
    triggers: z
      .array(z.enum(['scheduled', 'on_demand', 'deferred']))
      .max(3)
      .optional(),
    max: z.number().int().min(1).max(5),
    runner: z.object({ name: z.string().min(1).max(80), version: z.string().max(80), model: z.string().max(120) }).strict(),
    capabilities: z
      .array(z.enum(['vision', 'adaptive-plan', 'local-grading']))
      .max(1)
      .optional(),
  })
  .strict();
// Building JSON Schema costs real CPU; do it once per isolate.
let schemas: Record<string, unknown> | undefined;
function contractSchemas() {
  schemas ??= Object.fromEntries(
    Object.entries({
      'lesson-package/2': lessonPackageV2,
      'plan-context/1': planContext,
      'plan-result/1': planResult,
      'assess-context/1': assessContext,
      'assess-result/1': assessResult,
    }).map(([k, schema]) => [k, z.toJSONSchema(schema)]),
  );
  return schemas;
}
async function route(req: Request, context: { params: Promise<{ path: string[] }> }) {
  if (env.HUB2_ENABLED !== 'true') return Response.json({ error: 'Not found' }, { status: 404, headers });
  try {
    let auth = await authorizeAutomation(req, env, 'jobs:plan');
    if ('response' in auth && auth.response.status === 403) auth = await authorizeAutomation(req, env, 'jobs:assess');
    if ('response' in auth) return auth.response;
    const client = auth.client,
      { path } = await context.params,
      db = storage(),
      token = req.headers.get('X-Lease-Token');
    let body: unknown;
    if (req.method === 'POST') {
      const raw = await req.text();
      if (new TextEncoder().encode(raw).length > 512 * 1024) throw new ApiError(413, 'Body vượt 512 KB.');
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        throw new ApiError(400, 'JSON không hợp lệ.');
      }
    }
    if (path.join('/') === 'schema' && req.method === 'GET') return Response.json({ contracts: contractSchemas() }, { headers });
    if (path.join('/') === 'jobs/lease' && req.method === 'POST') {
      const input = leaseBody.safeParse(body);
      if (!input.success) throw new ApiError(400, 'Lease request không hợp lệ.');
      return Response.json({ jobs: await leaseJobs(db, client, input.data, env.ENVIRONMENT ?? 'unknown') }, { headers });
    }
    // Read-only history for the Drive copy on the family Mac (L5.6): only profiles listed for this client.
    if (path[0] === 'history' && path.length === 2 && req.method === 'GET') {
      if (!client.scopes.includes('history:read') || !client.learnerIds?.includes(path[1])) throw new ApiError(404, 'Không tìm thấy hồ sơ.');
      const name = await db
        .prepare('SELECT coalesce(s.display_name,u.name) AS name FROM user u LEFT JOIN learner_settings s ON s.user_id=u.id WHERE u.id=?')
        .bind(path[1])
        .first<{ name: string }>();
      if (!name) throw new ApiError(404, 'Không tìm thấy hồ sơ.');
      return new Response(historyMarkdown(name.name, await readHistory(db, path[1], { days: 3660, limit: 2000 })), {
        headers: { ...headers, 'Content-Type': 'text/markdown; charset=utf-8' },
      });
    }
    // Read-only status for ChatGPT Project v7 (L6.2), same scope and profile list as the history copy.
    if (path[0] === 'status' && path.length === 2 && req.method === 'GET') {
      if (!client.scopes.includes('history:read') || !client.learnerIds?.includes(path[1])) throw new ApiError(404, 'Không tìm thấy hồ sơ.');
      return Response.json(await learnerStatus(db, path[1]), { headers });
    }
    if (path[0] !== 'jobs' || !/^job_[a-f0-9]{20}$/.test(path[1] ?? '')) throw new ApiError(404, 'Không tìm thấy công việc.');
    const id = path[1],
      action = path[2];
    if (!action && req.method === 'GET') {
      const job = await readJob(db, id);
      if (!job || job.lease_client_id !== client.id || !permits(client, job)) throw new ApiError(404, 'Không tìm thấy công việc.');
      return Response.json(
        {
          status: job.status,
          outcome: job.outcome ? JSON.parse(job.outcome) : null,
          finishedAt: (job as unknown as { finished_at: string | null }).finished_at,
          error: (job as unknown as { error: string | null }).error,
        },
        { headers },
      );
    }
    if (action === 'result' && req.method === 'POST') {
      const result = await applyResult(
        db,
        client,
        id,
        token,
        body,
        new URL(req.url).searchParams.get('dryRun') === '1',
        new Date(),
        env.AI_PRICE_TABLE,
      );
      // Email only when the third failed check ends the job; the 06:00 digest covers the rest.
      if (result.status === 422 && (await readJob(db, id))?.status === 'failed') await sendAlertDigest(db, env).catch(() => {});
      return Response.json(result, { status: result.status, headers });
    }
    if (action === 'heartbeat' && req.method === 'POST') return Response.json(await heartbeat(db, client, id, token), { headers });
    const job = await leasedJob(db, client, id, token);
    if (action === 'context' && req.method === 'GET') return Response.json(JSON.parse(job.context_snapshot!), { headers });
    if (action === 'fail' && req.method === 'POST') {
      const input = z
        .object({ error: z.string().min(1).max(1000), retryable: z.boolean() })
        .strict()
        .safeParse(body);
      if (!input.success) throw new ApiError(400, 'Fail request không hợp lệ.');
      const status = input.data.retryable && job.lease_count < 3 ? 'queued' : 'failed';
      // Keep runner text out of the learner UI and logs: it may contain answers or credentials.
      const changed = await db
        .prepare(
          "UPDATE ai_jobs SET status=?,error='Runner báo thất bại',updated_at=?,finished_at=CASE WHEN ?='failed' THEN ? ELSE NULL END,lease_token_sha256=NULL,lease_expires_at=NULL,apply_token=NULL WHERE id=? AND status='leased' AND lease_token_sha256=?",
        )
        .bind(status, new Date().toISOString(), status, new Date().toISOString(), id, job.lease_token_sha256)
        .run();
      if (!changed.meta.changes) throw new ApiError(409, 'Lease vừa thay đổi.');
      if (status === 'failed') await sendAlertDigest(db, env).catch(() => {});
      return Response.json({ status }, { headers });
    }
    if (action === 'attachments' && path[3] && req.method === 'GET') {
      if (!client.scopes.includes('attachments:read')) throw new ApiError(403, 'Client không có quyền đọc ảnh.');
      const snapshot = JSON.parse(job.context_snapshot!) as { attempts?: { attachments: { attachmentId: string; expired: boolean }[] }[] };
      if (!snapshot.attempts?.some((a) => a.attachments.some((img) => img.attachmentId === path[3] && !img.expired)))
        throw new ApiError(404, 'Ảnh không thuộc lease.');
      const image = await db
        .prepare('SELECT r2_key,mime FROM attachments WHERE id=? AND learner_id=? AND deleted_at IS NULL AND expires_at>?')
        .bind(path[3], job.learner_id, new Date().toISOString())
        .first<{ r2_key: string; mime: string }>();
      if (!image || !env.UPLOADS) throw new ApiError(404, 'Ảnh đã hết hạn.');
      const object = await env.UPLOADS.get(image.r2_key);
      if (!object) throw new ApiError(404, 'Không tìm thấy ảnh.');
      return new Response(object.body, { headers: { ...headers, 'Content-Type': image.mime, 'X-Content-Type-Options': 'nosniff' } });
    }
    throw new ApiError(404, 'Không tìm thấy endpoint.');
  } catch (e) {
    return apiFailure(e, 'Chưa xác nhận thao tác. Đọc lại job trước khi thử.', headers);
  }
}
export const GET = route,
  POST = route;
