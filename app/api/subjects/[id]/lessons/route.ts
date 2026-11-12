import { measureStorage } from '../../../../../db/timing';
import { env } from 'cloudflare:workers';
import { berlinDay } from '../../../../../lib/daily-policy';
import { getHubUser } from '../../../../../lib/auth/session';
import { usesAdaptivePlan } from '../../../../../lib/subjects/sql';
import { resolveLearner } from '../../../../../lib/access';
import { privateHeaders } from '../../../../../lib/lesson-v2/route-helpers';
import { readNotebookLessons } from '../../../../../lib/lesson-v2/notebook-list';
export const dynamic = 'force-dynamic';
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const timing = measureStorage();
  const db = timing.db;
  const user = await getHubUser(db);
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers: privateHeaders });
  const { id } = await context.params;
  if (!/^sub_[0-9a-f]{20}$/.test(id)) return Response.json({ error: 'Not found' }, { status: 404, headers: privateHeaders });
  const learner = await resolveLearner(db, user, req, 'read_work');
  if (learner instanceof Response) return learner;
  const subject = await db.prepare('SELECT status,legacy_track FROM subjects WHERE id=? AND learner_id=?').bind(id, learner).first<{ status: string; legacy_track: string | null }>();
  if (!subject) return Response.json({ error: 'Not found' }, { status: 404, headers: privateHeaders });
  const query = new URL(req.url).searchParams;
  const offset = Math.max(0, Math.min(10000, Number.parseInt(query.get('offset') ?? '0', 10) || 0));
  const adaptive = usesAdaptivePlan(id, subject.legacy_track, env.ADAPTIVE_PILOT_SUBJECT_ID);
  const day = berlinDay();
  const statusOnly = query.get('view') === 'status';
  const [initial, nightly, rows] = await Promise.all([
    subject.status === 'setup' && offset === 0
      ? db.prepare("SELECT status FROM ai_jobs WHERE learner_id=? AND subject_id=? AND purpose='initial' ORDER BY created_at DESC LIMIT 1")
        .bind(learner, id).first<{ status: string }>()
      : null,
    adaptive ? db.prepare("SELECT status,outcome FROM ai_jobs WHERE learner_id=? AND subject_id=? AND adaptive=1 AND purpose='daily' AND learning_day=? ORDER BY created_at DESC LIMIT 1")
      .bind(learner,id,day).first<{ status: string; outcome: string | null }>() : null,
    statusOnly ? null : readNotebookLessons(db, learner, id, query.get('all') === '1', offset, query.get('view') === 'open'),
  ]);
  return Response.json({
    ...rows,
    adaptive, day, nightly, initial, setup: subject.status === 'setup',
  }, { headers: { ...privateHeaders, "Server-Timing": timing.header() } });
}
