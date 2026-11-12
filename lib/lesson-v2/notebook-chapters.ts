import { berlinDay } from "../daily-policy.ts";
import type { NotebookLessonRow } from "./notebook-list.ts";

const monthIndex = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7));
export const chapterNumber = (month: string, firstMonth: string) => monthIndex(month) - monthIndex(firstMonth) + 1;

export function notebookChapters(rows: NotebookLessonRow[]) {
  const groups = new Map<string, { row: NotebookLessonRow; day: string }[]>();
  const dated = rows.map(row => ({
    row, day: /^\d{4}-\d{2}-\d{2}$/.test(row.assignedDate) ? row.assignedDate : berlinDay(new Date(row.assignedDate)),
  })).sort((a, b) => b.day.localeCompare(a.day));
  for (const entry of dated) {
    const month = entry.day.slice(0, 7);
    const group = groups.get(month) ?? [];
    group.push(entry);
    groups.set(month, group);
  }
  return [...groups].map(([month, entries]) => {
    const chapter = chapterNumber(month, entries[0].row.firstMonth || dated.at(-1)!.day);
    const counts = new Map<string, number>();
    const total = { minutes: 0, correct: 0, graded: 0 };
    for (const { row } of entries) {
      total.minutes += row.minutes ?? 0;
      total.correct += row.correct;
      total.graded += row.graded;
      if (row.skill) counts.set(row.skill, (counts.get(row.skill) ?? 0) + 1);
    }
    const focus = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    return { month, chapter, entries, total, focus };
  });
}
