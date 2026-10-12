import { getHubUser } from '../../../../lib/auth/session';
import { storage } from '../../../../db/storage';
import { apiFailure } from '../../../../lib/api-error';
import { resolveLearner } from '../../../../lib/access';
import { parseSubjectPatch } from '../../../../lib/subjects/policy';
import { getSubject, toView, updateSubject } from '../../../../lib/subjects/service';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
type Context = { params: Promise<{ id: string }> };
const SUBJECT_ID = /^sub_[0-9a-f]{20}$/;

export async function GET(req: Request, context: Context) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers });
  try {
    const { id } = await context.params;
    if (!SUBJECT_ID.test(id)) return Response.json({ error: 'Not found' }, { status: 404, headers });
    const db = storage();
    const learnerId = await resolveLearner(db, user, req, 'read_progress');
    if (learnerId instanceof Response) return learnerId;
    return Response.json({ subject: toView(await getSubject(db, learnerId, id)) }, { headers });
  } catch (error) {
    return apiFailure(error, 'Chưa tải được sổ.', headers);
  }
}

/** Edits goal, level, curriculum, limits, weight, status or ai_enabled; requires the current revision. */
export async function PATCH(req: Request, context: Context) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers });
  if (req.headers.get('origin') !== new URL(req.url).origin) return Response.json({ error: 'Origin rejected' }, { status: 403, headers });
  try {
    const { id } = await context.params;
    if (!SUBJECT_ID.test(id)) return Response.json({ error: 'Not found' }, { status: 404, headers });
    const db = storage();
    const learnerId = await resolveLearner(db, user, req, 'edit_goals');
    if (learnerId instanceof Response) return learnerId;
    const patch = parseSubjectPatch(await req.json());
    return Response.json({ subject: await updateSubject(db, learnerId, id, patch) }, { headers });
  } catch (error) {
    return apiFailure(error, 'Chưa lưu được thay đổi của sổ.', headers);
  }
}
