"use client";
import { SketchIcon } from "./sketch-icons";

import { useEffect, useState } from "react";
import { shortDay, pencilLink } from "./paper-bits";
import { apiJson } from "./api";

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
export function HistoryDownloads({ subjectId, learner }: { subjectId: string; learner: string | null }) {
  const query = new URLSearchParams({ subject: subjectId, ...(learner ? { learner } : {}), days: "3660" });
  return <p className="mt-2 flex flex-wrap gap-4">
    <a className={pencilLink + " gap-1"} href={`/api/history?${query}&format=md`}><SketchIcon name="download" size={17} />Tải Markdown</a>
    <a className={pencilLink + " gap-1"} href={`/api/history?${query}&format=csv`}><SketchIcon name="download" size={17} />Tải CSV</a>
  </p>;
}

export function HistoryPanel({ subjectId, learner, downloads = true }: { subjectId: string; learner: string | null; downloads?: boolean }) {
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
    <details className="my-6 rounded border border-line bg-paper p-4" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="min-h-11 cursor-pointer font-hand text-2xl">Lịch sử làm bài</summary>
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
