import type { NotebookLessonRow } from "../../../lib/lesson-v2/notebook-list";
import { MarginDate } from "../../../components/notebook/paper";
import { pencil, pencilLink, shortDay, skillLabel } from "../paper-bits";
import { RouteLink } from "../ui";
import type { Route } from "../use-route";
import { words } from "../words";

export function Contents({ rows, go }: { rows: NotebookLessonRow[]; go: (route: Route) => void }) {
  if (!rows.length) return <p className={pencil}>Sổ chưa có bài.</p>;
  const chapters = new Map<string, NotebookLessonRow[]>();
  const monthIndex = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7));
  for (const row of [...rows].sort((a,b) => b.assignedDate.localeCompare(a.assignedDate))) {
    const month = row.assignedDate.slice(0, 7);
    const entries = chapters.get(month) ?? [];
    entries.push(row);
    chapters.set(month, entries);
  }
  return <div className="grid gap-8">
    {[...chapters].map(([month, entries]) => {
      const chapter = monthIndex(month) - monthIndex(entries[0].firstMonth) + 1;
      const sum = entries.reduce((total, row) => ({ minutes: total.minutes + (row.minutes ?? 0), correct: total.correct + row.correct, graded: total.graded + row.graded }), { minutes: 0, correct: 0, graded: 0 });
      const counts = new Map<string, number>();
      entries.forEach(row => { if (row.skill) counts.set(row.skill, (counts.get(row.skill) ?? 0) + 1); });
      const focus = [...counts].sort((a,b) => b[1] - a[1])[0]?.[0];
      return <section key={month} className="border-t border-rule pt-3">
        <h2 className="font-print text-2xl">Chương {chapter} · Tháng {month.slice(5)}/{month.slice(0,4)}</h2>
        {focus && <p className={pencil}>{skillLabel(focus)}</p>}
        <ol className="mt-2">
          {entries.map((row, index) => {
            const state = row.completedAt ? "Đã xong" : row.correction ? "Cần sửa lại" : row.hasWork ? "Đang làm" : "Chưa mở";
            const kind = row.kind === "diagnostic" ? words.lessonKind.diagnostic : row.kind === "new" ? words.lessonKind.new
              : row.kind === "exploration" ? words.lessonKind.own : row.kind === "review" ? words.lessonKind.review : words.lessonKind.practice;
            return <li key={row.id} className="relative flex flex-wrap items-center gap-x-2">
              {(index === 0 || entries[index - 1].assignedDate !== row.assignedDate) && <MarginDate>{shortDay(row.assignedDate)}</MarginDate>}
              <span className={pencil}>{kind}</span>
              <RouteLink route={{ view: "lesson", id: row.id }} go={go} className={pencilLink}>{row.title}</RouteLink>
              <span className="text-sm text-muted">{state}</span>
            </li>;
          })}
        </ol>
        <p className={pencil}>{entries.length} bài · {sum.minutes} phút dự kiến{sum.graded ? ` · đúng ngay ${sum.correct}/${sum.graded}` : ""}</p>
      </section>;
    })}
  </div>;
}
