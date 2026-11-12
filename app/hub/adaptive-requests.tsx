"use client";

import { useEffect, useRef, useState } from "react";
import { words } from "./words";
import { apiJson } from "./api";
import { cx } from "../../components/notebook/paper";
import { clockTime, pencil, pencilLink } from "./paper-bits";
import { buttonClass, RouteLink } from "./ui";
import type { Route } from "./use-route";

type Mode = "learn" | "practice" | "personal";
type RequestRow = { id: string; mode: Mode | null; text: string; status: string; jobStatus: string | null; resultLessonId: string | null; responseNote: string | null; createdAt: string };
type Input = { mode: Mode; clientRequestId: string; subjectId: string; note: string };
const labels = { learn: words.request.new, practice: words.request.practice, personal: words.request.own };
const modes: Mode[] = ["learn", "practice", "personal"];
const flagColor = { learn: "bg-postit-yellow", practice: "bg-postit-mint", personal: "bg-postit-rose" };
/** A request flag: a strip of coloured paper stuck to the page. */
const flag = "min-h-11 rounded-[2px] font-hand leading-7 text-postit-ink transition-transform hover:-translate-y-0.5 disabled:opacity-60 sm:hover:translate-y-0 sm:hover:-translate-x-1";
const DAY = 24 * 60 * 60 * 1000;
/** One line per kind of request: whatever is still being written, else the newest result or failure of the last day. */
function current(rows: RequestRow[], now: number) {
  return modes.flatMap(mode => {
    const mine = rows.filter(row => row.mode === mode);
    const row = mine.find(waiting) ?? mine.find(item => now - Date.parse(item.createdAt) < DAY);
    return row ? [row] : [];
  });
}
const waiting = (row: RequestRow) => !row.resultLessonId && ["queued", "in_job"].includes(row.status) &&
  !["failed", "expired", "cancelled"].includes(row.jobStatus ?? "");

/** `edge` hangs the three request flags on the page edge like index tabs (notebook page); otherwise they sit in the text. */
export function AdaptiveRequests({ subjectId, learner, go, onSaved, edge = false }: {
  subjectId: string; learner: string | null; go: (route: Route) => void; onSaved: () => void; edge?: boolean;
}) {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [personal, setPersonal] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState<Input>();
  const inflight = useRef(false);
  const personalButton = useRef<HTMLButtonElement>(null);
  const seen = useRef(new Set<string>());
  const query = new URLSearchParams({ subjectId, ...(learner ? { learner } : {}) });
  const listUrl = "/api/requests?" + query.toString();
  const postUrl = "/api/requests" + (learner ? "?learner=" + encodeURIComponent(learner) : "");
  const pending = rows.some(waiting);
  const flagStyle = cx(flag, edge ? "px-3 text-[17px] shadow-[0_2px_3px_-2px_rgb(0_0_0/0.3)]" : "px-4 text-lg shadow-[0_3px_6px_-3px_rgb(0_0_0/0.45)]");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { requests } = await apiJson<{ requests: RequestRow[] }>(listUrl);
        if (!active) return;
        if (requests.some(row => row.resultLessonId && !seen.current.has(row.id))) onSaved();
        requests.forEach(row => { if (row.resultLessonId) seen.current.add(row.id); });
        setRows(current(requests, Date.now()));
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
      setRows(shown => [request, ...shown.filter(row => row.mode !== request.mode)]);
      setAttempt(undefined);
      if (mode === "personal") { setPersonal(false); setNote(""); personalButton.current?.focus(); }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
      inflight.current = false;
    }
  }

  return <div>
    <div className={cx("flex flex-wrap gap-2 py-1.5", edge && "md:flex-col md:items-end md:gap-2 md:py-0")}>
      {modes.map(mode => mode === "personal"
        ? <button key={mode} type="button" ref={personalButton} aria-expanded={personal} className={cx(flagStyle, flagColor[mode])} onClick={() => setPersonal(!personal)}>{labels[mode]}</button>
        : <button key={mode} type="button" disabled={busy} className={cx(flagStyle, flagColor[mode])} onClick={() => void send(mode)}>{labels[mode]}</button>)}
    </div>
    {personal && <form onSubmit={event => { event.preventDefault(); void send("personal"); }}>
      <label className="block">{words.request.ownPrompt}
        <textarea className="block w-full resize-y border-0 bg-transparent p-0 font-hand text-xl leading-7 placeholder:text-muted/70 focus:border-b-2 focus:border-accent-paper" rows={2} autoFocus required maxLength={1000} value={note} onChange={event => setNote(event.target.value)} placeholder="Ví dụ: phân số, viết thư cho bạn." />
      </label>
      <div className="flex h-14 items-center gap-4">
        <button className={buttonClass("secondary", "min-h-11")} disabled={busy || !note.trim()}>{words.request.title}</button>
        <button type="button" className={pencilLink} onClick={() => { setPersonal(false); personalButton.current?.focus(); }}>Đóng</button>
      </div>
    </form>}
    {error && <p role="alert" className="text-brick">{error} {attempt && <button type="button" disabled={busy} className={pencilLink} onClick={() => void send(attempt.mode, attempt)}>{words.action.retry}</button>}</p>}
    <ul aria-live="polite">
      {rows.map(row => <li key={row.id} className={pencil}>
        {row.mode && labels[row.mode]} · {clockTime(row.createdAt)} ·{" "}
        {row.resultLessonId ? <>{words.status.ready} <RouteLink route={{view:"lesson",id:row.resultLessonId}} go={go} className={pencilLink}>Mở bài</RouteLink></>
          : waiting(row) ? words.status.writing
          : <>{row.responseNote || words.status.notWritten} {row.mode && <button type="button" disabled={busy} className={pencilLink} onClick={() => {
              if (row.mode === "personal") { setNote(row.text); setPersonal(true); }
              else if (row.mode) void send(row.mode);
            }}>Thử lại</button>}</>}
      </li>)}
    </ul>
  </div>;
}
