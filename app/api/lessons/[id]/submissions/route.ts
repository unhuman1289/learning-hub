import { measureStorage } from '../../../../../db/timing';
import { env } from 'cloudflare:workers';
import { queuePreparedDaily, queueSubmission } from '../../../../../lib/ai-jobs/queue';
import { getHubUser } from '../../../../../lib/auth/session';
import { apiFailure, ApiError } from '../../../../../lib/api-error';
import { lessonTarget, privateHeaders } from '../../../../../lib/lesson-v2/route-helpers';
import { parseSubmission, readSubmission, submitLesson } from '../../../../../lib/evidence/submit';
export const dynamic = 'force-dynamic';
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const timing = measureStorage();
  const db = timing.db;
  const user = await getHubUser(db);
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers: privateHeaders });
  try {
    const { id } = await context.params;
    const learner = await lessonTarget(db, user, req, id, 'edit_work');
    if (learner instanceof Response) return learner;
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 1400000) throw new ApiError(413, 'Yêu cầu nộp quá lớn.');
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new ApiError(400, 'Dữ liệu nộp không phải JSON hợp lệ.');
    }
    const input = parseSubmission(body);
    const now = new Date();
    const submission = await submitLesson(db, learner, id, input, now);
    // The submission is saved; a full AI queue only delays feedback and must not look like a failed save.
    const job = await queueSubmission(db, env, learner, submission.id, now).catch((error) => {
      console.error('Assess job not queued:', error instanceof Error ? error.message : error);
      return null;
    });
    if (input.stage === null && input.itemIds === null)
      await queuePreparedDaily(db, env, learner, id, now).catch(() => console.error('Next daily plan not queued.'));
    return Response.json({ submission, draftRevision: input.draftRevision + Number(input.answers !== undefined), aiPending: !!job, eta: job?.trigger === 'deferred' ? 'tomorrow' : 'soon' }, { headers: { ...privateHeaders, "Server-Timing": timing.header() } });
  } catch (e) {
    return apiFailure(e, 'Chưa xác nhận nộp bài. Giữ mã lượt nộp và kiểm tra lại.', privateHeaders);
  }
}

// Reconcile an uncertain POST before retrying its immutable client key.
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const db = measureStorage().db;
  const user = await getHubUser(db);
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers: privateHeaders });
  try {
    const { id } = await context.params;
    const learner = await lessonTarget(db, user, req, id, 'edit_work');
    if (learner instanceof Response) return learner;
    const key = new URL(req.url).searchParams.get('clientSubmissionId');
    if (!key || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(key))
      throw new ApiError(400, 'Mã lượt nộp không hợp lệ.');
    const row = await db.prepare('SELECT id FROM submissions WHERE learner_id=? AND lesson_id=? AND client_submission_id=?')
      .bind(learner, id, key).first<{ id: string }>();
    if (!row) return Response.json({ submission: null }, { headers: privateHeaders });
    const lesson = await db.prepare('SELECT draft_revision,draft FROM learning_lessons WHERE id=? AND user_id=?')
      .bind(id, learner).first<{ draft_revision: number; draft: string }>();
    return Response.json({ submission: { ...(await readSubmission(db, learner, row.id)), replayed: true }, draftRevision: lesson?.draft_revision, draft: lesson ? JSON.parse(lesson.draft) : null }, { headers: privateHeaders });
  } catch (e) { return apiFailure(e, 'Chưa kiểm tra được lượt nộp.', privateHeaders); }
}
