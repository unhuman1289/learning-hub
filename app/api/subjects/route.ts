import {env} from 'cloudflare:workers';
import {enqueue} from '../../../lib/ai-jobs/queue';
import { getHubUser } from '../../../lib/auth/session';
import { storage } from '../../../db/storage';
import { apiFailure } from '../../../lib/api-error';
import { resolveLearner } from '../../../lib/access';
import { parseSubjectInput } from '../../../lib/subjects/policy';
import { createSubject, listSubjects } from '../../../lib/subjects/service';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

/** Notebooks of the signed-in learner, or of ?learner= for a guardian or admin. */
export async function GET(req: Request) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers });
  try {
    const db = storage();
    const learnerId = await resolveLearner(db, user, req, 'read_progress');
    if (learnerId instanceof Response) return learnerId;
    return Response.json({ subjects: await listSubjects(db, learnerId) }, { headers });
  } catch (error) {
    return apiFailure(error, 'Chưa tải được tủ sách.', headers);
  }
}

/** Opens a new notebook in `setup`. Children cannot; a guardian opens it for them with ?learner=. */
export async function POST(req: Request) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers });
  if (req.headers.get('origin') !== new URL(req.url).origin) return Response.json({ error: 'Origin rejected' }, { status: 403, headers });
  try {
    const db = storage();
    const learnerId = await resolveLearner(db, user, req, 'edit_goals');
    if (learnerId instanceof Response) return learnerId;
    const input = parseSubjectInput(await req.json());
    if (input.limits.package === 3 && (user.role !== 'admin' || input.legacyTrack))
      return Response.json({ error: 'Chỉ quản trị viên có thể bật thử dạng bài mới cho sổ riêng.' }, { status: 403, headers });
    const subject = await createSubject(db, learnerId, user.id, input);
    // The notebook is saved; if the initial plan job cannot be queued, an adult can still activate it by hand.
    if (subject.status === 'setup' && env.HUB2_ENABLED === 'true') {
      await enqueue(db, env, { learnerId, kind: 'plan', purpose: 'initial', subjectId: subject.id }).catch((error) =>
        console.error('Initial plan job not queued:', error instanceof Error ? error.message : error),
      );
    }
    return Response.json({ subject }, { status: 201, headers });
  } catch (error) {
    return apiFailure(error, 'Chưa mở được sổ mới.', headers);
  }
}
