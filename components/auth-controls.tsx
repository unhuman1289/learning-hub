"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "../lib/auth/client";

export default function AuthControls({ email }: { email: string }) {
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

  return <div className="account-controls"><span title={email}>{email}</span><button type="button" onClick={signOut} disabled={busy}>{busy ? "…" : "Đăng xuất"}</button></div>;
}
