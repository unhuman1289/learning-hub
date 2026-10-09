import { mayApproveAccount, mayCreateSession } from "./approval-policy.ts";

export type PendingApproval = {
  id: string;
  name: string;
  email: string;
  emailVerified: number;
  createdAt: number;
};

export async function listPendingApprovals(db: D1Database): Promise<PendingApproval[]> {
  const result = await db.prepare(
    'SELECT id, name, email, email_verified AS emailVerified, created_at AS createdAt FROM "user" WHERE role = ? AND status = ? AND email_verified = 1 ORDER BY created_at ASC LIMIT 100',
  ).bind("learner", "pending").all<PendingApproval>();
  return result.results ?? [];
}

export async function accountCanCreateSession(db: D1Database, userId: string): Promise<boolean> {
  const account = await db.prepare('SELECT status FROM "user" WHERE id = ?')
    .bind(userId)
    .first<{ status: string | null }>();
  return mayCreateSession(account?.status);
}

export async function approvePendingAccount(db: D1Database, userId: string, now = Date.now()): Promise<boolean> {
  const candidate = await db.prepare('SELECT role, status, email_verified FROM "user" WHERE id = ?')
    .bind(userId)
    .first<{ role: string; status: string; email_verified: number }>();
  if (!candidate || !mayApproveAccount({
    role: candidate.role,
    status: candidate.status,
    emailVerified: candidate.email_verified === 1,
  })) return false;

  const result = await db.prepare(
    'UPDATE "user" SET status = ?, updated_at = ? WHERE id = ? AND role = ? AND status = ? AND email_verified = 1',
  ).bind("active", now, userId, "learner", "pending").run();
  return result.meta.changes === 1;
}
