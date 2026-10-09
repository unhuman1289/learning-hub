"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "../lib/auth/client";

export default function AuthControls({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    const result = await authClient.signOut();
    if (result.error) {
      setBusy(false);
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-paper/85 text-sm font-semibold uppercase text-accent-hover">{name.slice(0, 1)}</span>
      <span title={email} className="hidden max-w-40 truncate text-sm opacity-80 md:inline">{name}</span>
      <button type="button" onClick={signOut} disabled={busy} className="min-h-9 shrink-0 rounded-md border border-oak-dark/60 bg-paper/85 px-3 text-sm text-ink hover:border-accent hover:text-accent-hover disabled:opacity-50">
        {busy ? "Đang thoát…" : "Đăng xuất"}
      </button>
    </div>
  );
}
