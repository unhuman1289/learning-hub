import { env } from 'cloudflare:workers';
import { getHubUser } from './session.ts';
import { authorizeAutomation, type AutomationScope } from './automation.ts';

export async function requireAutomation(request: Request, scope: AutomationScope) {
  const result = await authorizeAutomation(request, env, scope);
  if ('client' in result) return result;
  let hasActiveSession = false;
  if (result.response.status === 401) {
    try { hasActiveSession = Boolean(await getHubUser()); } catch { /* Preserve the fail-closed service-auth response. */ }
  }
  if (hasActiveSession) {
    return { response: Response.json({ error: 'insufficient_scope', message: 'Browser sessions cannot call automation endpoints.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } }) };
  }
  return result;
}
