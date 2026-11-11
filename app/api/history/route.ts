import { getHubUser } from '../../../lib/auth/session';
import { storage } from '../../../db/storage';
import { resolveLearner } from '../../../lib/access';
import { apiFailure } from '../../../lib/api-error';
import { privateHeaders } from '../../../lib/lesson-v2/route-helpers';
import { historyCsv, historyMarkdown, readHistory } from '../../../lib/history';
export const dynamic = 'force-dynamic';

/** A profile's graded work (L5.6): JSON for the history list, or a CSV / Markdown download. */
export async function GET(req: Request) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers: privateHeaders });
  try {
    const db = storage();
    const learnerId = await resolveLearner(db, user, req, 'read_work');
    if (learnerId instanceof Response) return learnerId;
    const params = new URL(req.url).searchParams;
    const subject = params.get('subject');
    const rows = await readHistory(db, learnerId, {
      subjectId: subject && /^sub_[a-z0-9]{20}$/.test(subject) ? subject : null,
      days: Number(params.get('days') ?? 30) || 30,
      limit: params.get('format') ? 2000 : 200,
    });
    const stamp = new Date().toISOString().slice(0, 10);
    if (params.get('format') === 'csv')
      return new Response(historyCsv(rows), {
        headers: {
          ...privateHeaders,
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="lich-su-${stamp}.csv"`,
        },
      });
    if (params.get('format') === 'md') {
      const name = await db
        .prepare('SELECT coalesce(s.display_name,u.name) AS name FROM user u LEFT JOIN learner_settings s ON s.user_id=u.id WHERE u.id=?')
        .bind(learnerId)
        .first<{ name: string }>();
      return new Response(historyMarkdown(name?.name ?? '', rows), {
        headers: {
          ...privateHeaders,
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="lich-su-${stamp}.md"`,
        },
      });
    }
    return Response.json({ history: rows }, { headers: privateHeaders });
  } catch (e) {
    return apiFailure(e, 'Không đọc được lịch sử làm bài.', privateHeaders);
  }
}
