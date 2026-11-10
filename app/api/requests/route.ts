import { env } from 'cloudflare:workers';
import { getHubUser } from '../../../lib/auth/session';
import { storage } from '../../../db/storage';
import { canAccessLearner, denied, resolveLearner } from '../../../lib/access';
import { apiFailure } from '../../../lib/api-error';
import { privateHeaders } from '../../../lib/lesson-v2/route-helpers';
import { createRequest, listRequests, needsGoalAccess, parseRequest } from '../../../lib/requests/service';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers: privateHeaders });
  try {
    const db = storage(),
      learner = await resolveLearner(db, user, req, 'read_work');
    if (learner instanceof Response) return learner;
    return Response.json({ requests: await listRequests(db, learner) }, { headers: privateHeaders });
  } catch (e) {
    return apiFailure(e, 'Chưa tải được yêu cầu.', privateHeaders);
  }
}

/** "Hỏi thêm", "Xin thêm bài" (learner or parent); "Tuần này ở trường", "Dặn planner" (adult learner or parent). */
export async function POST(req: Request) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers: privateHeaders });
  if (req.headers.get('origin') !== new URL(req.url).origin) return Response.json({ error: 'Origin rejected' }, { status: 403, headers: privateHeaders });
  try {
    const db = storage(),
      learner = await resolveLearner(db, user, req, 'read_work');
    if (learner instanceof Response) return learner;
    const input = parseRequest(await req.json());
    const allowed = needsGoalAccess(input.kind)
      ? await canAccessLearner(db, user, learner, 'edit_goals')
      : (await canAccessLearner(db, user, learner, 'edit_work')) || (await canAccessLearner(db, user, learner, 'edit_goals'));
    if (!allowed) return denied(user, learner);
    return Response.json({ request: await createRequest(db, env, learner, user.id, input) }, { status: 201, headers: privateHeaders });
  } catch (e) {
    return apiFailure(e, 'Chưa gửi được yêu cầu.', privateHeaders);
  }
}
