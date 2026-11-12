import { measureStorage } from '../../../db/timing';
import { getHubUser } from '../../../lib/auth/session';
import { resolveLearner } from '../../../lib/access';
import { apiFailure } from '../../../lib/api-error';
import { todayFor } from '../../../lib/today';
import { deviceHour } from '../../../lib/greeting';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(req: Request) {
  const timing = measureStorage();
  const db = timing.db;
  const user = await getHubUser(db);
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers });
  try {
    const learner = await resolveLearner(db, user, req, 'read_progress');
    if (learner instanceof Response) return learner;
    return Response.json(await todayFor(db, learner, new Date(), user.id, deviceHour(new URL(req.url).searchParams.get('hour'))), { headers: { ...headers, "Server-Timing": timing.header() } });
  } catch (e) {
    return apiFailure(e, 'Chưa tải được việc học hôm nay.', headers);
  }
}
