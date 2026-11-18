import type { ShelfSubject } from "../use-shelf";
import type { Route } from "../use-route";
import { AdaptiveRequests } from "./request-icons";
import { NewLessonRequest } from "../new-lesson-request";
import { SketchIcon } from "../sketch-icons";
import { pencil, pencilLink } from "../paper-bits";
import { buttonClass, RouteLink } from "../ui";
import { words } from "../words";
import type { listRequests } from "../../../lib/requests/service";
import type { BookLessons } from "./use-book";

export function NotebookToday({ subject, book, learner, go, refresh, requests }: {
  subject: ShelfSubject; book: BookLessons; learner: string | null;
  requests: Awaited<ReturnType<typeof listRequests>>;
  go: (route: Route) => void; refresh: () => void;
}) {
  const open = book.lessons.filter(row => !row.completedAt);
  const primary = open.find(row => row.slot === "primary");
  const extras = open.filter(row => row.id !== primary?.id);
  const writing = [book.nightly?.status, book.initial?.status].some(status => status === "queued" || status === "leased");
  const canRequest = !learner && subject.status === "active" && !book.setup;
  return <section aria-labelledby="notebook-today">
      <h2 id="notebook-today" className="mb-3 font-print text-2xl">Hôm nay</h2>
      {primary ? <div className="grid min-w-0 justify-items-start gap-1">
        <h3 className="break-words font-print text-2xl leading-tight">{primary.title}</h3>
        <p className={pencil}>{primary.total ? primary.attempted + "/" + primary.total + " câu" : ""}{primary.minutes ? (primary.total ? " · " : "") + primary.minutes + " phút" : ""}</p>
        {primary.reason && <p className="text-sm leading-6 text-muted">{primary.reason}</p>}
        <RouteLink route={{ view: "lesson", id: primary.id }} go={go} className={buttonClass("primary", "mt-1")}>
          {primary.hasWork ? words.action.continue : words.action.open} <span aria-hidden="true">→</span>
        </RouteLink>
      </div> : <p role="status" className={pencil + " flex items-center gap-2"}>
        {writing ? <><SketchIcon name="hourglass" size={20} />Bài hôm nay đang được soạn.</>
          : book.setup ? "Chưa lưu được bài đầu tiên." : "Bạn đã xong phần hôm nay."}
      </p>}
      {!!extras.length && <details className="mt-3"><summary className="min-h-11 cursor-pointer content-center font-hand text-lg text-accent-paper">Bài luyện thêm · {extras.length}</summary>
        <ul>{extras.map(row => <li key={row.id}><RouteLink route={{ view: "lesson", id: row.id }} go={go} className={pencilLink}>{row.title}</RouteLink>
          {row.minutes ? <span className={pencil}> · {row.minutes} phút</span> : null}</li>)}</ul></details>}
      {canRequest && <div className="mt-auto pt-3">
        {book.adaptive ? <AdaptiveRequests initial={requests} subjectId={subject.id} learner={learner} go={go} onSaved={refresh} />
          : !open.length && <NewLessonRequest initial={requests} subjectId={subject.id} onOpen={id => { void refresh(); go({ view: "lesson", id }); }} />}
      </div>}
    </section>;
}
