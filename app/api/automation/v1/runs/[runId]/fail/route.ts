import { storage } from '../../../../../../../db/storage.ts';
import { requireAutomation } from '../../../../../../../lib/auth/automation-route.ts';
import { automationFailure, readJson, safeJson } from '../../../../../../../lib/automation/http.ts';
import { failRunSchema, runIdParamSchema } from '../../../../../../../lib/automation/schema.ts';
import { AutomationError, failAutomationRun } from '../../../../../../../lib/automation/state.ts';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ runId: string }> };

export async function POST(request: Request, context: Context) {
  const auth = await requireAutomation(request, 'result:write');
  if ('response' in auth) return auth.response;
  try {
    const parsed = failRunSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new AutomationError(400, 'invalid_payload', 'Failure report does not match Automation API v1.');
    const { runId } = await context.params;
    if (!runIdParamSchema.safeParse(runId).success) throw new AutomationError(404, 'run_not_found', 'Run not found.');
    return safeJson(await failAutomationRun(storage(), runId, auth.client.id, parsed.data.error));
  } catch (error) { return automationFailure(error); }
}
