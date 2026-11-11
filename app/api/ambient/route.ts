import { getHubUser } from '../../../lib/auth/session';
import { readAmbient, type Ambient } from '../../../lib/lubeck/ambient';
import { berlinDay } from '../../../lib/daily-policy';
export const dynamic = 'force-dynamic';

const TTL_MS = 30 * 60 * 1000;
// One answer per isolate for half an hour: the window is decoration, so the two public services are asked rarely.
let cached: { key: string; at: number; value: Ambient } | null = null;

/** Today's weather and moon over Lübeck for the study window. Sends nothing about the learner anywhere. */
export async function GET() {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } });
  const now = new Date(),
    day = berlinDay(now);
  if (!cached || cached.key !== day || now.getTime() - cached.at > TTL_MS) {
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }).format(now));
    const offset = (hour - now.getUTCHours() + 24) % 24;
    const value = await readAmbient(fetch, day, `+0${offset}:00`, now);
    // Keep the last good answer when both services fail, so the next call tries again without blanking the sky.
    if (value.weather || value.moon || !cached) cached = { key: day, at: now.getTime(), value };
  }
  return Response.json(cached.value, { headers: { 'Cache-Control': 'private, max-age=900' } });
}
