"use client";

/** Same-origin JSON call that never reports success before the server confirms it. */
export async function apiJson<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      ...init,
      headers: init?.json === undefined ? init?.headers : { "Content-Type": "application/json", ...init?.headers },
      body: init?.json === undefined ? init?.body : JSON.stringify(init.json),
    });
  } catch {
    throw new Error("Mất kết nối. Chưa lưu gì; thử lại khi có mạng.");
  }
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !body) throw new Error(body?.error || "Chưa xác nhận được với máy chủ.");
  return body;
}

export const learnerQuery = (learner: string | null) => (learner ? `?learner=${encodeURIComponent(learner)}` : "");
