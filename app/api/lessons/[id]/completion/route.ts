import { env } from 'cloudflare:workers';
import { queuePreparedDaily } from '../../../../../lib/ai-jobs/queue';
import { getHubUser } from '../../../../../lib/auth/session';
import { storage } from '../../../../../db/storage';
import { completeLesson } from '../../../../../lib/lesson-v2/actions';
import { apiFailure, ApiError } from '../../../../../lib/api-error';
import { lessonTarget, privateHeaders } from '../../../../../lib/lesson-v2/route-helpers';
export const dynamic = 'force-dynamic';
export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers: privateHeaders });
  try {
    const { id } = await context.params;
    const db = storage(),
      learner = await lessonTarget(db, user, req, id, 'edit_work');
    if (learner instanceof Response) return learner;
    const body = (await req.json()) as { completed?: unknown; expectedUpdated?: unknown };
    if (!body || typeof body.completed !== 'boolean' || typeof body.expectedUpdated !== 'string') throw new ApiError(400, 'Dữ liệu không hợp lệ.');
    const result = await completeLesson(db, learner, id, body.completed, body.expectedUpdated);
    if (body.completed) await queuePreparedDaily(db, env, learner, id).catch(() => console.error('Next daily plan not queued.'));
    return Response.json(result, { headers: privateHeaders });
  } catch (e) {
    return apiFailure(e, 'Chưa lưu dấu hoàn thành.', privateHeaders);
  }
}
