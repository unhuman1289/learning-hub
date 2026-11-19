import { ApiError } from '../api-error.ts';
import { tutorSelfOptions, type TutorSelf } from '../tutor/address.ts';
import type { Db } from '../subjects/service.ts';

export function familyAccessError(user: { role?: string | null } | null) {
  if (!user) return new ApiError(401, 'Sign in required');
  if (user.role !== 'admin') return new ApiError(403, 'Admin access required');
  return null;
}

export type FamilyMember = {
  id: string; name: string; email: string; isAdmin: boolean;
  role: 'adult' | 'child'; displayName: string | null; guardianIds: string[]; tutorEnabled: boolean;
  tutorSelf: TutorSelf | null; tutorCall: string | null;
};

/** Active accounts with their learner role, nickname and guardians. Admin only. */
export async function listFamily(db: Db): Promise<FamilyMember[]> {
  const { results: users = [] } = await db.prepare(`SELECT u.id, u.name, u.email, u.role AS account_role, COALESCE(s.role, 'adult') AS role, s.display_name, COALESCE(s.tutor_enabled, 1) AS tutor_enabled, s.tutor_self, s.tutor_call
    FROM "user" u LEFT JOIN learner_settings s ON s.user_id = u.id WHERE u.status = 'active' ORDER BY u.created_at, u.id`)
    .all<{ id: string; name: string; email: string; account_role: string | null; role: string; display_name: string | null; tutor_enabled: number; tutor_self: TutorSelf | null; tutor_call: string | null }>();
  const { results: links = [] } = await db.prepare('SELECT guardian_id, learner_id FROM guardians ORDER BY created_at').all<{ guardian_id: string; learner_id: string }>();
  return users.map((user) => ({
    id: user.id, name: user.name, email: user.email, isAdmin: user.account_role === 'admin',
    role: user.role === 'child' ? 'child' : 'adult', displayName: user.display_name, tutorEnabled: user.tutor_enabled === 1,
    tutorSelf: user.tutor_self, tutorCall: user.tutor_call,
    guardianIds: links.filter((link) => link.learner_id === user.id).map((link) => link.guardian_id),
  }));
}

async function requireActive(db: Db, id: string) {
  const row = await db.prepare(`SELECT 1 AS ok FROM "user" WHERE id = ? AND status = 'active'`).bind(id).first();
  if (!row) throw new ApiError(404, 'Không tìm thấy tài khoản đang hoạt động.');
}

export async function setLearnerProfile(db: Db, userId: string, profile: { role?: unknown; displayName?: unknown }, now = new Date()) {
  await requireActive(db, userId);
  if (profile.role !== undefined && profile.role !== 'adult' && profile.role !== 'child') throw new ApiError(400, 'Vai trò phải là người lớn hoặc trẻ em.');
  let displayName: string | null | undefined;
  if (profile.displayName !== undefined) {
    if (profile.displayName === null || profile.displayName === '') displayName = null;
    else if (typeof profile.displayName === 'string' && profile.displayName.trim().length <= 40) displayName = profile.displayName.trim() || null;
    else throw new ApiError(400, 'Biệt danh tối đa 40 ký tự.');
  }
  if (profile.role === undefined && displayName === undefined) throw new ApiError(400, 'Không có gì để sửa.');
  const current = await db.prepare('SELECT role, display_name FROM learner_settings WHERE user_id = ?').bind(userId).first<{ role: string; display_name: string | null }>();
  const role = (profile.role as string | undefined) ?? current?.role ?? 'adult';
  const name = displayName === undefined ? current?.display_name ?? null : displayName;
  await db.prepare(`INSERT INTO learner_settings (user_id, daily_target_minutes, updated, role, display_name) VALUES (?, 60, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET role = excluded.role, display_name = excluded.display_name, updated = excluded.updated`)
    .bind(userId, now.toISOString(), role, name).run();
}

export async function setTutorAddress(db: Db, userId: string, address: { self?: unknown; call?: unknown }, now = new Date()) {
  const { self, call } = address;
  if (self === undefined && call === undefined) throw new ApiError(400, 'Không có gì để sửa.');
  if (self != null && !tutorSelfOptions.some(option => option === self))
    throw new ApiError(400, 'Chọn cách Bột xưng là con, em hoặc cháu.');
  if (call != null && (typeof call !== 'string' || [...call].length > 30 || /[\0\r\n\v\f\u0085\u2028\u2029]/u.test(call)))
    throw new ApiError(400, 'Cách Bột gọi tối đa 30 ký tự và chỉ viết trên một dòng.');
  await requireActive(db, userId);
  // Omitted fields retain their last confirmed value. Null explicitly restores the default.
  await db.prepare(`INSERT INTO learner_settings (user_id, updated, tutor_self, tutor_call) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      tutor_self = CASE WHEN ? THEN excluded.tutor_self ELSE learner_settings.tutor_self END,
      tutor_call = CASE WHEN ? THEN excluded.tutor_call ELSE learner_settings.tutor_call END,
      updated = excluded.updated`)
    .bind(userId, now.toISOString(), self ?? null, typeof call === 'string' ? call.trim() || null : null,
      Number(self !== undefined), Number(call !== undefined)).run();
}

export async function setTutorEnabled(db: Db, userId: string, enabled: unknown, now = new Date()) {
  if (typeof enabled !== 'boolean') throw new ApiError(400, 'Chọn bật hoặc tắt gia sư.');
  await requireActive(db, userId);
  await db.prepare(`INSERT INTO learner_settings (user_id, updated, tutor_enabled) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET tutor_enabled = excluded.tutor_enabled, updated = excluded.updated`)
    .bind(userId, now.toISOString(), Number(enabled)).run();
}

/** A guardian may read their child's work and set goals and minutes (lib/access.ts). */
export async function linkGuardian(db: Db, guardianId: string, learnerId: string, adminId: string, now = new Date()) {
  if (guardianId === learnerId) throw new ApiError(400, 'Một người không làm phụ huynh của chính mình.');
  await requireActive(db, guardianId);
  await requireActive(db, learnerId);
  await db.prepare('INSERT OR IGNORE INTO guardians (guardian_id, learner_id, created_by, created_at) VALUES (?, ?, ?, ?)')
    .bind(guardianId, learnerId, adminId, now.toISOString()).run();
}

export async function unlinkGuardian(db: Db, guardianId: string, learnerId: string) {
  const result = await db.prepare('DELETE FROM guardians WHERE guardian_id = ? AND learner_id = ?').bind(guardianId, learnerId).run();
  if (!result.meta.changes) throw new ApiError(404, 'Không có liên kết phụ huynh này.');
}
