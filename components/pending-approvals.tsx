"use client";

import { useEffect, useState } from "react";

type PendingUser = { id: string; name: string; email: string; createdAt: number };

export default function PendingApprovals({ isAdmin }: { isAdmin: boolean }) {
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const body = await response.json() as { users?: PendingUser[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Không tải được danh sách chờ duyệt.");
      setUsers(body.users ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không tải được danh sách chờ duyệt.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isAdmin) return;
    let current = true;
    fetch("/api/admin/users", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { users?: PendingUser[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Không tải được danh sách chờ duyệt.");
        if (current) setUsers(body.users ?? []);
      })
      .catch((cause: unknown) => {
        if (current) setError(cause instanceof Error ? cause.message : "Không tải được danh sách chờ duyệt.");
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => { current = false; };
  }, [isAdmin]);

  async function approve(userId: string) {
    setBusyId(userId);
    setError("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Chưa duyệt được tài khoản.");
      setUsers((current) => current.filter((user) => user.id !== userId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chưa duyệt được tài khoản.");
    } finally {
      setBusyId("");
    }
  }

  if (!isAdmin || (loading && users.length === 0 && !error) || (users.length === 0 && !error)) return null;

  return (
    <section className="pending-approvals" aria-labelledby="pending-approvals-title">
      <div className="section-line">
        <div>
          <p className="eyebrow">QUẢN TRỊ</p>
          <h2 id="pending-approvals-title">Tài khoản chờ duyệt <span className="pill">{users.length}</span></h2>
          <p className="muted">Chỉ hiện người đã xác minh email. Duyệt xong, họ có thể đăng nhập.</p>
        </div>
        <button className="approval-refresh" type="button" onClick={() => void load()} disabled={loading}>Tải lại</button>
      </div>
      {error && <p className="account-error" role="alert">{error}</p>}
      {users.length > 0 && (
        <ul>
          {users.map((user) => (
            <li key={user.id}>
              <span><strong>{user.name}</strong><small>{user.email}</small></span>
              <button className="primary" type="button" disabled={Boolean(busyId)} onClick={() => void approve(user.id)}>
                {busyId === user.id ? "Đang duyệt…" : "Duyệt"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {users.length === 0 && error && <p className="empty">Tải lại sau khi kết nối ổn định.</p>}
    </section>
  );
}
