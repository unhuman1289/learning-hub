/**
 * One place that decides who may see or change a learner's data (docs/hub2/DATA-MODEL.md §5).
 * Learners see only their own data, guardians their child's, admins everyone's.
 * Anyone else gets 404, so routes do not reveal whether a learner exists.
 */
export type AccessAction =
  | 'read_progress' // notebooks, goals, progress, study time
  | 'read_work' // lessons, answers, feedback, error patterns
  | 'edit_work' // drafts, submissions, completion: the learner only
  | 'edit_goals' // goal, level, limits, notebook status
  | 'edit_settings' // daily minutes, budgets, nickname
  | 'resolve_dispute'
  | 'edit_workspace'; // notes, journal, project milestones

export type Viewer = { id: string; role?: string | null };
export type LearnerFacts = { learnerRole: 'adult' | 'child'; viewerIsGuardian: boolean };

type Relation = 'self' | 'guardian' | 'admin' | 'other';

const allowed: Record<Exclude<Relation, 'other'>, ReadonlySet<AccessAction>> = {
  self: new Set(['read_progress', 'read_work', 'edit_work', 'edit_goals', 'edit_settings', 'edit_workspace']),
  guardian: new Set(['read_progress', 'read_work', 'edit_goals', 'edit_settings', 'resolve_dispute']),
  admin: new Set(['read_progress', 'read_work', 'edit_goals', 'edit_settings', 'resolve_dispute']),
};

function relation(viewer: Viewer, learnerId: string, facts: LearnerFacts): Relation {
  if (viewer.id === learnerId) return 'self';
  if (facts.viewerIsGuardian) return 'guardian';
  if (viewer.role === 'admin') return 'admin';
  return 'other';
}

/** Pure decision; tests cover every cell. */
export function decideAccess(viewer: Viewer, learnerId: string, action: AccessAction, facts: LearnerFacts): boolean {
  const rel = relation(viewer, learnerId, facts);
  if (rel === 'other') return false;
  // Children study and submit, but goals, limits and minutes are set by a guardian.
  if (rel === 'self' && facts.learnerRole === 'child' && (action === 'edit_goals' || action === 'edit_settings')) return false;
  return allowed[rel].has(action);
}

type Db = { prepare(sql: string): { bind(...values: unknown[]): { first<T = Record<string, unknown>>(): Promise<T | null> } } };

export async function learnerFacts(db: Db, viewer: Viewer, learnerId: string): Promise<LearnerFacts> {
  const row = await db.prepare(`SELECT
     (SELECT role FROM learner_settings WHERE user_id = ?) AS learner_role,
     EXISTS(SELECT 1 FROM guardians WHERE guardian_id = ? AND learner_id = ?) AS is_guardian`)
    .bind(learnerId, viewer.id, learnerId).first<{ learner_role: string | null; is_guardian: number }>();
  return { learnerRole: row?.learner_role === 'child' ? 'child' : 'adult', viewerIsGuardian: Number(row?.is_guardian) === 1 };
}

export async function canAccessLearner(db: Db, viewer: Viewer, learnerId: string, action: AccessAction): Promise<boolean> {
  if (viewer.id === learnerId && action !== 'edit_goals' && action !== 'edit_settings') return decideAccess(viewer, learnerId, action, { learnerRole: 'adult', viewerIsGuardian: false });
  return decideAccess(viewer, learnerId, action, await learnerFacts(db, viewer, learnerId));
}

const LEARNER_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** 403 when learners hit a limit on their own data (a child changing minutes); 404 for anyone else's. */
export function denied(viewer: Viewer, learnerId: string) {
  const own = viewer.id === learnerId;
  return Response.json({ error: own ? 'Cần phụ huynh thay đổi mục này.' : 'Not found' }, { status: own ? 403 : 404, headers: { 'Cache-Control': 'private, no-store' } });
}

/**
 * Resolves `?learner=` for a request. Without it, the viewer acts on their own data.
 * Returns the learner id, or a 403/404 Response (see `denied`) when the viewer may not act on that learner.
 */
export async function resolveLearner(db: Db, viewer: Viewer, request: Request, action: AccessAction): Promise<string | Response> {
  const requested = new URL(request.url).searchParams.get('learner');
  const learnerId = requested ?? viewer.id;
  if (!LEARNER_ID.test(learnerId) || !(await canAccessLearner(db, viewer, learnerId, action))) return denied(viewer, learnerId);
  return learnerId;
}
