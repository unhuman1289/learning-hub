import { getHubUser } from '../../../../../lib/auth/session';
import { storage } from '../../../../../db/storage';
import { apiFailure } from '../../../../../lib/api-error';
import { snooze } from '../../../../../lib/lesson-v2/actions';
import { lessonTarget, privateHeaders } from '../../../../../lib/lesson-v2/route-helpers';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

/** "Để mai": hides the lesson from today's desk until the next Berlin day. */
export async function POST(req: Request, context: Context) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers: privateHeaders });
  try {
    const { id } = await context.params;
    const db = storage();
    const learnerId = await lessonTarget(db, user, req, id, 'edit_work');
    if (learnerId instanceof Response) return learnerId;
    return Response.json(await snooze(db, learnerId, id), { headers: privateHeaders });
  } catch (error) {
    return apiFailure(error, 'Chưa dời được bài.', privateHeaders);
  }
}
