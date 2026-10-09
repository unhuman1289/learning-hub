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

  return (
    <main className="account-page">
      <Link className="account-brand" href="/">Learning Hub</Link>
      <section className="account-card">
        <p className="eyebrow">HỌC CÙNG NHAU · TÀI KHOẢN RIÊNG</p>
        <h1>{copy[mode].title}</h1>
        <p className="account-intro">
          {mode === "register"
            ? "Ai cũng có thể tạo tài khoản bằng email và mật khẩu. Sau khi xác minh email, tài khoản chờ admin duyệt rồi mới đăng nhập được. Mật khẩu cần ít nhất 12 ký tự."
            : mode === "login"
              ? "Dùng email và mật khẩu Learning Hub. Tài khoản mới cần xác minh email và được admin duyệt trước khi đăng nhập."
              : mode === "forgot"
                ? "Nhập email đã đăng ký. Vì lý do bảo mật, trang luôn xác nhận chung; thư chỉ được gửi nếu tài khoản tồn tại. Hãy kiểm tra cả Spam."
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
        {mode === "login" && emailVerified && <p className="account-message" role="status">Email đã được xác minh. Nếu tài khoản mới, admin cần duyệt trước khi bạn đăng nhập được.</p>}
        <div className="account-links" role="navigation" aria-label="Liên kết tài khoản">
          {mode !== "login" && <a href="/login">Đăng nhập</a>}
          {mode !== "register" && <a href="/register">Tạo tài khoản</a>}
          {mode !== "forgot" && mode !== "reset" && <a href="/forgot-password">Quên mật khẩu?</a>}
        </div>
      </section>
    </main>
  );
}
