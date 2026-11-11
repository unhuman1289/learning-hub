import { env } from 'cloudflare:workers';
import { berlinDay } from '../../../../../lib/daily-policy';
import { getHubUser } from '../../../../../lib/auth/session';
import { storage } from '../../../../../db/storage';
import { resolveLearner } from '../../../../../lib/access';
import { privateHeaders } from '../../../../../lib/lesson-v2/route-helpers';
export const dynamic = 'force-dynamic';
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers: privateHeaders });
  const { id } = await context.params;
  if (!/^sub_[0-9a-f]{20}$/.test(id)) return Response.json({ error: 'Not found' }, { status: 404, headers: privateHeaders });
  const db = storage(),
    learner = await resolveLearner(db, user, req, 'read_work');
  if (learner instanceof Response) return learner;
  const subject = await db.prepare('SELECT status FROM subjects WHERE id=? AND learner_id=?').bind(id, learner).first<{ status: string }>();
  if (!subject) return Response.json({ error: 'Not found' }, { status: 404, headers: privateHeaders });
  const offset = Math.max(0, Math.min(10000, Number.parseInt(new URL(req.url).searchParams.get('offset') ?? '0', 10) || 0));
  const initial = subject.status === 'setup' && offset === 0
    ? await db.prepare("SELECT status FROM ai_jobs WHERE learner_id=? AND subject_id=? AND purpose='initial' ORDER BY created_at DESC LIMIT 1")
      .bind(learner, id).first<{ status: string }>()
    : null;
  const { results = [] } = await db
    .prepare(
      "SELECT id,json_extract(payload,'$.title') AS title,assigned_date AS assignedDate,completed_at AS completedAt,kind,slot,reason,est_minutes AS minutes,(SELECT name FROM skills WHERE id=json_extract(learning_lessons.payload,'$.targetSkills[0]') AND learner_id=learning_lessons.user_id AND subject_id=learning_lessons.subject_id) AS skill FROM learning_lessons WHERE user_id=? AND subject_id=? AND package_version='2' ORDER BY completed_at IS NOT NULL, coalesce(completed_at,updated) DESC,id DESC LIMIT 51 OFFSET ?",
    )
    .bind(learner, id, offset)
    .all();
  const adaptive = env.ADAPTIVE_PILOT_SUBJECT_ID === id;
  const day = berlinDay();
  const nightly = adaptive ? await db.prepare("SELECT status,outcome FROM ai_jobs WHERE learner_id=? AND subject_id=? AND adaptive=1 AND purpose='daily' AND learning_day=? ORDER BY created_at DESC LIMIT 1").bind(learner,id,day).first<{ status: string; outcome: string | null }>() : null;
  return Response.json({
    lessons: results.slice(0, 50),
    nextOffset: results.length > 50 ? offset + 50 : null,
    adaptive, day, nightly, initial, setup: subject.status === 'setup',
  }, { headers: privateHeaders });
}
