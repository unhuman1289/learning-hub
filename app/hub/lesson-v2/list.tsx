"use client";

import { useCallback, useEffect, useState } from "react";
import { apiJson, learnerQuery } from "../api";
import { AdaptiveRequests } from "../adaptive-requests";
import { NotebookRequests } from "../requests-panel";
import { HistoryPanel } from "../history-panel";
import { NewLessonRequest } from "../new-lesson-request";
import { buttonClass, RouteLink } from "../ui";
import { MarginDate } from "../../../components/notebook/paper";
import { pencil, pencilLink, shortDay, skillLabel } from "../paper-bits";
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
  const kindLabel = (row: LessonRow) => row.kind === "new" ? "Học mới" : row.kind === "exploration" ? "Cá nhân hóa" : row.kind === "review" ? "Ôn tập" : "Luyện tập";
  const done = rows.filter(row => row.completedAt).sort((a,b) => b.completedAt!.localeCompare(a.completedAt!));
  const historyList = (
    <>
      <ul>
        {done.map((row, i) => {
          const day = shortDay(row.completedAt!);
          // The date is written once in the margin, beside the first lesson of that day.
          return <li key={row.id} className="relative">
            {(i === 0 || shortDay(done[i - 1].completedAt!) !== day) && <MarginDate>{day}</MarginDate>}
            <span className={pencil}>{kindLabel(row)}{row.skill ? ` · ${skillLabel(row.skill)}` : ""} · </span>
            <RouteLink route={{view:"lesson",id:row.id}} go={go} className="underline decoration-rule underline-offset-4 hover:decoration-accent">{row.title}</RouteLink>
          </li>;
        })}
      </ul>
      {!done.length && <p className={pencil}>Chưa có bài nào học xong.</p>}
      {error && <p role="alert">{error}</p>}
      {nextOffset !== null && <button type="button" className={pencilLink} disabled={loadingOlder} onClick={() => void loadMore()}>Xem thêm bài</button>}
      <HistoryPanel subjectId={subjectId} learner={learner} />
    </>
  );
  if (history) return historyList;
  if (notebook.adaptive && showBoth) return <>
    <section aria-label="Bài hôm nay">
      {primary ? <>
        <p className={pencil}>{primary.assignedDate === notebook.day ? "Gợi ý hôm nay" : "Học tiếp"}{primary.assignedDate === notebook.day && primary.reason ? ` · ${primary.reason}` : ""}</p>
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-4">
          <p className="text-lg font-semibold">{primary.title}</p>
          <RouteLink route={{view:"lesson",id:primary.id}} go={go} className={buttonClass("primary")}>Mở bài</RouteLink>
        </div>
      </> : <p role="status" className={pencil}>{nightlyStatus === "queued" || nightlyStatus === "leased" ? "Bài hôm nay chưa soạn xong." : nightlyStatus === "succeeded" ? "Bạn đã xong phần hôm nay." : "Chưa có bài chính. Xin một bài bằng thẻ ở mép trang."}</p>}
      {canRequest && <AdaptiveRequests edge subjectId={subjectId} learner={learner} go={go} onSaved={refresh} />}
      {extras.length > 0 && <>
        <p className={pencil}>Bài xin thêm đang mở</p>
        <ul>{extras.map(row => <li key={row.id}>
          <RouteLink route={{view:"lesson",id:row.id}} go={go} className="underline decoration-rule underline-offset-4 hover:decoration-accent">{row.title}</RouteLink>
          {row.minutes ? <span className={pencil}> · {row.minutes} phút</span> : null}
        </li>)}</ul>
      </>}
    </section>
    <details className="mt-7"><summary className="cursor-pointer font-hand text-xl leading-7 text-accent">Bài đã học</summary>{historyList}</details>
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
    {showBoth && <details className="mt-7"><summary className="cursor-pointer font-hand text-xl leading-7 text-accent">Bài đã học</summary>{historyList}</details>}
  </>;
}
export function LessonList(props: Props) {
  return <NotebookLessons key={props.subjectId + ":" + (props.learner ?? "self")} {...props} />;
}
