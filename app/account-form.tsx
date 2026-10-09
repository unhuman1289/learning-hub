"use client";

import Link from "next/link";
import { Beam, HouseLogo, OakDesk } from "../components/notebook/house";
import { FormEvent, useState } from "react";

type AccountMode = "login" | "register" | "forgot" | "reset";

const copy = {
  login: { title: "Đăng nhập Learning Hub", submit: "Đăng nhập" },
  register: { title: "Tạo tài khoản", submit: "Tạo tài khoản" },
  forgot: { title: "Đặt lại mật khẩu", submit: "Gửi liên kết đặt lại" },
  reset: { title: "Tạo mật khẩu mới", submit: "Lưu mật khẩu mới" },
} satisfies Record<AccountMode, { title: string; submit: string }>;

async function postAuth(path: string, body: Record<string, string>) {
  const response = await fetch(`/api/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("Bạn đã thử quá nhiều lần. Hãy đợi một phút rồi thử lại.");
    }
    if (response.status >= 500) {
      throw new Error("Dịch vụ đang gặp lỗi. Hãy thử lại sau; nếu vẫn lỗi, báo quản trị viên.");
    }
    if (response.status === 401 && path === "sign-in/email") {
      throw new Error("Chưa đăng nhập được. Kiểm tra email và mật khẩu; nếu mới đăng ký, hãy xác minh email và chờ admin duyệt tài khoản.");
    }
    throw new Error("Yêu cầu chưa hoàn tất. Kiểm tra email và thử lại.");
  }
  return result;
}

export default function AccountForm({ mode, emailVerified = false }: { mode: AccountMode; emailVerified?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "login") {
        await postAuth("sign-in/email", { email, password, callbackURL: "/" });
        window.location.replace("/");
      } else if (mode === "register") {
        if (password !== passwordAgain) throw new Error("Hai mật khẩu chưa khớp.");
        await postAuth("sign-up/email", { email, password, name, callbackURL: "/login?verified=1" });
        setMessage("Đã nhận yêu cầu đăng ký. Hãy xác minh email trong thư gửi đến (kiểm tra cả Spam). Sau khi xác minh, admin cần duyệt tài khoản trước lần đăng nhập đầu tiên.");
      } else if (mode === "forgot") {
        await postAuth("request-password-reset", { email, redirectTo: "/reset-password" });
        setMessage("Nếu tài khoản này tồn tại, email đặt lại mật khẩu đã được yêu cầu. Hãy kiểm tra Inbox và Spam; nếu chưa đăng ký, hãy chọn Tạo tài khoản.");
      } else {
        if (password !== passwordAgain) throw new Error("Hai mật khẩu chưa khớp.");
        const token = new URLSearchParams(window.location.search).get("token") ?? "";
        if (!token) throw new Error("Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.");
        await postAuth("reset-password", { newPassword: password, token });
        setMessage("Mật khẩu đã được cập nhật. Bạn có thể đăng nhập.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Có lỗi xảy ra. Hãy thử lại.");
    } finally {
      setBusy(false);
    }
  }

  const field = "mt-0.5 block min-h-11 w-full rounded-none border-0 border-b-2 border-label-ink/50 bg-transparent px-1 text-base text-label-ink focus:border-label-accent focus-visible:outline-label-accent";
  const label = "block font-hand text-lg leading-6 text-label-muted";
  const note = "rounded-md px-3 py-2 text-sm leading-6";

  return (
    <main className="relative grid min-h-dvh place-items-center px-4 pb-10 pt-20">
      {/* Entering the study: an oak-beamed ceiling above, the notebook waiting on the desk. */}
      <div className="bg-oak absolute inset-x-0 top-0 h-10" aria-hidden="true" />
      <Beam className="absolute inset-x-0 top-10" />
      <div className="w-full max-w-lg">
      <OakDesk>
      {/* The account screens are the cover of the notebook: marble board, cloth spine, name label. */}
      <section className="account-card mx-auto w-full max-w-md overflow-hidden rounded-[4px_14px_14px_4px] bg-marble py-12 pl-[17%] pr-[6%] shadow-cover sm:py-16">
        <div aria-hidden="true" className="absolute inset-y-0 left-0 w-[11%] border-r border-black/40 bg-spine" />
        <div className="rounded-2xl border-4 border-label bg-label px-5 py-6 text-label-ink shadow-[inset_0_0_0_2px_var(--color-label-ink)] sm:px-7">
          <HouseLogo className="mx-auto size-14" />
          <Link href="/" className="block text-center font-hand text-[28px] leading-tight text-label-ink">Learning Hub</Link>
          <p className="text-center font-hand text-base text-label-accent">sổ học cả nhà</p>
          <h1 className="mt-5 font-print text-2xl font-medium">{copy[mode].title}</h1>
          <p className="mt-2 text-sm leading-6 text-label-muted">
            {mode === "register"
              ? "Ai cũng có thể tạo tài khoản bằng email và mật khẩu. Sau khi xác minh email, tài khoản chờ admin duyệt rồi mới đăng nhập được. Mật khẩu cần ít nhất 12 ký tự."
              : mode === "login"
                ? "Dùng email và mật khẩu Learning Hub. Tài khoản mới cần xác minh email và được admin duyệt trước khi đăng nhập."
                : mode === "forgot"
                  ? "Nhập email đã đăng ký. Vì lý do bảo mật, trang luôn xác nhận chung; thư chỉ được gửi nếu tài khoản tồn tại. Hãy kiểm tra cả Spam."
                  : "Chọn mật khẩu mới có ít nhất 12 ký tự."}
          </p>
          <form onSubmit={submit} className="mt-5 grid gap-4">
            {(mode === "register") && (
              <label className={label}>Tên hiển thị<input autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} className={field} /></label>
            )}
            {mode !== "reset" && (
              <label className={label}>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className={field} /></label>
            )}
            {(mode === "login" || mode === "register" || mode === "reset") && (
              <label className={label}>Mật khẩu<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} className={field} /></label>
            )}
            {(mode === "register" || mode === "reset") && (
              <label className={label}>Xác nhận mật khẩu<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={passwordAgain} onChange={(event) => setPasswordAgain(event.target.value)} className={field} /></label>
            )}
            {error && <p className={`${note} bg-[#f7e7ec] text-[#812c4e]`} role="alert">{error}</p>}
            {message && <p className={`${note} bg-[#eeeef2] text-label-ink`} role="status">{message}</p>}
            <button type="submit" disabled={busy} className="brick mt-1 min-h-12 font-semibold focus-visible:outline-label-accent disabled:opacity-60">
              {busy ? "Đang xử lý…" : copy[mode].submit}
            </button>
          </form>
          {mode === "login" && emailVerified && <p className={`${note} mt-4 bg-[#eeeef2] text-label-ink`} role="status">Email đã được xác minh. Nếu tài khoản mới, admin cần duyệt trước khi bạn đăng nhập được.</p>}
          <div className="mt-4 flex flex-wrap justify-between gap-1 text-sm" role="navigation" aria-label="Liên kết tài khoản">
            {mode !== "login" && <a href="/login" className="inline-flex min-h-11 items-center px-1 text-label-accent underline underline-offset-2 focus-visible:outline-label-accent">Đăng nhập</a>}
            {mode !== "register" && <a href="/register" className="inline-flex min-h-11 items-center px-1 text-label-accent underline underline-offset-2 focus-visible:outline-label-accent">Tạo tài khoản</a>}
            {mode !== "forgot" && mode !== "reset" && <a href="/forgot-password" className="inline-flex min-h-11 items-center px-1 text-label-accent underline underline-offset-2 focus-visible:outline-label-accent">Quên mật khẩu?</a>}
          </div>
        </div>
      </section>
      </OakDesk>
      </div>
    </main>
  );
}
