import { getHubUser } from '../../../lib/auth/session';
import { storage } from '../../../db/storage';
import { resolveLearner } from '../../../lib/access';
import { apiFailure } from '../../../lib/api-error';
import { privateHeaders } from '../../../lib/lesson-v2/route-helpers';
import { gradingQuality } from '../../../lib/quality';
export const dynamic = 'force-dynamic';

/** Grading quality of one learner's notebooks, for that learner's parent (Sổ liên lạc) or the admin. */
export async function GET(req: Request) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers: privateHeaders });
  try {
    const db = storage(),
      learner = await resolveLearner(db, user, req, 'resolve_dispute');
    if (learner instanceof Response) return learner;
    return Response.json({ quality: await gradingQuality(db, learner) }, { headers: privateHeaders });
  } catch (e) {
    return apiFailure(e, 'Chưa tải được chỉ số chấm.', privateHeaders);
  }
}
