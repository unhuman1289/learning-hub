"use client";

import { useEffect, useRef, useState } from "react";
import { apiJson } from "./api";
import { buttonClass, RouteLink } from "./ui";
import type { Route } from "./use-route";

type Mode = "learn" | "practice" | "personal";
type RequestRow = { id: string; mode: Mode | null; text: string; status: string; jobStatus: string | null; resultLessonId: string | null; responseNote: string | null };
type Input = { mode: Mode; clientRequestId: string; subjectId: string; note: string };
const labels = { learn: "Học mới", practice: "Luyện tập", personal: "Cá nhân hóa" };
const waiting = (row: RequestRow) => !row.resultLessonId && ["queued", "in_job"].includes(row.status) &&
  !["failed", "expired", "cancelled"].includes(row.jobStatus ?? "");

export function AdaptiveRequests({ subjectId, learner, go, onSaved }: {
  subjectId: string; learner: string | null; go: (route: Route) => void; onSaved: () => void;
}) {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [personal, setPersonal] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState<Input>();
  const [page, setPage] = useState(0);
  const inflight = useRef(false);
  const personalButton = useRef<HTMLButtonElement>(null);
  const seen = useRef(new Set<string>());
  const query = new URLSearchParams({ subjectId, ...(learner ? { learner } : {}) });
  const listUrl = "/api/requests?" + query.toString();
  const postUrl = "/api/requests" + (learner ? "?learner=" + encodeURIComponent(learner) : "");
  const pending = rows.some(waiting);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { requests } = await apiJson<{ requests: RequestRow[] }>(listUrl);
        if (!active) return;
        if (requests.some(row => row.resultLessonId && !seen.current.has(row.id))) onSaved();
        requests.forEach(row => { if (row.resultLessonId) seen.current.add(row.id); });
        setRows(requests);
      } catch (cause) {
        if (active) setError((cause as Error).message);
      }
    };
    const visible = () => { if (!document.hidden) void load(); };
    void load();
    document.addEventListener("visibilitychange", visible);
    const timer = pending ? window.setInterval(visible, 5000) : undefined;
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [listUrl, pending, onSaved]);

  async function send(mode: Mode, replay?: Input) {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setError("");
    const input = replay ?? { mode, subjectId, clientRequestId: crypto.randomUUID(), note: mode === "personal" ? note.trim() : "" };
    setAttempt(input);
    try {
      const { request } = await apiJson<{ request: RequestRow }>(postUrl, { method: "POST", json: input });
      setRows(current => [request, ...current.filter(row => row.id !== request.id)]);
      setAttempt(undefined);
      if (mode === "personal") { setPersonal(false); setNote(""); personalButton.current?.focus(); }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
      inflight.current = false;
    }
  }

  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy} className={buttonClass("primary")} onClick={() => void send("learn")}>Học mới</button>
      <button type="button" disabled={busy} className={buttonClass("ghost")} onClick={() => void send("practice")}>Luyện tập</button>
      <button type="button" ref={personalButton} aria-expanded={personal} className={buttonClass("ghost")} onClick={() => setPersonal(!personal)}>Cá nhân hóa</button>
    </div>
    {personal && <form className="grid gap-2" onSubmit={event => { event.preventDefault(); void send("personal"); }}>
      <label>Hôm nay bạn muốn luyện gì?
        <textarea className="block w-full rounded border border-line p-2" autoFocus required maxLength={1000} value={note} onChange={event => setNote(event.target.value)} placeholder="Ví dụ: Viết email dời lịch họp." />
      </label>
      <span className="text-sm text-muted">{note.length}/1000</span>
      <div className="flex gap-2">
        <button className={buttonClass("primary")} disabled={busy || !note.trim()}>Soạn bài</button>
        <button type="button" className={buttonClass("ghost")} onClick={() => { setPersonal(false); personalButton.current?.focus(); }}>Đóng</button>
      </div>
    </form>}
    {error && <p role="alert">{error} {attempt && <button type="button" disabled={busy} className={buttonClass("ghost")} onClick={() => void send(attempt.mode, attempt)}>Gửi lại</button>}</p>}
    <ul aria-live="polite" className="grid gap-2">
      {rows.slice(0, 3 + page * 10).map(row => <li key={row.id}>
        {row.mode && <strong>{labels[row.mode]} · </strong>}
        {row.resultLessonId ? <>Bài đã sẵn sàng. <RouteLink route={{view:"lesson",id:row.resultLessonId}} go={go} className={buttonClass("ghost")}>Mở bài</RouteLink></>
          : waiting(row) ? row.jobStatus === "leased" ? "Đang soạn bài…" : row.jobStatus ? "Đang chờ soạn." : "Đã nhận yêu cầu."
          : <>{row.responseNote || "Chưa soạn được bài."} {row.mode && <button type="button" disabled={busy} className={buttonClass("ghost")} onClick={() => {
              if (row.mode === "personal") { setNote(row.text); setPersonal(true); }
              else if (row.mode) void send(row.mode);
            }}>Thử lại</button>}</>}
      </li>)}
    </ul>
    {rows.length > 3 + page * 10 && <button type="button" className={buttonClass("ghost")} onClick={() => setPage(page + 1)}>Xem thêm lượt</button>}
  </div>;
}
