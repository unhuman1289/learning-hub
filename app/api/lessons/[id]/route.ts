import { getHubUser } from '../../../../lib/auth/session';
import { storage } from '../../../../db/storage';
import { apiFailure } from '../../../../lib/api-error';
import { readLessonV2 } from '../../../../lib/lesson-v2/store';
import { lessonTarget, privateHeaders } from '../../../../lib/lesson-v2/route-helpers';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

/** A v2 lesson for its learner, or for a guardian or admin with ?learner= (read-only). */
export async function GET(req: Request, context: Context) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers: privateHeaders });
  try {
    const { id } = await context.params;
    const db = storage();
    const learnerId = await lessonTarget(db, user, req, id, 'read_work');
    if (learnerId instanceof Response) return learnerId;
    return Response.json({ lesson: await readLessonV2(db, learnerId, id) }, { headers: privateHeaders });
  } catch (error) {
    return apiFailure(error, 'Chưa mở được bài.', privateHeaders);
  }
}
