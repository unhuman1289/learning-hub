import type { NotebookLessonRow } from "../../../lib/lesson-v2/notebook-list";
import { notebookChapters } from "../../../lib/lesson-v2/notebook-chapters";
import { pencil, pencilLink, shortDay, skillLabel } from "../paper-bits";
import { RouteLink } from "../ui";
import type { Route } from "../use-route";
import { words } from "../words";
import { Spread, type SpreadBlock } from "./spread";

export function Contents({ rows, title, child, go, loadMore, loadingOlder }: {
  rows: NotebookLessonRow[]; title: string; child: boolean; go: (route: Route) => void; loadMore?: () => void; loadingOlder: boolean;
}) {
  const chapters = notebookChapters(rows);
  const blocks: SpreadBlock[] = [];
  for (const { month, chapter, entries, total, focus } of chapters) {
    const heading = "Chương " + chapter + " · Tháng " + month.slice(5) + "/" + month.slice(0, 4);
    blocks.push({
      id: month, kind: "notebook", label: "Mục lục", breakBefore: true, reservedLines: 1,
      text: [{ value: heading }, ...(focus ? [{ value: focus }] : [])],
      node: <><h2 tabIndex={-1} className="font-print text-2xl leading-[var(--paper-line-height)]">{heading}</h2>
        {focus && <p className={pencil}>{skillLabel(focus)}</p>}</>,
    });
    for (const [index, { row, day }] of entries.entries()) {
      const kind = row.kind === "diagnostic" ? words.lessonKind.diagnostic : row.kind === "new" ? words.lessonKind.new
        : row.kind === "exploration" ? words.lessonKind.own : row.kind === "review" ? words.lessonKind.review : words.lessonKind.practice;
      const state = row.completedAt ? "Đã xong" : row.correction ? "Cần sửa lại" : row.hasWork ? "Đang làm" : "Chưa mở";
      const mark = row.completedAt ? "✓" : row.correction ? "✎" : row.hasWork ? "●" : "○";
      blocks.push({
        id: row.id, kind: "notebook", label: heading, reservedLines: 1,
        text: [{ value: kind + " " + row.title }],
        node: <div className="grid grid-cols-[3.25rem_minmax(0,1fr)_1.25rem] items-center gap-x-2 border-b border-rule/60">
          <span className="font-hand text-sm text-accent">{(index === 0 || entries[index - 1].day !== day) && shortDay(day)}</span>
          <div className="min-w-0 text-[17px] leading-6"><span className={pencil}>{kind} · </span>
            <RouteLink route={{ view: "lesson", id: row.id }} go={go} className={pencilLink}>{row.title}</RouteLink></div>
          <span className={row.completedAt ? "text-ok" : "text-brick"} title={state}><span aria-hidden="true">{mark}</span><span className="sr-only">{state}</span></span>
        </div>,
      });
    }
    blocks.push({
      id: month + "-total", kind: "notebook", label: heading, reservedLines: 2,
      node: <p className={pencil}>{entries.length} bài · {total.minutes} phút dự kiến{total.graded ? " · đúng ngay " + total.correct + "/" + total.graded : ""}</p>,
    });
  }
  if (!blocks.length) blocks.push({ id: "empty", kind: "notebook", label: "Mục lục", node: <>
    <h1 className="font-print text-3xl">{title}</h1><p className={pencil}>Sổ chưa có bài.</p></> });
  if (loadMore) blocks.push({ id: "older", kind: "notebook", label: "Mục lục", reservedLines: 2,
    node: <button type="button" className={pencilLink} disabled={loadingOlder} onClick={loadMore}>{loadingOlder ? "Đang đọc…" : "Xem thêm bài"}</button> });
  return <Spread blocks={blocks} startAt={blocks[0].id} child={child} />;
}
