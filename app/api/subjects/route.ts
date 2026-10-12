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
    return Response.json({ subject: await createSubject(db, learnerId, user.id, input) }, { status: 201, headers });
  } catch (error) {
    return apiFailure(error, 'Chưa mở được sổ mới.', headers);
  }
}
