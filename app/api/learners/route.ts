import { getHubUser } from '../../../lib/auth/session';
import { storage } from '../../../db/storage';
import { apiFailure } from '../../../lib/api-error';
import { listViewableLearners } from '../../../lib/learners/list';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

/** Learners whose shelf the signed-in account may open: self, wards, and everyone for an admin. */
export async function GET() {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers });
  try {
    return Response.json({ learners: await listViewableLearners(storage(), user) }, { headers });
  } catch (error) {
    return apiFailure(error, 'Chưa tải được danh sách người học.', headers);
  }
}
