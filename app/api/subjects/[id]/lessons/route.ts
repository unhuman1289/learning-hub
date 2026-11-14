import { measureStorage } from '../../../../../db/timing';
import { env } from 'cloudflare:workers';
import { getHubUser } from '../../../../../lib/auth/session';
import { resolveLearner } from '../../../../../lib/access';
import { privateHeaders } from '../../../../../lib/lesson-v2/route-helpers';
import { readNotebookBook } from '../../../../../lib/lesson-v2/notebook-book';
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
  const mode = query.get('view');
  const view = mode === 'open' || mode === 'status' ? mode : query.get('all') === '1' ? 'history' : 'default';
  const book = await readNotebookBook(db, learner, id, subject, view, offset, env.ADAPTIVE_PILOT_SUBJECT_ID);
  return Response.json(book, { headers: { ...privateHeaders, "Server-Timing": timing.header() } });
}
