import { getHubUser } from '../../../lib/auth/session';
import { apiFailure } from '../../../lib/api-error';
import { berlinDay } from '../../../lib/daily-policy';
import { storage } from '../../../db/storage';
import { resolveLearner } from '../../../lib/access';
import {
  addSecondsSql, isStudyKey, isSubjectKey, readDaySql, readTargetSql, setTargetSql, toStudyDay, validReportSeconds, validTargetMinutes,
} from '../../../lib/study-sql';

// Study time for today (Europe/Berlin). Only the learner adds seconds; guardians and admins may read it,
// and set the daily target when lib/access allows (children cannot change their own target).
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

export async function GET(req: Request) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401 });
  try {
    const learnerId = await resolveLearner(storage(), user, req, 'read_progress');
    if (learnerId instanceof Response) return learnerId;
    return Response.json(await today(learnerId), { headers: { 'Cache-Control': 'no-store' } });
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
    if (!body || !isStudyKey(body.track) || !validReportSeconds(body.seconds)) return Response.json({ error: 'Thời gian học không hợp lệ.' }, { status: 400 });
    // A notebook id only counts for its owner.
    if (isSubjectKey(body.track) && !(await storage().prepare('SELECT 1 AS ok FROM subjects WHERE id = ? AND learner_id = ?').bind(body.track, user.id).first())) {
      return Response.json({ error: 'Thời gian học không hợp lệ.' }, { status: 400 });
    }
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
    const learnerId = await resolveLearner(storage(), user, req, 'edit_settings');
    if (learnerId instanceof Response) return learnerId;
    const body = await req.json().catch(() => null) as { targetMinutes?: unknown } | null;
    if (!body || !validTargetMinutes(body.targetMinutes)) return Response.json({ error: 'Mục tiêu cần từ 5 đến 720 phút.' }, { status: 400 });
    await storage().prepare(setTargetSql).bind(learnerId, body.targetMinutes, new Date().toISOString()).run();
    return Response.json(await today(learnerId));
  } catch (error) {
    return apiFailure(error, 'Chưa lưu được mục tiêu.');
  }
}
