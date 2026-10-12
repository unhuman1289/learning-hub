import { AutomationError } from './state.ts';

export const privateHeaders = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' };

export async function readJson(request: Request, maxBytes = 256 * 1024): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new AutomationError(413, 'payload_too_large', 'Request body exceeds the allowed size.');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new AutomationError(413, 'payload_too_large', 'Request body exceeds the allowed size.');
  try { return JSON.parse(text) as unknown; } catch { throw new AutomationError(400, 'invalid_payload', 'Request body must be valid JSON.'); }
}

export function automationFailure(error: unknown) {
  if (error instanceof AutomationError) return Response.json({ error: error.code, message: error.message }, { status: error.status, headers: privateHeaders });
  console.error('Automation API failure', error);
  return Response.json({ error: 'unavailable', message: 'Automation service is temporarily unavailable.' }, { status: 503, headers: privateHeaders });
}

export function safeJson(value: unknown, status = 200) {
  return Response.json(value, { status, headers: privateHeaders });
}
