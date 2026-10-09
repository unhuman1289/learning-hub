"use client";

import Link from "next/link";
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
  if (!response.ok) throw new Error("Yêu cầu chưa hoàn tất. Hãy kiểm tra thông tin và thử lại.");
  return response.json() as Promise<Record<string, unknown>>;
}

export default function AccountForm({ mode }: { mode: AccountMode }) {
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
        await postAuth("sign-up/email", { email, password, name, callbackURL: "/" });
        setMessage("Nếu email này đã được mời, hãy mở thư xác minh để kích hoạt tài khoản.");
      } else if (mode === "forgot") {
        await postAuth("request-password-reset", { email, redirectTo: "/reset-password" });
        setMessage("Nếu tài khoản tồn tại, hướng dẫn đặt lại mật khẩu sẽ được gửi qua email.");
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

  return (
    <main className="account-page">
      <Link className="account-brand" href="/">Learning Hub</Link>
      <section className="account-card">
        <p className="eyebrow">HỌC CÙNG NHAU · TÀI KHOẢN RIÊNG</p>
        <h1>{copy[mode].title}</h1>
        <p className="account-intro">
          {mode === "register"
            ? "Tài khoản chỉ dành cho email đã được mời. Mật khẩu cần có ít nhất 12 ký tự."
            : mode === "login"
              ? "Dùng email và mật khẩu Learning Hub của bạn."
              : mode === "forgot"
                ? "Nhập email tài khoản để nhận liên kết đặt lại."
                : "Chọn mật khẩu mới có ít nhất 12 ký tự."}
        </p>
        <form onSubmit={submit}>
          {(mode === "register") && (
            <label>Tên hiển thị<input autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} /></label>
          )}
          {mode !== "reset" && (
            <label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          )}
          {(mode === "login" || mode === "register" || mode === "reset") && (
            <label>Mật khẩu<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          )}
          {(mode === "register" || mode === "reset") && (
            <label>Xác nhận mật khẩu<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={passwordAgain} onChange={(event) => setPasswordAgain(event.target.value)} /></label>
          )}
          {error && <p className="account-error" role="alert">{error}</p>}
          {message && <p className="account-message" role="status">{message}</p>}
          <button className="account-submit" type="submit" disabled={busy}>
            {busy ? "Đang xử lý…" : copy[mode].submit}
          </button>
        </form>
        <nav className="account-links" aria-label="Liên kết tài khoản">
          {mode !== "login" && <Link href="/login">Đăng nhập</Link>}
          {mode !== "register" && <Link href="/register">Tạo tài khoản</Link>}
          {mode !== "forgot" && mode !== "reset" && <Link href="/forgot-password">Quên mật khẩu?</Link>}
        </nav>
      </section>
    </main>
  );
}
