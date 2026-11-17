import { env } from 'cloudflare:workers';
import { getHubUser } from '../../../../../lib/auth/session';
import { storage } from '../../../../../db/storage';
import { apiFailure } from '../../../../../lib/api-error';
import { canAccessLearner, denied } from '../../../../../lib/access';
import { parseSettingsPatch, readSettings, updateSettings } from '../../../../../lib/learners/settings';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
type Context = { params: Promise<{ id: string }> };
const LEARNER_ID = /^[A-Za-z0-9_-]{1,128}$/;
const notFound = () => Response.json({ error: 'Not found' }, { status: 404, headers });

/** The learner's settings; `me` is the signed-in account. */
async function target(context: Context, userId: string) {
  const { id } = await context.params;
  const learnerId = id === 'me' ? userId : id;
  return LEARNER_ID.test(learnerId) ? learnerId : null;
}

export async function GET(_req: Request, context: Context) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers });
  try {
    const learnerId = await target(context, user.id);
    const db = storage();
    if (!learnerId) return notFound();
    if (!(await canAccessLearner(db, user, learnerId, 'read_progress'))) return denied(user, learnerId);
    return Response.json({ settings: await readSettings(db, learnerId) }, { headers });
  } catch (error) {
    return apiFailure(error, 'Chưa tải được cài đặt.', headers);
  }
}

/** Daily minutes, nickname, explanation language, preferences, AI budget. Children cannot edit their own. */
export async function PATCH(req: Request, context: Context) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers });
  if (req.headers.get('origin') !== new URL(req.url).origin) return Response.json({ error: 'Origin rejected' }, { status: 403, headers });
  try {
    const learnerId = await target(context, user.id);
    const db = storage();
    if (!learnerId) return notFound();
    if (!(await canAccessLearner(db, user, learnerId, 'edit_settings'))) {
      if (env.ENVIRONMENT === 'local') await req.arrayBuffer();
      return denied(user, learnerId);
    }
    return Response.json({ settings: await updateSettings(db, learnerId, parseSettingsPatch(await req.json())) }, { headers });
  } catch (error) {
    return apiFailure(error, 'Chưa lưu được cài đặt.', headers);
  }
}
