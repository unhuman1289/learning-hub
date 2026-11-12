import { env } from 'cloudflare:workers';
import { readNotebookOverview } from '../../../../lib/learner-model/overview';
import { readNotebookReport } from '../../../../lib/notebook-report';
import { berlinDay } from '../../../../lib/daily-policy';
import { addDays } from '../../../../lib/learner-model/rules';
import {readSubjectSkills,readSubjectEffort} from '../../../../lib/learner-model/recompute';
import {learnerFacts} from '../../../../lib/access';
import { getHubUser } from '../../../../lib/auth/session';
import { storage } from '../../../../db/storage';
import { apiFailure } from '../../../../lib/api-error';
import { resolveLearner } from '../../../../lib/access';
import { parseSubjectPatch } from '../../../../lib/subjects/policy';
import { usesAdaptivePlan } from '../../../../lib/subjects/sql';
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
    const subject = toView(await getSubject(db, learnerId, id));
    const facts = await learnerFacts(db, user, learnerId);
    const includeSuspected = user.id !== learnerId || facts.learnerRole !== 'child';
    if (new URL(req.url).searchParams.get('view') === 'overview') {
      const now = new Date();
      const overview = await readNotebookOverview(db, learnerId, id, subject.legacyTrack, now, includeSuspected);
      const report = await readNotebookReport(db, learnerId, id, overview, now, facts.learnerRole, subject.roadmap);
      return Response.json({ ...overview, report }, { headers });
    }
    const details = await readSubjectSkills(db, learnerId, id);
    if (!includeSuspected) details.errors = details.errors.filter(e => e.confidence === 'confirmed');
    const day = berlinDay();
    const { results: study = [] } = await db.prepare(
      "SELECT day,sum(seconds)/60.0 AS minutes FROM study_time WHERE user_id=? AND day BETWEEN ? AND ? AND track IN (?,coalesce((SELECT legacy_track FROM subjects WHERE id=? AND learner_id=?),'')) GROUP BY day",
    ).bind(learnerId,addDays(day,-13),day,id,id,learnerId).all<{ day: string; minutes: number }>();
    const adaptive = usesAdaptivePlan(id, subject.legacyTrack, env.ADAPTIVE_PILOT_SUBJECT_ID);
    const activity = adaptive ? (await db.prepare(
      "SELECT DISTINCT a.day,a.lesson_id AS id,json_extract(l.payload,'$.title') AS title FROM attempts a JOIN learning_lessons l ON l.id=a.lesson_id WHERE a.learner_id=? AND a.subject_id=? AND a.day BETWEEN ? AND ? ORDER BY a.day,a.lesson_id LIMIT 150",
    ).bind(learnerId,id,addDays(day,-13),day).all<{ day: string; id: string; title: string }>()).results ?? [] : [];
    const timeline = Array.from({length:14},(_,index) => {
      const date = addDays(day,index-13);
      return { day: date, minutes: study.find(row => row.day === date)?.minutes ?? 0, lessons: activity.filter(row => row.day === date) };
    });
    return Response.json({ timeline, subject, ...details, effort:await readSubjectEffort(db,learnerId,id) }, { headers });
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
