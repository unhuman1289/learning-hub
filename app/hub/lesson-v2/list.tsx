"use client";

import { useEffect, useState } from "react";
import { apiJson, learnerQuery } from "../api";
import { HistoryPanel } from "../history-panel";
import { NewLessonRequest } from "../new-lesson-request";
import { buttonClass, RouteLink } from "../ui";
import type { Route } from "../use-route";

type LessonRow = { id: string; title: string; completedAt: string | null };
type Props = { subjectId: string; learner: string | null; go: (route: Route) => void; canRequest?: boolean; history?: boolean };

function NotebookLessons({ subjectId, learner, go, canRequest = false, history = false }: Props) {
  const [rows, setRows] = useState<LessonRow[] | null>(null), [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    apiJson<{lessons: LessonRow[]}>(`/api/subjects/${subjectId}/lessons${learnerQuery(learner)}`)
      .then(({lessons}) => { if (alive) setRows(lessons); })
      .catch((e: Error) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [subjectId, learner]);
  if (error) return <p role="alert">{error}</p>;
  if (!rows) return <p role="status">Đang đọc bài trong sổ…</p>;
  const open = rows.filter(row => !row.completedAt);
  return history ? (
    <>
      <ul className="grid gap-1">
        {rows.filter(row=>row.completedAt).map(row => <li key={row.id}>
          <RouteLink route={{view:"lesson",id:row.id}} go={go} className={buttonClass("ghost")}>{row.title}</RouteLink>
        </li>)}
      </ul>
      <HistoryPanel subjectId={subjectId} learner={learner} />
    </>
  ) : (
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
  );
}
export function LessonList(props: Props) {
  return <NotebookLessons key={props.subjectId + ":" + (props.learner ?? "self")} {...props} />;
}
