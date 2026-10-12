import { storage } from '../../../../../../../db/storage.ts';
import { requireAutomation } from '../../../../../../../lib/auth/automation-route.ts';
import { automationFailure, readJson, safeJson } from '../../../../../../../lib/automation/http.ts';
import { resultSchema } from '../../../../../../../lib/automation/schema.ts';
import { acceptAutomationResult, AutomationError } from '../../../../../../../lib/automation/state.ts';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ runId: string }> };

export async function POST(request: Request, context: Context) {
  const auth = await requireAutomation(request, 'result:write');
  if ('response' in auth) return auth.response;
  try {
    const parsed = resultSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new AutomationError(400, 'invalid_payload', 'Result does not match Automation API v1.');
    const { runId } = await context.params;
    return safeJson(await acceptAutomationResult(storage(), runId, auth.client.id, parsed.data));
  } catch (error) { return automationFailure(error); }
}
