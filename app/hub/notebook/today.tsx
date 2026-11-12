import type { NotebookReport } from "../../../lib/notebook-report";
import { chapterNumber } from "../../../lib/lesson-v2/notebook-chapters";
import type { ShelfSubject } from "../use-shelf";
import type { Route } from "../use-route";
import { AdaptiveRequests } from "../adaptive-requests";
import { NewLessonRequest } from "../new-lesson-request";
import { pencil, pencilLink, skillLabel } from "../paper-bits";
import { buttonClass, RouteLink } from "../ui";
import { words } from "../words";
import { Spread } from "./spread";
import type { BookLessons } from "./use-book";

export function NotebookToday({ report, subject, book, learner, child, go, refresh }: {
  report: NotebookReport | undefined; subject: ShelfSubject; book: BookLessons; learner: string | null;
  child: boolean; go: (route: Route) => void; refresh: () => void;
}) {
  const open = book.lessons.filter(row => !row.completedAt);
  const primary = open.find(row => row.slot === "primary");
  const extras = open.filter(row => row.id !== primary?.id);
  const writing = [book.nightly?.status, book.initial?.status].some(status => status === "queued" || status === "leased");
  const canRequest = !learner && subject.status === "active" && !book.setup;
  const next = report?.next ?? [];
  const month = report?.month ?? book.day.slice(0, 7);
  const chapter = chapterNumber(month, book.lessons[0]?.firstMonth ?? month);
  const empty = report && !report.daysStudied && !report.current.total && !report.lessonsDone;
  return <Spread child={child} startAt="today-work" blocks={[
    { id: "today-report", kind: "notebook", label: "Tiến độ gần đây", node: <section aria-label="Tiến độ gần đây">
      <p className={pencil}>Chương {chapter} · {next[0] ?? ("Tháng " + month.slice(5))}</p>
      <h1 className="break-words font-print text-4xl leading-tight">{subject.title}</h1>
      <h2 className="mt-3 font-hand text-xl text-accent">Tuần này</h2>
      {!report ? <p role="status" className={pencil}>Đang đọc tiến độ…</p>
        : empty ? <p className={pencil}>Sổ còn mới. Làm bài đầu tiên để thấy tiến độ ở đây.</p>
        : <>
          <p>{report.daysStudied} ngày học · {report.minutes} phút · {report.lessonsDone} bài xong</p>
          <p>Đúng ngay {report.current.total ? report.current.correct + "/" + report.current.total + " câu" : "—"} <span className={pencil}>· Tuần trước {report.previous.total ? report.previous.correct + "/" + report.previous.total : "—"}</span></p>
          {!!report.solid.length && <p className="font-hand text-lg text-ok">✓ Đã vững · {report.solid.map(skillLabel).join(", ")}</p>}
          {!!report.errors.length && <p className="font-hand text-lg text-brick">Hay nhầm · {report.errors.map(label => skillLabel(label.replace(/^[GPN]:\s*/, ""))).join(", ")}</p>}
          {report.due > 0 && <p className={pencil}>Cần ôn · {report.due} kỹ năng</p>}
        </>}
      {!!next.length && <><h2 className="mt-3 font-hand text-xl text-accent">Sắp tới</h2>
        <ol className="ml-5 list-decimal">{next.map((step, i) => <li key={i}>{step}</li>)}</ol></>}
      {report?.cheer && !empty && <p className="mt-3 font-hand text-lg text-ok">{report.cheer}</p>}
    </section> },
    { id: "today-work", kind: "notebook", label: "Hôm nay", breakBefore: true, node: <section aria-label="Bài hôm nay" className="flex min-h-full flex-col">
      {primary ? <div className="grid min-w-0 justify-items-start gap-1">
        <p className={pencil}>Bài đang làm</p>
        <h2 className="break-words font-print text-3xl leading-tight">{primary.title}</h2>
        <p className={pencil}>{primary.total ? primary.attempted + "/" + primary.total + " câu" : ""}{primary.minutes ? (primary.total ? " · " : "") + primary.minutes + " phút" : ""}</p>
        {primary.reason && <p className="text-sm leading-6 text-muted">{primary.reason}</p>}
        <RouteLink route={{ view: "lesson", id: primary.id }} go={go} className={buttonClass("primary", "mt-1")}>
          {primary.hasWork ? words.action.continue : words.action.open} <span aria-hidden="true">→</span>
        </RouteLink>
      </div> : <p role="status" className={pencil}>
        {writing ? "⌛ Bài hôm nay đang được soạn." : book.setup ? "Chưa lưu được bài đầu tiên." : "Bạn đã xong phần hôm nay."}
      </p>}
      {!!extras.length && <div className="mt-3"><h2 className="font-hand text-xl text-accent">Bài luyện thêm đang chờ</h2>
        <ul>{extras.map(row => <li key={row.id}><RouteLink route={{ view: "lesson", id: row.id }} go={go} className={pencilLink}>{row.title}</RouteLink>
          {row.minutes ? <span className={pencil}> · {row.minutes} phút</span> : null}</li>)}</ul></div>}
      {canRequest && <div className="mt-auto pt-3">
        {book.adaptive ? <AdaptiveRequests icons subjectId={subject.id} learner={learner} go={go} onSaved={refresh} />
          : !open.length && <NewLessonRequest subjectId={subject.id} onOpen={id => { void refresh(); go({ view: "lesson", id }); }} />}
      </div>}
    </section> },
  ]} />;
}
