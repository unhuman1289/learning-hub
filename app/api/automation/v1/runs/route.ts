import { storage } from '../../../../../db/storage.ts';
import { requireAutomation } from '../../../../../lib/auth/automation-route.ts';
import { automationFailure, privateHeaders, readJson, safeJson } from '../../../../../lib/automation/http.ts';
import { startRunSchema } from '../../../../../lib/automation/schema.ts';
import { createAutomationRun, AutomationError } from '../../../../../lib/automation/state.ts';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await requireAutomation(request, 'runs:create');
  if ('response' in auth) return auth.response;
  try {
    const parsed = startRunSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new AutomationError(400, 'invalid_payload', 'Start request does not match Automation API v1.');
    const result = await createAutomationRun(storage(), auth.client.id, parsed.data, request.headers.get('idempotency-key'));
    return safeJson({ ...result, links: { context: `/api/automation/v1/runs/${result.runId}/context`, result: `/api/automation/v1/runs/${result.runId}/result` } }, result.replayed ? 200 : 201);
  } catch (error) { return automationFailure(error); }
}

export async function GET() {
  return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: { ...privateHeaders, Allow: 'POST' } });
}
