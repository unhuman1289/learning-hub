"use client";
import { SketchIcon } from "../sketch-icons";

import { notebookChapters } from "../../../lib/lesson-v2/notebook-chapters";
import type { NotebookLessonRow } from "../../../lib/lesson-v2/notebook-list";
import type { ShelfSubject } from "../use-shelf";
import type { Route } from "../use-route";
import { RouteLink } from "../ui";
import { useBook } from "./use-book";
import { useEffect, useState } from "react";
import { shortDay, pencilLink } from "../paper-bits";
import { apiJson } from "../api";

type Row = {
  day: string;
  lesson: string;
  itemId: string;
  answer: string;
  attemptNo: number;
  result: string | null;
  feedback: string | null;
  correction: string | null;
};
const mark: Record<string, string> = { correct: "✓", partial: "½", incorrect: "✗", ungradable: "?" };

/** "Lịch sử làm bài" in a notebook (L5.6): the last 30 days of graded answers, with CSV and Markdown downloads. */
function HistoryDownloads({ subjectId, learner }: { subjectId: string; learner: string | null }) {
  const query = new URLSearchParams({ subject: subjectId, ...(learner ? { learner } : {}), days: "3660" });
  return <p className="mt-2 flex flex-wrap gap-4">
    <a className={pencilLink + " gap-1"} href={`/api/history?${query}&format=md`}><SketchIcon name="download" size={17} />Tải Markdown</a>
    <a className={pencilLink + " gap-1"} href={`/api/history?${query}&format=csv`}><SketchIcon name="download" size={17} />Tải CSV</a>
  </p>;
}

function HistoryPanel({ subjectId, learner, downloads = true }: { subjectId: string; learner: string | null; downloads?: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false);
  const query = `subject=${encodeURIComponent(subjectId)}${learner ? `&learner=${encodeURIComponent(learner)}` : ""}`;
  useEffect(() => {
    if (!open) return;
    let live = true;
    apiJson<{ history: Row[] }>(`/api/history?${query}`)
      .then((value) => {
        if (live) setRows(value.history);
      })
      .catch((e: Error) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [open, query]);
  return (
    <details className="my-3" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="min-h-11 cursor-pointer content-center font-hand text-lg text-accent-paper">Lịch sử làm bài</summary>
      {downloads && <HistoryDownloads subjectId={subjectId} learner={learner} />}
      {error && (
        <p role="alert" className="text-accent">
          {error}
        </p>
      )}
      {open && !rows && !error && <p role="status">Đang tải…</p>}
      {rows && !rows.length && <p className="mt-2 text-muted">Chưa có bài làm trong 30 ngày qua.</p>}
      {rows && rows.length > 0 && (
        <ul className="mt-3 grid gap-3">
          {rows.map((r, i) => (
            <li key={i} className="border-b border-line pb-2 text-sm leading-6">
              <span className="text-muted">
                {shortDay(r.day)} · {r.lesson}{/^i\d+$/.test(r.itemId) ? ` · Câu ${Number(r.itemId.slice(1))}` : ""} · lần {r.attemptNo}
              </span>{" "}
              <strong>{r.result ? (mark[r.result] ?? r.result) : "Đang chờ chấm"}</strong>
              <p className="whitespace-pre-wrap">{r.answer}</p>
              {r.feedback && <p className="text-brick">{r.feedback}</p>}
              {r.correction && <p className="whitespace-pre-wrap">Lời giải: {r.correction}</p>}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

export function NotebookHistory({ subjectId, learner, child, go }: {
  subjectId: string; learner: string | null; child: boolean; go: (route: Route) => void;
}) {
  const { book, rows, error, refresh, hasMore, loadingOlder, loadMore } = useBook(subjectId, learner, true, true);
  return <div className="pb-2">
    {error && <p role="alert">Chưa tải được lịch sử. <button className={pencilLink} onClick={() => void refresh()}>Thử lại</button></p>}
    {!book && !error && <p role="status">Đang đọc lịch sử…</p>}
    {book && !rows.length && <p>Chưa có bài trong sổ.</p>}
    {notebookChapters(rows).map(({month, entries}) => {
      const days = new Map<string, NotebookLessonRow[]>();
      for (const { day, row } of entries) {
        const dayRows = days.get(day) ?? [];
        dayRows.push(row);
        days.set(day, dayRows);
      }
      return <section key={month} className="mt-2">
        <h3 className="font-hand text-lg">Tháng {month.slice(5)}/{month.slice(0, 4)}</h3>
        {[...days].map(([day, lessons]) => <details key={day} className="border-b border-rule">
          <summary className="min-h-11 cursor-pointer content-center font-hand text-lg text-accent-paper">{shortDay(day)} · {lessons.length} bài</summary>
          <ul className="ml-3 pb-2">{lessons.map(row => <LessonHistoryLink key={row.id} row={row} go={go} />)}</ul>
        </details>)}
      </section>;
    })}
    {hasMore && <button className={pencilLink} disabled={loadingOlder} onClick={() => void loadMore()}>
      {loadingOlder ? "Đang đọc…" : "Xem bài cũ hơn"}
    </button>}
    {!child && <HistoryPanel subjectId={subjectId} learner={learner} />}
  </div>;
}

function LessonHistoryLink({ row, go, notebook }: { row: Pick<NotebookLessonRow, "id" | "title" | "completedAt" | "correction" | "hasWork">; go: (route: Route) => void; notebook?: string }) {
  const state = row.completedAt ? "Đã xong" : row.correction ? "Cần sửa lại" : row.hasWork ? "Đang làm" : "Chưa mở";
  return <li className="min-w-0">
    <RouteLink route={{ view: "lesson", id: row.id }} go={go} className={pencilLink + " break-words"}>{row.title}</RouteLink>
    <span className="text-sm text-muted-paper"> · {notebook ?? state}</span>
  </li>;
}

/** Recent completed lessons across the shelf, opened from the desk cupboard. */
export function LearnedLessons({ subjects, learner, go }: { subjects: ShelfSubject[]; learner: string | null; go: (route: Route) => void }) {
  const [rows, setRows] = useState<(NotebookLessonRow & { notebook: string })[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const request = new AbortController();
    const query = new URLSearchParams(learner ? { learner } : {});
    Promise.all(subjects.filter(subject => subject.status !== "archived").map(async subject => {
      const { lessons } = await apiJson<{ lessons: NotebookLessonRow[] }>(`/api/subjects/${subject.id}/lessons?${query}`, { signal: request.signal });
      return lessons.filter(lesson => lesson.completedAt).map(lesson => ({ ...lesson, notebook: subject.title }));
    })).then(lists => {
      if (!request.signal.aborted) setRows(lists.flat().sort((a, b) => b.completedAt!.localeCompare(a.completedAt!)).slice(0, 60));
    }).catch(cause => { if (!request.signal.aborted) setError(cause.message); });
    return () => request.abort();
  }, [learner, subjects]);
  if (error) return <p role="alert">{error}</p>;
  if (!rows) return <p role="status">Đang mở bài đã học…</p>;
  if (!rows.length) return <p>Chưa có bài nào học xong.</p>;
  return <ul>{rows.map(row => <LessonHistoryLink key={row.id} row={row} notebook={row.notebook} go={go} />)}</ul>;
}
