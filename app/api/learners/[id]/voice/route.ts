import { env } from 'cloudflare:workers';
import { getHubUser } from '../../../../../lib/auth/session';
import { storage } from '../../../../../db/storage';
import { apiFailure } from '../../../../../lib/api-error';
import { setListeningVoice } from '../../../../../lib/learners/settings';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
type Context = { params: Promise<{ id: string }> };

export async function POST(req: Request, context: Context) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers });
  if (req.headers.get('origin') !== new URL(req.url).origin) return Response.json({ error: 'Origin rejected' }, { status: 403, headers });
  const { id } = await context.params;
  if (id !== 'me' && id !== user.id) {
    if (env.ENVIRONMENT === 'local') await req.arrayBuffer();
    return Response.json({ error: 'Not found' }, { status: 404, headers });
  }
  try {
    const body = await req.json().catch(() => null) as { voice?: unknown } | null;
    if ((body?.voice !== 'f' && body?.voice !== 'm') || Object.keys(body).length !== 1)
      return Response.json({ error: 'Giọng đọc không hợp lệ.' }, { status: 400, headers });
    await setListeningVoice(storage(), user.id, body.voice);
    return Response.json({ voice: body.voice }, { headers });
  } catch (error) {
    return apiFailure(error, 'Chưa lưu được giọng đọc.', headers);
  }
}
