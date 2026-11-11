import { env } from 'cloudflare:workers';
import { getHubUser } from '../../../lib/auth/session';
import { storage } from '../../../db/storage';
import { apiFailure } from '../../../lib/api-error';
import { privateHeaders } from '../../../lib/lesson-v2/route-helpers';
import { runnerStatus } from '../../../lib/ai-jobs/lease';
export const dynamic = 'force-dynamic';

/** Whether the family Mac that grades open answers is reachable, so waiting work can say why it waits. */
export async function GET() {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers: privateHeaders });
  try {
    return Response.json(await runnerStatus(storage(), env.GRADER_CLIENT_ID ?? 'home-runner'), { headers: privateHeaders });
  } catch (e) {
    return apiFailure(e, 'Không đọc được trạng thái máy chấm.', privateHeaders);
  }
}
