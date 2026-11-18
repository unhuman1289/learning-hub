import { env } from 'cloudflare:workers';
import { runnerStatus } from '../../../lib/ai-jobs/lease';
import { listViewableLearners } from '../../../lib/learners/list';
import { usesAdaptivePlan } from "../../../lib/subjects/sql";
import { listSubjects } from '../../../lib/subjects/service';
import { measureStorage } from '../../../db/timing';
import { getHubUser } from '../../../lib/auth/session';
import { resolveLearner } from '../../../lib/access';
import { apiFailure } from '../../../lib/api-error';
import { todayFor } from '../../../lib/today';
import { deviceHour } from '../../../lib/greeting';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(req: Request) {
  const url = new URL(req.url);
  const timing = measureStorage();
  const db = timing.db;
  const user = await getHubUser(db);
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers });
  try {
    const learner = await resolveLearner(db, user, req, 'read_work');
    if (learner instanceof Response) return learner;
    const now = new Date();
    const [today, subjects, learners, { results: jobs = [] }] = await Promise.all([
      todayFor(db, learner, now, user.id, deviceHour(url.searchParams.get('hour'))),
      listSubjects(db, learner),
      listViewableLearners(db, user),
      db.prepare(`SELECT DISTINCT subject_id, kind, status FROM ai_jobs
        WHERE learner_id = ? AND status IN ('queued', 'leased') AND expires_at > ?`)
        .bind(learner, now.toISOString())
        .all<{ subject_id: string | null; kind: string; status: string }>(),
    ]);
    const grading = jobs.some(job => job.kind === 'assess');
    const gradingWaits = grading && !(await runnerStatus(db, env.GRADER_CLIENT_ID ?? 'home-runner', now)).online;
    const adaptiveSubjects = subjects.filter(subject =>
      usesAdaptivePlan(subject.id, subject.legacyTrack, env.ADAPTIVE_PILOT_SUBJECT_ID),
    ).map(subject => subject.id);
    const preparing = subjects.flatMap(subject => {
      const plan = jobs.filter(job => job.kind === 'plan' && job.subject_id === subject.id);
      if (!plan.length) return [];
      return [{ subjectId: subject.id, title: subject.title, writing: plan.some(job => job.status === 'leased') }];
    });
    return Response.json(
      { ...today, subjects, learners, adaptiveSubjects, preparing, gradingWaits, gradingActive: grading },
      { headers: { ...headers, "Server-Timing": timing.header(), "X-LH-Profile": user.id } },
    );
  } catch (e) {
    return apiFailure(e, 'Chưa tải được việc học hôm nay.', headers);
  }
}
