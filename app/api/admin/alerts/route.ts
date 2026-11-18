import { getHubUser } from '../../../../lib/auth/session';
import { storage } from '../../../../db/storage';
import { berlinDay } from '../../../../lib/daily-policy';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET() {
  const user = await getHubUser();
  if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: user ? 403 : 401, headers });
  const db = storage();
  const { results = [] } = await db
    .prepare('SELECT code,message,email_state FROM alert_events WHERE learning_day=? ORDER BY created_at')
    .bind(berlinDay())
    .all();
  return Response.json({ alerts: results }, { headers });
}
