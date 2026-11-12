"use client";

import { Contents } from "../notebook/contents";
import type { NotebookLessonRow as LessonRow } from "../../../lib/lesson-v2/notebook-list";
import { words } from "../words";
import { useCallback, useEffect, useState } from "react";
import { apiJson } from "../api";
import { AdaptiveRequests } from "../adaptive-requests";
import { NotebookRequests } from "../requests-panel";
import { HistoryPanel } from "../history-panel";
import { NewLessonRequest } from "../new-lesson-request";
import { RouteLink } from "../ui";
import { useLiveRefresh } from "../use-live-refresh";
import { MarginDate } from "../../../components/notebook/paper";
import { paperAction, PaperSummary, pencil, pencilLink, shortDay, skillLabel } from "../paper-bits";
import type { Route } from "../use-route";

type Notebook = { lessons: LessonRow[]; nextOffset: number | null; adaptive: boolean; day: string; nightly: { status: string; outcome: string | null } | null; initial: { status: string } | null; setup: boolean };
type Props = { subjectId: string; learner: string | null; go: (route: Route) => void; canRequest?: boolean; history?: boolean; showBoth?: boolean; bookPage?: "today" | "contents" };

function NotebookLessons({ subjectId, learner, go, canRequest = false, history = false, showBoth = false, bookPage }: Props) {
  const [notebook, setNotebook] = useState<Notebook | null>(null), [error, setError] = useState("");
  const [older, setOlder] = useState<LessonRow[]>([]);
  const [offset, setOffset] = useState<number | undefined>();
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [version, setVersion] = useState(0);
  const all = !!bookPage;
  const params = new URLSearchParams({ ...(learner ? { learner } : {}), ...(all ? { all: "1" } : {}) });
  const lessonsUrl = `/api/subjects/${subjectId}/lessons?${params}`;
  const refresh = useCallback(() => setVersion(current => current + 1), []);
  useEffect(() => {
    let alive = true;
    apiJson<Notebook>(lessonsUrl)
      .then(data => { if (alive) { setNotebook(data); setError(""); } })
      .catch((e: Error) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [lessonsUrl, version]);
  const nightlyStatus = notebook?.nightly?.status;
  const initialStatus = notebook?.initial?.status;
  const pending = [nightlyStatus, initialStatus].some(status => status === "queued" || status === "leased");
  useLiveRefresh(async () => refresh(), !history && pending, 5000);
  if (error && !notebook) return <p role="alert">{error}</p>;
  if (!notebook) return <p role="status">Đang đọc bài trong sổ…</p>;
  const rows = [...new Map([...older, ...notebook.lessons].map(row => [row.id, row])).values()];
  const nextOffset = offset === undefined ? notebook.nextOffset : offset || null;
  async function loadMore() {
    if (nextOffset === null || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const next = await apiJson<Notebook>(`/api/subjects/${subjectId}/lessons?` + new URLSearchParams({
        ...(learner ? { learner } : {}), ...(all ? { all: "1" } : {}), offset: String(nextOffset),
      }));
      setOlder(previous => [...previous, ...next.lessons]);
      setOffset(next.nextOffset ?? 0);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoadingOlder(false);
    }
  }
  const open = rows.filter(row => !row.completedAt).sort((a,b) => b.assignedDate.localeCompare(a.assignedDate));
  const primary = open.find(row => row.slot === "primary") ?? rows.find(row => row.slot === "primary" && row.assignedDate === notebook.day);
  const extras = open.filter(row => row.id !== primary?.id);
  const kindLabel = (row: LessonRow) => row.kind === "diagnostic" ? words.lessonKind.diagnostic : row.kind === "new" ? words.lessonKind.new : row.kind === "exploration" ? words.lessonKind.own : row.kind === "review" ? words.lessonKind.review : words.lessonKind.practice;
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
            <RouteLink route={{view:"lesson",id:row.id}} go={go} className={pencilLink}>{row.title}</RouteLink>
          </li>;
        })}
      </ul>
      {!done.length && <p className={pencil}>Chưa có bài nào học xong.</p>}
      {error && <p role="alert">{error}</p>}
      {nextOffset !== null && <button type="button" className={pencilLink} disabled={loadingOlder} onClick={() => void loadMore()}>Xem thêm bài</button>}
      <HistoryPanel subjectId={subjectId} learner={learner} downloads={!bookPage} />
    </>
  );
  if (bookPage === "contents") return <>
    <Contents rows={rows} go={go} />
    {error && <p role="alert">{words.error.unknown}</p>}
    {nextOffset !== null && <button type="button" className={pencilLink} disabled={loadingOlder} onClick={() => void loadMore()}>Xem thêm bài</button>}
  </>;
  if (history) return historyList;
  const firstLessonStatus = initialStatus === "leased"
    ? "Đang chuẩn bị bài đầu tiên…"
    : initialStatus === "queued" ? "Đang chuẩn bị bài đầu tiên…"
    : initialStatus ? "Chưa lưu được bài đầu tiên." : words.status.notWritten;
  const emptyStatus = notebook.setup ? firstLessonStatus
    : nightlyStatus === "queued" || nightlyStatus === "leased" ? "Bài hôm nay chưa soạn xong."
    : nightlyStatus === "succeeded" ? "Bạn đã xong phần hôm nay."
    : notebook.adaptive ? "Chưa có bài chính. Chọn một thẻ để xin bài."
    : open.length === 0 ? "Sổ không còn bài đang mở." : null;
  const showRequestTabs = canRequest && !notebook.setup && notebook.adaptive;
  if (showBoth) return <>
    <section aria-label="Bài hôm nay">
      <div className={showRequestTabs ? "grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_minmax(9rem,13rem)] md:gap-8" : undefined}>
        <div className="min-w-0">
          {primary ? <div className="grid min-w-0 justify-items-start gap-1">
            <p className={pencil}>{primary.kind === "diagnostic" ? words.lessonKind.diagnostic : primary.assignedDate === notebook.day ? "Gợi ý hôm nay" : "Bài đang học"}</p>
            <h2 className="min-w-0 break-words font-print text-2xl leading-tight sm:text-[1.75rem]">{primary.title}</h2>
            {(primary.total || primary.minutes) ? <p className={pencil}>
              {primary.total ? `${primary.attempted}/${primary.total} câu` : ""}
              {primary.minutes ? `${primary.total ? " · " : ""}${primary.minutes} phút` : ""}
            </p> : null}
            {primary.kind !== "diagnostic" && primary.assignedDate === notebook.day && primary.reason &&
              <p className="max-w-prose text-sm leading-6 text-muted">{primary.reason}</p>}
            <RouteLink route={{ view: "lesson", id: primary.id }} go={go} className={paperAction + " mt-1"}>
              {primary.hasWork && !primary.completedAt ? words.action.continue : words.action.open} <span aria-hidden="true">→</span>
            </RouteLink>
          </div> : emptyStatus && <p role="status" className={pencil}>{emptyStatus}</p>}
          {canRequest && !notebook.setup && !notebook.adaptive && !open.length && !learner &&
            <NewLessonRequest subjectId={subjectId} onOpen={id => go({view:"lesson", id})} />}
        </div>
        {showRequestTabs && <AdaptiveRequests edge subjectId={subjectId} learner={learner} go={go} onSaved={refresh} />}
      </div>
      {extras.length > 0 && <>
        <p className={pencil + " mt-5"}>Bài khác đang mở</p>
        <ul>{extras.map(row => <li key={row.id}>
          <RouteLink route={{view:"lesson",id:row.id}} go={go} className={pencilLink}>{row.title}</RouteLink>
          {row.minutes ? <span className={pencil}> · {row.minutes} phút</span> : null}
        </li>)}</ul>
      </>}
    </section>
    {canRequest && !notebook.setup && !notebook.adaptive && <details>
      <summary className="min-h-11 cursor-pointer">Yêu cầu khác</summary><NotebookRequests subjectId={subjectId} learner={learner} />
    </details>}
    {!bookPage && <details className="mt-7"><PaperSummary>Bài đã học</PaperSummary>{historyList}</details>}
  </>;
  return <>
    <section className="space-y-3 bg-paper py-3" aria-label="Bài hiện tại">
      {open.length ? <ul className="space-y-2">
        {open.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">{row.title}</p>
          <RouteLink route={{view:"lesson",id:row.id}} go={go} className={paperAction}>{row.hasWork ? words.action.continue : words.action.open}</RouteLink>
        </li>)}
      </ul> : <>
        <p className="text-sm text-muted">Sổ không còn bài đang mở.</p>
        {canRequest && !learner && <NewLessonRequest subjectId={subjectId} onOpen={id=>go({view:"lesson",id})} />}
      </>}
    </section>
  </>;
}
export function LessonList(props: Props) {
  return <NotebookLessons key={props.subjectId + ":" + (props.learner ?? "self")} {...props} />;
}
