import {env} from 'cloudflare:workers';
import {enqueue} from '../../../lib/ai-jobs/queue';
import { getHubUser } from '../../../lib/auth/session';
import { storage } from '../../../db/storage';
import { apiFailure } from '../../../lib/api-error';
import { learnerFacts, resolveLearner } from '../../../lib/access';
import { parseSubjectInput } from '../../../lib/subjects/policy';
import { createSubject, listSubjects } from '../../../lib/subjects/service';
import { DEFAULT_LIMITS } from '../../../lib/subjects/sql';

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

/** Opens a new notebook in `setup` for the learner (a child included) or, with ?learner=, for a learner the viewer manages. */
export async function POST(req: Request) {
  const user = await getHubUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers });
  if (req.headers.get('origin') !== new URL(req.url).origin) return Response.json({ error: 'Origin rejected' }, { status: 403, headers });
  try {
    const db = storage();
    const learnerId = await resolveLearner(db, user, req, 'manage_notebooks');
    if (learnerId instanceof Response) return learnerId;
    const raw = await req.json();
    const input = parseSubjectInput(raw);
    const role=(await learnerFacts(db,user,learnerId)).learnerRole;
    if(role==='adult'&&!input.legacyTrack&&(raw as { limits?: { maxDifficulty?: number } }).limits?.maxDifficulty===undefined)input.limits.maxDifficulty=5;
    // A child opens a notebook for themselves; limits and priority stay at the defaults a guardian can change later.
    if (user.id === learnerId && role === 'child') {
      input.limits = { ...DEFAULT_LIMITS };
      input.weight = 3;
    }
    if (input.limits.itemKinds && user.role !== 'admin')
      return Response.json({ error: 'Chỉ quản trị viên có thể đổi dạng câu.' }, { status: 403, headers });
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
