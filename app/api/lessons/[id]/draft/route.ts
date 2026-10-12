import { getHubUser } from '../../../../../lib/auth/session';
import { storage } from '../../../../../db/storage';
import { apiFailure } from '../../../../../lib/api-error';
import { parseDraft, saveDraft } from '../../../../../lib/lesson-v2/actions';
import { lessonTarget, privateHeaders } from '../../../../../lib/lesson-v2/route-helpers';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

/** Saves the learner's draft answers: {revision, answers:{itemId:{answer, attachmentIds?}}}. */
export async function PUT(req: Request, context: Context) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers: privateHeaders });
  try {
    const { id } = await context.params;
    const db = storage();
    const learnerId = await lessonTarget(db, user, req, id, 'edit_work');
    if (learnerId instanceof Response) return learnerId;
    return Response.json(await saveDraft(db, learnerId, id, parseDraft(await req.json())), { headers: privateHeaders });
  } catch (error) {
    return apiFailure(error, 'Chưa lưu được nháp. Câu trả lời vẫn còn trên trang.', privateHeaders);
  }
}
