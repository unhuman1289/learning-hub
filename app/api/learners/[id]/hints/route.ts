import { getHubUser } from '../../../../../lib/auth/session';
import { storage } from '../../../../../db/storage';
import { apiFailure } from '../../../../../lib/api-error';
import { isSeenHint, markHintSeen } from '../../../../../lib/learners/settings';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
type Context = { params: Promise<{ id: string }> };

/** The signed-in learner saw a UI hint, e.g. `{ "hint": "pageEdge" }`. Only for `me`. */
export async function POST(req: Request, context: Context) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers });
  if (req.headers.get('origin') !== new URL(req.url).origin) return Response.json({ error: 'Origin rejected' }, { status: 403, headers });
  if ((await context.params).id !== 'me') return Response.json({ error: 'Not found' }, { status: 404, headers });
  try {
    const body = (await req.json().catch(() => null)) as { hint?: unknown } | null;
    if (!isSeenHint(body?.hint)) return Response.json({ error: 'Gợi ý không hợp lệ.' }, { status: 400, headers });
    await markHintSeen(storage(), user.id, body.hint);
    return new Response(null, { status: 204, headers });
  } catch (error) {
    return apiFailure(error, 'Chưa lưu được.', headers);
  }
}
