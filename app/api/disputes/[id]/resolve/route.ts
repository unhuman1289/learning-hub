import { getHubUser } from '../../../../../lib/auth/session';
import { storage } from '../../../../../db/storage';
import { learnerFacts, resolveLearner } from '../../../../../lib/access';
import { apiFailure } from '../../../../../lib/api-error';
import { privateHeaders } from '../../../../../lib/lesson-v2/route-helpers';
import { parseResolution, resolveDispute } from '../../../../../lib/disputes/service';
export const dynamic = 'force-dynamic';

/** Final decision by a parent (or the admin): keep the grade, set a new one, or void the item. */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers: privateHeaders });
  if (req.headers.get('origin') !== new URL(req.url).origin) return Response.json({ error: 'Origin rejected' }, { status: 403, headers: privateHeaders });
  try {
    const { id } = await context.params;
    if (!/^dsp_[0-9a-f]{20}$/.test(id)) return Response.json({ error: 'Not found' }, { status: 404, headers: privateHeaders });
    const db = storage(),
      learner = await resolveLearner(db, user, req, 'resolve_dispute');
    if (learner instanceof Response) return learner;
    const facts = await learnerFacts(db, user, learner);
    const dispute = await resolveDispute(db, learner, id, { id: user.id, asAdmin: !facts.viewerIsGuardian }, parseResolution(await req.json()));
    return Response.json({ dispute }, { headers: privateHeaders });
  } catch (e) {
    return apiFailure(e, 'Chưa lưu được quyết định.', privateHeaders);
  }
}
