"use client";

import { useCallback, useEffect, useState } from "react";
import { apiJson, learnerQuery } from "../api";
import { AdaptiveRequests } from "../adaptive-requests";
import { NotebookRequests } from "../requests-panel";
import { HistoryPanel } from "../history-panel";
import { NewLessonRequest } from "../new-lesson-request";
import { buttonClass, RouteLink } from "../ui";
import type { Route } from "../use-route";

type LessonRow = { id: string; title: string; completedAt: string | null; assignedDate: string; kind: string; slot: string; reason: string; minutes: number | null; skill: string | null };
type Notebook = { lessons: LessonRow[]; nextOffset: number | null; adaptive: boolean; day: string; nightly: { status: string; outcome: string | null } | null };
type Props = { subjectId: string; learner: string | null; go: (route: Route) => void; canRequest?: boolean; history?: boolean; showBoth?: boolean };

function NotebookLessons({ subjectId, learner, go, canRequest = false, history = false, showBoth = false }: Props) {
  const [notebook, setNotebook] = useState<Notebook | null>(null), [error, setError] = useState("");
  const [older, setOlder] = useState<LessonRow[]>([]);
  const [offset, setOffset] = useState<number | undefined>();
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion(current => current + 1), []);
  useEffect(() => {
    let alive = true;
    apiJson<Notebook>(`/api/subjects/${subjectId}/lessons${learnerQuery(learner)}`)
      .then(data => { if (alive) { setNotebook(data); setError(""); } })
      .catch((e: Error) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [subjectId, learner, version]);
  const nightlyStatus = notebook?.nightly?.status;
  useEffect(() => {
    if (nightlyStatus !== "queued" && nightlyStatus !== "leased") return;
    const timer = window.setInterval(() => { if (!document.hidden) refresh(); }, 5000);
    return () => window.clearInterval(timer);
  }, [nightlyStatus, refresh]);
  if (error && !notebook) return <p role="alert">{error}</p>;
  if (!notebook) return <p role="status">Đang đọc bài trong sổ…</p>;
  const rows = [...new Map([...older, ...notebook.lessons].map(row => [row.id, row])).values()];
  const nextOffset = offset === undefined ? notebook.nextOffset : offset || null;
  async function loadMore() {
    if (nextOffset === null || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const next = await apiJson<Notebook>(`/api/subjects/${subjectId}/lessons?` + new URLSearchParams({
        ...(learner ? { learner } : {}), offset: String(nextOffset),
      }));
      setOlder(previous => [...previous, ...next.lessons]);
      setOffset(next.nextOffset ?? 0);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoadingOlder(false);
    }
  }
  const open = rows.filter(row => !row.completedAt);
  const primary = open.find(row => row.slot === "primary") ?? rows.find(row => row.slot === "primary" && row.assignedDate === notebook.day);
  const extras = open.filter(row => row.slot !== "primary");
  const dayLabel = (value: string) => new Intl.DateTimeFormat("vi", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" }).format(new Date(value));
  const historyList = (
    <>
      <ul className="grid gap-1">
        {rows.filter(row => row.completedAt).sort((a,b) => b.completedAt!.localeCompare(a.completedAt!)).map(row => <li key={row.id}>
          <span className="text-sm text-muted">{dayLabel(row.completedAt!)} · {row.kind === "new" ? "Học mới" : row.kind === "exploration" ? "Cá nhân hóa" : "Luyện tập"}{row.skill ? ` · ${row.skill}` : ""}</span>
          <RouteLink route={{view:"lesson",id:row.id}} go={go} className={buttonClass("ghost")}>{row.title}</RouteLink>
        </li>)}
      </ul>
      {error && <p role="alert">{error}</p>}
      {nextOffset !== null && <button type="button" className={buttonClass("ghost")} disabled={loadingOlder} onClick={() => void loadMore()}>Xem thêm bài</button>}
      <HistoryPanel subjectId={subjectId} learner={learner} />
    </>
  );
  if (history) return historyList;
  if (notebook.adaptive && showBoth) return <>
    <section className="space-y-3 py-4" aria-label="Bài hôm nay">
      {primary ? <div>
        <h2 className="font-hand text-xl">{primary.assignedDate === notebook.day ? "Gợi ý hôm nay" : "Học tiếp"}</h2>
        <p>{primary.title}</p>
        {primary.assignedDate === notebook.day && <p className="text-sm text-muted">{primary.reason}</p>}
        <RouteLink route={{view:"lesson",id:primary.id}} go={go} className={buttonClass("primary")}>Mở bài</RouteLink>
      </div> : nightlyStatus === "queued" || nightlyStatus === "leased" ? <p role="status">Bài hôm nay chưa soạn xong.</p> : nightlyStatus === "succeeded" ? <p>Bạn đã xong phần hôm nay.</p> : null}
      {canRequest && <AdaptiveRequests subjectId={subjectId} learner={learner} go={go} onSaved={refresh} />}
      {extras.length > 0 && <details open={extras.length <= 3}>
        <summary className="min-h-11 cursor-pointer">Bài thêm đang mở ({extras.length})</summary>
        <ul>{extras.map(row => <li key={row.id}>
          <RouteLink route={{view:"lesson",id:row.id}} go={go} className={buttonClass("ghost")}>{row.title}{row.minutes ? ` · ${row.minutes} phút` : ""}</RouteLink>
        </li>)}</ul>
      </details>}
    </section>
    <details><summary className="min-h-11 cursor-pointer font-hand text-xl text-accent">Bài đã học</summary>{historyList}</details>
  </>;
  return <>
    <section className="space-y-3 bg-paper py-3" aria-label="Bài hiện tại">
      {open.length ? <ul className="space-y-2">
        {open.map((row, i) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">{row.title}</p>
          <RouteLink route={{view:"lesson",id:row.id}} go={go} className={buttonClass(i === 0 ? "primary" : "ghost")}>Mở bài</RouteLink>
        </li>)}
      </ul> : <>
        <p className="text-sm text-muted">Sổ không còn bài đang mở.</p>
        {canRequest && !learner && <NewLessonRequest subjectId={subjectId} onOpen={id=>go({view:"lesson",id})} />}
      </>}
    </section>
    {showBoth && canRequest && <details><summary className="min-h-11 cursor-pointer">Yêu cầu khác</summary><NotebookRequests subjectId={subjectId} learner={learner} /></details>}
    {showBoth && <details><summary className="min-h-11 cursor-pointer font-hand text-xl text-accent">Bài đã học</summary>{historyList}</details>}
  </>;
}
export function LessonList(props: Props) {
  return <NotebookLessons key={props.subjectId + ":" + (props.learner ?? "self")} {...props} />;
}
