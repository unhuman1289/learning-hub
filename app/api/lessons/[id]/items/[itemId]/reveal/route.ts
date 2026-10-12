import { getHubUser } from '../../../../../../../lib/auth/session';
import { storage } from '../../../../../../../db/storage';
import { apiFailure } from '../../../../../../../lib/api-error';
import { reveal } from '../../../../../../../lib/lesson-v2/actions';
import { lessonTarget, privateHeaders } from '../../../../../../../lib/lesson-v2/route-helpers';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string; itemId: string }> };

/** Opens a hint or the solution: {level:"hint1"|"hint2"|"solution"}; recorded before it is shown. */
export async function POST(req: Request, context: Context) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers: privateHeaders });
  try {
    const { id, itemId } = await context.params;
    const db = storage();
    const learnerId = await lessonTarget(db, user, req, id, 'edit_work');
    if (learnerId instanceof Response) return learnerId;
    const body = await req.json().catch(() => null) as { level?: unknown } | null;
    return Response.json(await reveal(db, learnerId, id, itemId, body?.level), { headers: privateHeaders });
  } catch (error) {
    return apiFailure(error, 'Chưa mở được gợi ý.', privateHeaders);
  }
}
