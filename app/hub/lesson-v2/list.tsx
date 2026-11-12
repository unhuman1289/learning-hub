"use client";

import type { NotebookLessonRow as LessonRow } from "../../../lib/lesson-v2/notebook-list";
import { words } from "../words";
import { useCallback, useEffect, useState } from "react";
import { apiJson } from "../api";
import { HistoryPanel } from "../history-panel";
import { NewLessonRequest } from "../new-lesson-request";
import { RouteLink } from "../ui";
import { useLiveRefresh } from "../use-live-refresh";
import { MarginDate } from "../../../components/notebook/paper";
import { paperAction, pencil, pencilLink, shortDay, skillLabel } from "../paper-bits";
import type { Route } from "../use-route";

type Notebook = { lessons: LessonRow[]; nextOffset: number | null; adaptive: boolean; day: string; nightly: { status: string; outcome: string | null } | null; initial: { status: string } | null; setup: boolean };
type Props = { subjectId: string; learner: string | null; go: (route: Route) => void; canRequest?: boolean; history?: boolean };

function NotebookLessons({ subjectId, learner, go, canRequest = false, history = false }: Props) {
  const [notebook, setNotebook] = useState<Notebook | null>(null), [error, setError] = useState("");
  const [older, setOlder] = useState<LessonRow[]>([]);
  const [offset, setOffset] = useState<number | undefined>();
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [version, setVersion] = useState(0);
  const params = new URLSearchParams({ ...(learner ? { learner } : {}) });
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
  const open = rows.filter(row => !row.completedAt).sort((a,b) => b.assignedDate.localeCompare(a.assignedDate));
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
      <HistoryPanel subjectId={subjectId} learner={learner} />
    </>
  );
  if (history) return historyList;
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
