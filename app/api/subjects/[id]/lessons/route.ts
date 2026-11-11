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
  const subject = await db.prepare('SELECT id FROM subjects WHERE id=? AND learner_id=?').bind(id, learner).first();
  if (!subject) return Response.json({ error: 'Not found' }, { status: 404, headers: privateHeaders });
  const { results = [] } = await db
    .prepare(
      "SELECT id,json_extract(payload,'$.title') AS title,assigned_date AS assignedDate,completed_at AS completedAt,kind,slot,reason,est_minutes AS minutes FROM learning_lessons WHERE user_id=? AND subject_id=? AND package_version='2' ORDER BY assigned_date DESC,updated DESC LIMIT 100",
    )
    .bind(learner, id)
    .all();
  const adaptive = env.ADAPTIVE_PILOT_SUBJECT_ID === id;
  const day = berlinDay();
  const nightly = adaptive ? await db.prepare("SELECT status,outcome FROM ai_jobs WHERE learner_id=? AND subject_id=? AND adaptive=1 AND purpose='daily' AND learning_day=? ORDER BY created_at DESC LIMIT 1").bind(learner,id,day).first<{ status: string; outcome: string | null }>() : null;
  return Response.json({ lessons: results, adaptive, day, nightly }, { headers: privateHeaders });
}
