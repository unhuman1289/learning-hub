import { ApiError } from './api-error.ts';
import { sha256Hex } from './auth/automation.ts';

type Db = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T = Record<string, unknown>>(): Promise<T | null>;
      all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
      run(): Promise<{ meta: { changes: number } }>;
    };
  };
  batch(statements: unknown[]): Promise<unknown>;
};

export type ProfileView = { id: string; displayName: string; avatar: string; role: 'adult' | 'child' };

/** Existing accounts are private until explicitly included. New household profiles need no account or email. */
export function householdProfileVisible(row: { id: string; email: string }, legacyIds?: string) {
  return (/^prf_[a-f0-9]{20}$/.test(row.id) && row.email === 'profile+' + row.id + '@local.invalid') ||
    (legacyIds ?? '').split(',').some((id) => id.trim() === row.id);
}

/** Every active, visible profile in the household, for the "Ai đang học?" picker. */
export async function listProfiles(db: Db, legacyIds?: string): Promise<ProfileView[]> {
  const { results = [] } = await db
    .prepare(
      "SELECT u.id, u.email, coalesce(s.display_name, u.name) AS display_name, coalesce(s.avatar,'') AS avatar, coalesce(s.role,'adult') AS role FROM user u LEFT JOIN learner_settings s ON s.user_id=u.id WHERE u.status='active' ORDER BY u.created_at, u.id",
    )
    .bind()
    .all<{ id: string; email: string; display_name: string; avatar: string; role: 'adult' | 'child' }>();
  return results.filter((row) => householdProfileVisible(row, legacyIds)).map((r) => ({ id: r.id, displayName: r.display_name, avatar: r.avatar, role: r.role }));
}

export async function activeProfile(db: Db, id: unknown, legacyIds?: string) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new ApiError(400, 'Hồ sơ không hợp lệ.');
  const row = await db.prepare("SELECT id,email FROM user WHERE id=? AND status='active'").bind(id).first<{ id: string; email: string }>();
  if (!row || !householdProfileVisible(row, legacyIds)) throw new ApiError(404, 'Không tìm thấy hồ sơ.');
  return row.id;
}

const avatarPattern = /^[\p{Extended_Pictographic}\p{L}\p{N}‍️]{0,8}$/u;

/** A new profile is a user row without password or real email, plus its settings. */
export async function createProfile(db: Db, input: unknown, now = new Date()) {
  if (!input || typeof input !== 'object') throw new ApiError(400, 'Dữ liệu hồ sơ không hợp lệ.');
  const { displayName, role, avatar } = input as Record<string, unknown>;
  if (typeof displayName !== 'string' || displayName.trim().length < 1 || displayName.trim().length > 40)
    throw new ApiError(400, 'Tên hiển thị cần 1–40 ký tự.');
  if (role !== 'adult' && role !== 'child') throw new ApiError(400, 'Vai trò là người lớn hoặc trẻ em.');
  const icon = typeof avatar === 'string' ? avatar.trim() : '';
  if (!avatarPattern.test(icon)) throw new ApiError(400, 'Biểu tượng tối đa vài ký tự hoặc emoji.');
  const id = 'prf_' + crypto.randomUUID().replaceAll('-', '').slice(0, 20),
    name = displayName.trim(),
    ms = now.getTime();
  await db.batch([
    db
      .prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at,role,status) VALUES(?,?,?,0,?,?,'learner','active')")
      .bind(id, name, 'profile+' + id + '@local.invalid', ms, ms),
    db
      .prepare('INSERT INTO learner_settings(user_id,daily_target_minutes,updated,role,display_name,avatar) VALUES(?,30,?,?,?,?)')
      .bind(id, now.toISOString(), role, name, icon),
  ]);
  return { id, displayName: name, avatar: icon, role } as ProfileView;
}

/** Hides a profile from the picker; its notebooks and history stay in the database. */
export async function archiveProfile(db: Db, id: unknown) {
  const profile = await activeProfile(db, id); // Legacy accounts must remain active for their independent OAuth connections.
  await db.prepare("UPDATE user SET status='disabled',updated_at=? WHERE id=?").bind(Date.now(), profile).run();
}

/** Optional 4–8 digit PIN for "Chế độ quản lý". It keeps children from changing settings by accident; it is not security. */
export async function setManagePin(db: Db, pin: unknown, now = new Date()) {
  if (pin !== null && (typeof pin !== 'string' || !/^\d{4,8}$/.test(pin))) throw new ApiError(400, 'PIN gồm 4–8 chữ số.');
  const hash = pin === null ? null : await sha256Hex('lh-manage:' + pin);
  await db
    .prepare(
      'INSERT INTO household_settings(id,manage_pin_sha256,updated_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET manage_pin_sha256=excluded.manage_pin_sha256,updated_at=excluded.updated_at',
    )
    .bind(hash, now.toISOString())
    .run();
}
export async function checkManagePin(db: Db, pin: unknown) {
  const row = await db.prepare('SELECT manage_pin_sha256 FROM household_settings WHERE id=1').bind().first<{ manage_pin_sha256: string | null }>();
  if (!row?.manage_pin_sha256) return true;
  return typeof pin === 'string' && (await sha256Hex('lh-manage:' + pin)) === row.manage_pin_sha256;
}
