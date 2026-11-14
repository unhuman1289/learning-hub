import { readStudyDay } from '../../../../lib/study-day';
import { env } from 'cloudflare:workers';
import { learnerFacts } from '../../../../lib/access';
import { runnerStatus } from '../../../../lib/ai-jobs/lease';
import { getHubUser } from '../../../../lib/auth/session';
import { storage } from '../../../../db/storage';
import { apiFailure } from '../../../../lib/api-error';
import {readLessonSubmissions, readSubmission} from '../../../../lib/evidence/submit';
import { readLessonV2 } from '../../../../lib/lesson-v2/store';
import { lessonTarget, privateHeaders } from '../../../../lib/lesson-v2/route-helpers';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

/** A v2 lesson for its learner, or for a guardian or admin with ?learner= (read-only). */
export async function GET(req: Request, context: Context) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers: privateHeaders });
  try {
    const { id } = await context.params;
    const db = storage();
    const learnerId = await lessonTarget(db, user, req, id, 'read_work');
    if (learnerId instanceof Response) return learnerId;
    if (new URL(req.url).searchParams.get('view') === 'reader') {
      const [lesson, submissions, facts, study] = await Promise.all([
        readLessonV2(db, learnerId, id),
        readLessonSubmissions(db, learnerId, id),
        user.learnerRole && user.id === learnerId ? { learnerRole: user.learnerRole } : learnerFacts(db, user, learnerId),
        readStudyDay(db, user.id),
      ]);
      const runner = submissions.some(entry => entry.attempts.some(attempt => ("status" in attempt && attempt.status === "pending") || attempt.dispute?.status === "rechecking"))
        ? await runnerStatus(db, env.GRADER_CLIENT_ID ?? "home-runner") : null;
      return Response.json({ lesson, submissions, child: facts.learnerRole === "child", runner, study }, { headers: privateHeaders });
    }
    const lesson=await readLessonV2(db,learnerId,id);
    const latest=await db.prepare('SELECT id FROM submissions WHERE lesson_id=? AND learner_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1').bind(id,learnerId).first<{id:string}>();
    return Response.json({lesson:{...lesson,lastSubmission:latest?await readSubmission(db,learnerId,latest.id):null}},{headers:privateHeaders});
  } catch (error) {
    return apiFailure(error, 'Chưa mở được bài.', privateHeaders);
  }
}
