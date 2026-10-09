import { getHubUser } from '../../../lib/auth/session';
import { apiFailure } from '../../../lib/api-error';
import { berlinDay } from '../../../lib/daily-policy';
import { storage } from '../../../db/storage';
import {
  addSecondsSql, isStudyTrack, readDaySql, readTargetSql, setTargetSql, toStudyDay, validReportSeconds, validTargetMinutes,
} from '../../../lib/study-sql';

// Study time of the signed-in account for today (Europe/Berlin). Each account only reads and writes its own rows.
async function today(userId: string) {
  const db = storage();
  const day = berlinDay();
  const [rows, target] = await db.batch([
    db.prepare(readDaySql).bind(userId, day),
    db.prepare(readTargetSql).bind(userId),
  ]) as unknown as [{ results?: { track: string; seconds: number }[] }, { results?: { target: number }[] }];
  return toStudyDay(day, rows.results ?? [], target.results?.[0]?.target);
}

function sameOrigin(req: Request) {
  return req.headers.get('origin') === new URL(req.url).origin;
}

export async function GET() {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401 });
  try {
    return Response.json(await today(user.id), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiFailure(error, 'Chưa tải được thời gian học.');
  }
}

/** Adds seconds measured while a notebook was open: {track, seconds}. */
export async function POST(req: Request) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401 });
  if (!sameOrigin(req)) return Response.json({ error: 'Origin rejected' }, { status: 403 });
  try {
    const body = await req.json().catch(() => null) as { track?: unknown; seconds?: unknown } | null;
    if (!body || !isStudyTrack(body.track) || !validReportSeconds(body.seconds)) return Response.json({ error: 'Thời gian học không hợp lệ.' }, { status: 400 });
    await storage().prepare(addSecondsSql).bind(user.id, berlinDay(), body.track, body.seconds, new Date().toISOString()).run();
    return Response.json(await today(user.id));
  } catch (error) {
    return apiFailure(error, 'Chưa lưu được thời gian học.');
  }
}

/** Sets the account's daily target: {targetMinutes}. */
export async function PUT(req: Request) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401 });
  if (!sameOrigin(req)) return Response.json({ error: 'Origin rejected' }, { status: 403 });
  try {
    const body = await req.json().catch(() => null) as { targetMinutes?: unknown } | null;
    if (!body || !validTargetMinutes(body.targetMinutes)) return Response.json({ error: 'Mục tiêu cần từ 5 đến 720 phút.' }, { status: 400 });
    await storage().prepare(setTargetSql).bind(user.id, body.targetMinutes, new Date().toISOString()).run();
    return Response.json(await today(user.id));
  } catch (error) {
    return apiFailure(error, 'Chưa lưu được mục tiêu.');
  }
}
