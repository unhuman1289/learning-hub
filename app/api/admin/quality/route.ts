import { getHubUser } from '../../../../lib/auth/session';
import { storage } from '../../../../db/storage';
import { apiFailure } from '../../../../lib/api-error';
import { privateHeaders } from '../../../../lib/lesson-v2/route-helpers';
import { gradingQuality } from '../../../../lib/quality';
export const dynamic = 'force-dynamic';

/** Grading quality across every learner's notebooks with any AI grading, disputes or key issues. */
export async function GET() {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers: privateHeaders });
  if (user.role !== 'admin') return Response.json({ error: 'Not found' }, { status: 404, headers: privateHeaders });
  try {
    return Response.json({ quality: await gradingQuality(storage(), null) }, { headers: privateHeaders });
  } catch (e) {
    return apiFailure(e, 'Chưa tải được chỉ số chấm.', privateHeaders);
  }
}
