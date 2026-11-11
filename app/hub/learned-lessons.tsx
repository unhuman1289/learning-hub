"use client";

import { useEffect, useState } from "react";
import { MarginDate } from "../../components/notebook/paper";
import { apiJson, learnerQuery } from "./api";
import { pencil, shortDay } from "./paper-bits";
import { RouteLink } from "./ui";
import type { Route } from "./use-route";
import type { ShelfSubject } from "./use-shelf";

type Row = { id: string; title: string; completedAt: string | null; kind: string; subject: string };
const kindLabel = (kind: string) => (kind === "new" ? "Học mới" : kind === "exploration" ? "Cá nhân hóa" : kind === "review" ? "Ôn tập" : "Luyện tập");

/** What is in the desk drawer: finished lessons from every notebook, newest first, dated in the margin. */
export function LearnedLessons({ subjects, learner, go }: { subjects: ShelfSubject[]; learner: string | null; go: (route: Route) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const ids = subjects.filter((subject) => subject.status !== "archived").map((subject) => subject.id + "\t" + subject.title).join("\n");
  useEffect(() => {
    let alive = true;
    Promise.all(ids.split("\n").filter(Boolean).map(async (entry) => {
      const [id, subject] = entry.split("\t");
      const { lessons } = await apiJson<{ lessons: Omit<Row, "subject">[] }>(`/api/subjects/${id}/lessons${learnerQuery(learner)}`);
      return lessons.filter((lesson) => lesson.completedAt).map((lesson) => ({ ...lesson, subject }));
    }))
      .then((lists) => { if (alive) setRows(lists.flat().sort((a, b) => b.completedAt!.localeCompare(a.completedAt!)).slice(0, 60)); })
      .catch((e: Error) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [ids, learner]);
  if (error) return <p role="alert">{error}</p>;
  if (!rows) return <p role="status" className={pencil}>Đang mở ngăn kéo…</p>;
  if (!rows.length) return <p className={pencil}>Chưa có bài nào học xong.</p>;
  return (
    <ul className="pb-7">
      {rows.map((row, i) => {
        const day = shortDay(row.completedAt!);
        return (
          <li key={row.id} className="relative">
            {(i === 0 || shortDay(rows[i - 1].completedAt!) !== day) && <MarginDate>{day}</MarginDate>}
            <span className={pencil}>{row.subject} · {kindLabel(row.kind)} · </span>
            <RouteLink route={{ view: "lesson", id: row.id }} go={go} className="underline decoration-rule underline-offset-4 hover:decoration-accent">{row.title}</RouteLink>
          </li>
        );
      })}
    </ul>
  );
}
