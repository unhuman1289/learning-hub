import { env } from 'cloudflare:workers';
import { getHubUser } from '../../../../../lib/auth/session';
import { storage } from '../../../../../db/storage';
import { resolveLearner } from '../../../../../lib/access';
import { apiFailure } from '../../../../../lib/api-error';
import { privateHeaders } from '../../../../../lib/lesson-v2/route-helpers';
import { createDispute, parseDispute } from '../../../../../lib/disputes/service';
export const dynamic = 'force-dynamic';

/** "Chấm sai?": the learner disputes the grade of one answer (AI-API §8). */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers: privateHeaders });
  if (req.headers.get('origin') !== new URL(req.url).origin) return Response.json({ error: 'Origin rejected' }, { status: 403, headers: privateHeaders });
  try {
    const { id } = await context.params;
    if (!/^att_[0-9a-f]{20}$/.test(id)) return Response.json({ error: 'Not found' }, { status: 404, headers: privateHeaders });
    const db = storage(),
      learner = await resolveLearner(db, user, req, 'edit_work');
    if (learner instanceof Response) return learner;
    const dispute = await createDispute(db, env, learner, user.id, id, parseDispute(await req.json()));
    return Response.json({ dispute }, { status: 201, headers: privateHeaders });
  } catch (e) {
    return apiFailure(e, 'Chưa gửi được phản đối.', privateHeaders);
  }
}
