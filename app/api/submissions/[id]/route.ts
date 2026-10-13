import { getHubUser } from '../../../../lib/auth/session';
import { storage } from '../../../../db/storage';
import { resolveLearner } from '../../../../lib/access';
import { apiFailure } from '../../../../lib/api-error';
import { readSubmission } from '../../../../lib/evidence/submit';
import { privateHeaders } from '../../../../lib/lesson-v2/route-helpers';
export const dynamic = 'force-dynamic';
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers: privateHeaders });
  try {
    const { id } = await context.params;
    if (!/^subm_[0-9a-f]{20}$/.test(id)) return Response.json({ error: 'Not found' }, { status: 404, headers: privateHeaders });
    const db = storage(),
      learner = await resolveLearner(db, user, req, 'read_work');
    if (learner instanceof Response) return learner;
    return Response.json({ submission: await readSubmission(db, learner, id) }, { headers: privateHeaders });
  } catch (e) {
    return apiFailure(e, 'Chưa tải được lời phê.', privateHeaders);
  }
}
