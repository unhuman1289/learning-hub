import { requireAutomation } from '../../../../../lib/auth/automation-route.ts';
import { automationJsonSchema } from '../../../../../lib/automation/schema.ts';
import { privateHeaders } from '../../../../../lib/automation/http.ts';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireAutomation(request, 'context:read');
  if ('response' in auth) return auth.response;
  return Response.json(automationJsonSchema, { headers: privateHeaders });
}
