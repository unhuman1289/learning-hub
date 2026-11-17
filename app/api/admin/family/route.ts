import { env } from 'cloudflare:workers';
import { getHubUser } from '../../../../lib/auth/session';
import { storage } from '../../../../db/storage';
import { ApiError, apiFailure } from '../../../../lib/api-error';
import { linkGuardian, listFamily, setLearnerProfile, setTutorEnabled, unlinkGuardian } from '../../../../lib/admin/family';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const ID = /^[A-Za-z0-9_-]{1,128}$/;

async function requireAdmin() {
  const user = await getHubUser();
  if (!user) return { response: Response.json({ error: 'Sign in required' }, { status: 401, headers }) };
  if (user.role !== 'admin') return { response: Response.json({ error: 'Admin access required' }, { status: 403, headers }) };
  return { user };
}

/** Accounts with learner role, nickname and guardians. */
export async function GET() {
  const access = await requireAdmin();
  if ('response' in access) return access.response;
  try {
    return Response.json({ members: await listFamily(storage()) }, { headers });
  } catch (error) {
    return apiFailure(error, 'Chưa tải được danh sách gia đình.', headers);
  }
}

/** {action:"profile", userId, role?, displayName?} | {action:"tutor", userId, enabled} | {action:"link"|"unlink", guardianId, learnerId} */
export async function POST(req: Request) {
  const access = await requireAdmin();
  if ('response' in access) { if (env.ENVIRONMENT === 'local') await req.arrayBuffer(); return access.response; }
  if (req.headers.get('origin') !== new URL(req.url).origin) return Response.json({ error: 'Origin rejected' }, { status: 403, headers });
  try {
    const body = await req.json() as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') throw new ApiError(400, 'Dữ liệu không hợp lệ.');
    const id = (key: string) => {
      const value = body[key];
      if (typeof value !== 'string' || !ID.test(value)) throw new ApiError(400, 'Tài khoản không hợp lệ.');
      return value;
    };
    const db = storage();
    if (body.action === 'profile') await setLearnerProfile(db, id('userId'), { role: body.role, displayName: body.displayName });
    else if (body.action === 'tutor') await setTutorEnabled(db, id('userId'), body.enabled);
    else if (body.action === 'link') await linkGuardian(db, id('guardianId'), id('learnerId'), access.user.id);
    else if (body.action === 'unlink') await unlinkGuardian(db, id('guardianId'), id('learnerId'));
    else throw new ApiError(400, 'Thao tác không hợp lệ.');
    return Response.json({ members: await listFamily(db) }, { headers });
  } catch (error) {
    return apiFailure(error, 'Chưa lưu được thay đổi.', headers);
  }
}
