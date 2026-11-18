import { env } from 'cloudflare:workers';
import { getHubUser } from '../../../../../../lib/auth/session';
import { storage } from '../../../../../../db/storage';
import { lessonTarget, privateHeaders } from '../../../../../../lib/lesson-v2/route-helpers';
import { apiFailure } from '../../../../../../lib/api-error';
export const dynamic = 'force-dynamic';
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const db = storage(), user = await getHubUser(db);
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers: privateHeaders });
  try {
    const { id } = await context.params;
    const learner = await lessonTarget(db, user, req, id, 'read_work');
    if (learner instanceof Response) return learner;
    if (!env.FEEDBACK_EVENTS) return Response.json({ error: 'Kênh lời phê chưa sẵn sàng.' }, { status: 503, headers: privateHeaders });
    const object = env.FEEDBACK_EVENTS.get(env.FEEDBACK_EVENTS.idFromName(learner + ':' + id));
    return object.fetch('https://feedback.internal/events');
  } catch (e) { return apiFailure(e, 'Chưa theo dõi được lời phê.', privateHeaders); }
}
