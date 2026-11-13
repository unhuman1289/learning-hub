"use client";

import { useEffect, useRef, useState } from "react";
import { words } from "../words";
import { apiJson } from "../api";
import { clockTime, pencilLink } from "../paper-bits";
import { buttonClass, RouteLink } from "../ui";
import { SketchIcon } from "../sketch-icons";
import type { Route } from "../use-route";

type Mode = "learn" | "practice" | "personal";
type RequestRow = { id: string; mode: Mode | null; text: string; status: string; jobStatus: string | null; resultLessonId: string | null; responseNote: string | null; createdAt: string };
type Action = Exclude<Mode, "practice">;
type Input = { mode: Action; clientRequestId: string; subjectId: string; note: string };
const labels = { learn: words.request.new, personal: words.request.own };
const actions: Action[] = ["learn", "personal"];
const actionFor = (mode: Mode | null) => mode === "practice" ? "learn" : mode;
const DAY = 24 * 60 * 60 * 1000;
/** One line per kind of request: whatever is still being written, else the newest result or failure of the last day. */
function current(rows: RequestRow[], now: number, currentLessonId?: string) {
  return actions.flatMap(mode => {
    const mine = rows.filter(row => actionFor(row.mode) === mode && (!currentLessonId || row.resultLessonId !== currentLessonId));
    const row = mine.find(waiting) ?? mine.find(item => now - Date.parse(item.createdAt) < DAY);
    return row ? [row] : [];
  });
}
const waiting = (row: RequestRow) => !row.resultLessonId && ["queued", "in_job"].includes(row.status) &&
  !["failed", "expired", "cancelled"].includes(row.jobStatus ?? "");

export function AdaptiveRequests({ subjectId, learner, go, onSaved, currentLessonId }: {
  subjectId: string; learner: string | null; go: (route: Route) => void; onSaved: () => void; currentLessonId?: string;
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

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { requests } = await apiJson<{ requests: RequestRow[] }>(listUrl);
        if (!active) return;
        if (requests.some(row => row.resultLessonId && !seen.current.has(row.id))) onSaved();
        requests.forEach(row => { if (row.resultLessonId) seen.current.add(row.id); });
        setRows(current(requests, Date.now(), currentLessonId));
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
  }, [listUrl, pending, onSaved, currentLessonId]);

  async function send(mode: Action, replay?: Input) {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setError("");
    const input = replay ?? { mode, subjectId, clientRequestId: crypto.randomUUID(), note: mode === "personal" ? note.trim() : "" };
    setAttempt(input);
    try {
      const { request } = await apiJson<{ request: RequestRow }>(postUrl, { method: "POST", json: input });
      setRows(shown => [request, ...shown.filter(row => actionFor(row.mode) !== mode)]);
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
    <div className="grid grid-cols-2 gap-x-3 text-center">
      {actions.map(mode => {
        const row = rows.find(item => actionFor(item.mode) === mode);
        const ready = row?.resultLessonId;
        const pending = !!row && waiting(row);
        const icon = <><span className="relative mx-auto grid size-14 place-items-center rounded border border-rule bg-paper text-ink-paper">
          <SketchIcon name={mode} size={32} />{ready && <span aria-hidden="true" className="absolute right-1 top-1 size-2 rounded-full bg-brick" />}
        </span><span>{labels[mode]}</span></>;
        return <div key={mode} className="min-w-0 font-hand">
          {ready ? <RouteLink route={{ view: "lesson", id: ready }} go={go} aria-label={labels[mode] + " · Mở bài"}>{icon}</RouteLink>
            : <button type="button" ref={mode === "personal" ? personalButton : undefined} aria-expanded={mode === "personal" ? personal : undefined}
                aria-label={row && !pending ? words.action.retry + " · " + labels[mode] : undefined}
                className="w-full disabled:opacity-60" disabled={busy || pending}
                onClick={() => mode === "personal" ? setPersonal(!personal) : void send(mode)}>{icon}</button>}
          {row && <p role="status" className="text-sm leading-snug text-muted">
            {ready ? row.responseNote || words.status.ready : pending ? clockTime(row.createdAt) + " · " + words.status.writing : row.responseNote || words.status.notWritten}
          </p>}
        </div>;
      })}
    </div>
    {personal && <form className="mt-3 rounded-sm bg-postit-yellow p-2 text-postit-ink"
      onSubmit={event => { event.preventDefault(); void send("personal"); }}>
      <label className="block">{words.request.ownPrompt}
        <textarea className="block w-full resize-y border-0 bg-transparent p-0 font-hand text-xl leading-7 placeholder:text-muted/70 focus:border-b-2 focus:border-accent-paper" rows={2} autoFocus required maxLength={1000} value={note} onChange={event => setNote(event.target.value)} placeholder="Ví dụ: phân số, viết thư cho bạn." />
      </label>
      <div className="flex h-14 items-center gap-4">
        <button className={buttonClass("secondary", "min-h-11")} disabled={busy || !note.trim()}>Gửi</button>
        <button type="button" className={pencilLink} onClick={() => { setPersonal(false); personalButton.current?.focus(); }}>Đóng</button>
      </div>
    </form>}
    {error && <p role="alert" className="text-brick">{error} {attempt && <button type="button" disabled={busy} className={pencilLink} onClick={() => void send(attempt.mode, attempt)}>{words.action.retry}</button>}</p>}
  </div>;
}
