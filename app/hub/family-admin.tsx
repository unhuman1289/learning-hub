"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import type { FamilyMember } from "../../lib/admin/family";
import { buttonClass } from "./ui";

/** Admin: who is a child, their nickname, and who their guardians are. Saved per change, confirmed by the server. */
export function FamilyAdmin() {
  const [members, setMembers] = useState<FamilyMember[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setError("");
    const response = await fetch("/api/admin/family", { cache: "no-store" });
    const body = await response.json().catch(() => null) as { members?: FamilyMember[]; error?: string } | null;
    if (!response.ok || !body?.members) { setError(body?.error || "Chưa tải được danh sách gia đình."); return; }
    setMembers(body.members);
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function send(key: string, payload: Record<string, unknown>) {
    setBusy(key);
    setError("");
    try {
      const response = await fetch("/api/admin/family", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => null) as { members?: FamilyMember[]; error?: string } | null;
      if (!response.ok || !body?.members) throw Error(body?.error || "Chưa lưu được thay đổi.");
      setMembers(body.members);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy("");
    }
  }

  if (!members) return <p className="text-muted">{error || "Đang tải…"}</p>;
  const nameOf = (id: string) => members.find((item) => item.id === id)?.name ?? "Tài khoản không còn hoạt động";
  return (
    <div className="grid gap-4">
      {error && <p role="alert" className="rounded-md bg-rose-soft px-3 py-2 text-sm leading-6 text-accent-hover">{error}</p>}
      <ul className="grid gap-3">
        {members.map((member) => (
          <MemberRow key={member.id} member={member} members={members} nameOf={nameOf} busy={busy} send={send} />
        ))}
      </ul>
    </div>
  );
}

function MemberRow({ member, members, nameOf, busy, send }: {
  member: FamilyMember; members: FamilyMember[]; nameOf: (id: string) => string; busy: string;
  send: (key: string, payload: Record<string, unknown>) => Promise<void>;
}) {
  const [nickname, setNickname] = useState(member.displayName ?? "");
  const [guardian, setGuardian] = useState("");
  const candidates = members.filter((item) => item.id !== member.id && !member.guardianIds.includes(item.id));
  const working = busy.startsWith(member.id);
  return (
    <li className="grid gap-3 rounded-md border border-line bg-paper px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">{member.name}{member.isAdmin ? " · admin" : ""}</p>
        <p className="text-sm text-muted">{member.email}</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm text-muted">Vai trò
          <select value={member.role} disabled={working} onChange={(event) => void send(`${member.id}:role`, { action: "profile", userId: member.id, role: event.target.value })} className="min-h-9 rounded-md border border-rule bg-paper px-2 text-ink">
            <option value="adult">Người lớn</option>
            <option value="child">Trẻ em</option>
          </select>
        </label>
        <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); void send(`${member.id}:name`, { action: "profile", userId: member.id, displayName: nickname }); }}>
          <label className="grid gap-1 text-sm text-muted">Biệt danh
            <input value={nickname} maxLength={40} onChange={(event) => setNickname(event.target.value)} className="min-h-9 rounded-md border border-rule bg-paper px-2 text-ink" />
          </label>
          <button type="submit" disabled={working || nickname === (member.displayName ?? "")} className={buttonClass("secondary", "min-h-9 px-3")}>Lưu</button>
        </form>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Phụ huynh:</span>
        {member.guardianIds.length === 0 && <span className="text-muted">chưa có</span>}
        {member.guardianIds.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5">
            {nameOf(id)}
            <button type="button" aria-label={`Gỡ ${nameOf(id)} khỏi phụ huynh của ${member.name}`} disabled={working} onClick={() => void send(`${member.id}:unlink`, { action: "unlink", guardianId: id, learnerId: member.id })} className="grid size-6 place-items-center rounded-full hover:bg-rose-soft"><X size={14} aria-hidden="true" /></button>
          </span>
        ))}
        {candidates.length > 0 && (
          <form className="inline-flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); if (guardian) void send(`${member.id}:link`, { action: "link", guardianId: guardian, learnerId: member.id }).then(() => setGuardian("")); }}>
            <label className="sr-only" htmlFor={`guardian-${member.id}`}>Thêm phụ huynh cho {member.name}</label>
            <select id={`guardian-${member.id}`} value={guardian} onChange={(event) => setGuardian(event.target.value)} className="min-h-9 rounded-md border border-rule bg-paper px-2 text-ink">
              <option value="">Thêm phụ huynh…</option>
              {candidates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <button type="submit" disabled={!guardian || working} className={buttonClass("secondary", "min-h-9 px-3")}>Gắn</button>
          </form>
        )}
      </div>
    </li>
  );
}
