import { getHubUser } from '../../../lib/auth/session';
import { storage } from '../../../db/storage';
import { resolveLearner } from '../../../lib/access';
import { apiFailure } from '../../../lib/api-error';
import { privateHeaders } from '../../../lib/lesson-v2/route-helpers';
import { listDisputes, listDisputesNeedingHuman } from '../../../lib/disputes/service';
export const dynamic = 'force-dynamic';

/** A learner's disputes (self, guardian, admin), or with ?scope=needs_human every dispute waiting for the admin. */
export async function GET(req: Request) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers: privateHeaders });
  try {
    const db = storage(),
      params = new URL(req.url).searchParams;
    if (params.get('scope') === 'needs_human') {
      if (user.role !== 'admin') return Response.json({ error: 'Not found' }, { status: 404, headers: privateHeaders });
      return Response.json({ disputes: await listDisputesNeedingHuman(db) }, { headers: privateHeaders });
    }
    const learner = await resolveLearner(db, user, req, 'read_work');
    if (learner instanceof Response) return learner;
    return Response.json({ disputes: await listDisputes(db, learner, params.get('status') === 'open' ? 'open' : 'all') }, { headers: privateHeaders });
  } catch (e) {
    return apiFailure(e, 'Chưa tải được phản đối.', privateHeaders);
  }
}
