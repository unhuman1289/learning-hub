import { getHubUser } from '../../../../../lib/auth/session';
import { storage } from '../../../../../db/storage';
import { apiFailure } from '../../../../../lib/api-error';
import { lessonSummary } from '../../../../../lib/lesson-v2/summary';
import { lessonTarget, privateHeaders } from '../../../../../lib/lesson-v2/route-helpers';

export const dynamic = 'force-dynamic';
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers: privateHeaders });
  try {
    const db = storage();
    const { id } = await params;
    const learner = await lessonTarget(db, user, req, id, 'read_work');
    if (learner instanceof Response) return learner;
    return Response.json({ summary: await lessonSummary(db, learner, id) }, { headers: privateHeaders });
  } catch (error) {
    return apiFailure(error, 'Chưa đọc được tổng kết.', privateHeaders);
  }
}
