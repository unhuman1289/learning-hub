import type { Db } from '../subjects/service.ts';

export type LearnerSummary = { id: string; name: string; role: 'adult' | 'child'; relation: 'self' | 'ward' | 'member' };

/**
 * Whose shelf the viewer may open: always their own, their children's as guardian,
 * and every active account for an admin (docs/hub2 D15). No emails are returned.
 */
export async function listViewableLearners(db: Db, viewer: { id: string; role?: string | null }): Promise<LearnerSummary[]> {
  const sql = viewer.role === 'admin'
    ? `SELECT u.id, COALESCE(s.display_name, u.name) AS name, COALESCE(s.role, 'adult') AS role,
         CASE WHEN u.id = ? THEN 'self' WHEN EXISTS(SELECT 1 FROM guardians g WHERE g.guardian_id = ? AND g.learner_id = u.id) THEN 'ward' ELSE 'member' END AS relation
       FROM "user" u LEFT JOIN learner_settings s ON s.user_id = u.id
       WHERE u.status = 'active' OR u.id = ?`
    : `SELECT u.id, COALESCE(s.display_name, u.name) AS name, COALESCE(s.role, 'adult') AS role,
         CASE WHEN u.id = ? THEN 'self' ELSE 'ward' END AS relation
       FROM "user" u LEFT JOIN learner_settings s ON s.user_id = u.id
       WHERE u.id = ? OR (u.id IN (SELECT learner_id FROM guardians WHERE guardian_id = ?) AND u.status = 'active')`;
  const { results = [] } = await db.prepare(sql).bind(viewer.id, viewer.id, viewer.id).all<LearnerSummary>();
  const order = { self: 0, ward: 1, member: 2 };
  return results
    .map((row) => ({ id: row.id, name: row.name, role: row.role === 'child' ? 'child' as const : 'adult' as const, relation: row.relation }))
    .sort((a, b) => order[a.relation] - order[b.relation] || a.name.localeCompare(b.name, 'vi'));
}
