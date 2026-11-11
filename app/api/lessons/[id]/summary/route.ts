import { env } from 'cloudflare:workers';
import { getHubUser } from '../../../../../lib/auth/session';
import { storage } from '../../../../../db/storage';
import { apiFailure } from '../../../../../lib/api-error';
import { lessonSummary } from '../../../../../lib/lesson-v2/summary';
import { usesAdaptivePlan } from '../../../../../lib/subjects/sql';
import { lessonTarget, privateHeaders } from '../../../../../lib/lesson-v2/route-helpers';

export const dynamic = 'force-dynamic';
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers: privateHeaders });
  try {
    const db = storage();
    const { id } = await params;
    const learner = await lessonTarget(db, user, req, id, 'read_work');
    if (learner instanceof Response) return learner;
    const subject = await db.prepare('SELECT s.id,s.legacy_track FROM learning_lessons l JOIN subjects s ON s.id=l.subject_id AND s.learner_id=l.user_id WHERE l.id=? AND l.user_id=?')
      .bind(id, learner).first<{ id: string; legacy_track: string | null }>();
    const adaptive = !!subject && usesAdaptivePlan(subject.id, subject.legacy_track, env.ADAPTIVE_PILOT_SUBJECT_ID);
    return Response.json({ summary: await lessonSummary(db, learner, id), adaptive }, { headers: privateHeaders });
  } catch (error) {
    return apiFailure(error, 'Chưa đọc được tổng kết.', privateHeaders);
  }
}
