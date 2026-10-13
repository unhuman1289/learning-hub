import { env } from 'cloudflare:workers';
import { queueSubmission } from '../../../../../lib/ai-jobs/queue';
import { getHubUser } from '../../../../../lib/auth/session';
import { storage } from '../../../../../db/storage';
import { apiFailure, ApiError } from '../../../../../lib/api-error';
import { lessonTarget, privateHeaders } from '../../../../../lib/lesson-v2/route-helpers';
import { parseSubmission, submitLesson } from '../../../../../lib/evidence/submit';
export const dynamic = 'force-dynamic';
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers: privateHeaders });
  try {
    const { id } = await context.params;
    const db = storage();
    const learner = await lessonTarget(db, user, req, id, 'edit_work');
    if (learner instanceof Response) return learner;
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 4096) throw new ApiError(413, 'Yêu cầu nộp quá lớn.');
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new ApiError(400, 'Dữ liệu nộp không phải JSON hợp lệ.');
    }
    const submission = await submitLesson(db, learner, id, parseSubmission(body));
    const job = await queueSubmission(db, env, learner, String(submission.id));
    return Response.json({ submission, aiPending: !!job, eta: job?.trigger === 'deferred' ? 'tomorrow' : 'soon' }, { headers: privateHeaders });
  } catch (e) {
    return apiFailure(e, 'Chưa xác nhận nộp bài. Giữ mã lượt nộp và kiểm tra lại.', privateHeaders);
  }
}
