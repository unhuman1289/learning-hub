import { storage } from '../../../../../../../db/storage.ts';
import { requireAutomation } from '../../../../../../../lib/auth/automation-route.ts';
import { automationFailure, privateHeaders, safeJson } from '../../../../../../../lib/automation/http.ts';
import { runIdParamSchema } from '../../../../../../../lib/automation/schema.ts';
import { serveAutomationContext } from '../../../../../../../lib/automation/state.ts';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ runId: string }> };

export async function GET(request: Request, context: Context) {
  const auth = await requireAutomation(request, 'context:read');
  if ('response' in auth) return auth.response;
  try {
    const { runId } = await context.params;
    const parsed = runIdParamSchema.safeParse(runId);
    if (!parsed.success) return Response.json({ error: 'run_not_found' }, { status: 404, headers: privateHeaders });
    return safeJson(await serveAutomationContext(storage(), runId, auth.client.id));
  } catch (error) { return automationFailure(error); }
}
