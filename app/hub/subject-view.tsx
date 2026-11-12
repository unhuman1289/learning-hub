"use client";

import type { BookPage, Route } from "./use-route";
import type { ShelfApi } from "./use-shelf";
import { Book } from "./notebook/book";
import { NotebookToday } from "./notebook/today";
import { Contents } from "./notebook/contents";
import { useBook } from "./notebook/use-book";
import { DeleteNotebook, SubjectFacts, SubjectForm } from "./notebook/settings";
import { BookProgress } from "./notebook/progress";
import { HistoryPanel } from "./history-panel";
import { words } from "./words";

export function SubjectView(props: { id: string; page?: BookPage; shelf: ShelfApi; canEdit: boolean; canDelete?: boolean; canManage: boolean; go: (route: Route) => void; hub2?: boolean }) {
  return <SubjectBook key={props.id + ":" + (props.shelf.learner ?? "self")} {...props} />;
}

function SubjectBook({ id, page = "hom-nay", shelf, canEdit, canDelete = false, go, hub2 = false }: Parameters<typeof SubjectView>[0]) {
  const subject = shelf.subjects?.find((item) => item.id === id);
  const child = shelf.learners.find(learner => shelf.learner ? learner.id === shelf.learner : learner.relation === "self")?.role === "child";
  const data = useBook(id, shelf.learner, hub2 && page !== "cai-dat", page === "muc-luc");
  if (!subject) return <p className="mx-auto max-w-4xl text-muted">{shelf.subjects ? "Không tìm thấy sổ này." : shelf.error || "Đang mở sổ…"}</p>;
  const paged = hub2 && (page === "hom-nay" || page === "muc-luc");
  const loading = <p role={data.error ? "alert" : "status"} className="bg-paper p-4">{data.error ? words.error.unknown : "Đang đọc sổ…"}</p>;
  return <Book id={id} title={subject.title} page={page} go={go} paged={paged}>
    {paged && (data.book ? page === "hom-nay"
      ? <NotebookToday report={data.overview?.report} subject={subject} book={data.book} learner={shelf.learner} child={child} go={go} refresh={data.refresh} />
      : <Contents title={subject.title} rows={data.rows} child={child} go={go} loadingOlder={data.loadingOlder}
          loadMore={data.hasMore ? () => void data.loadMore() : undefined} /> : loading)}
    {page === "tien-do" && (data.overview ? <BookProgress data={data.overview} child={child} roadmap={data.overview.report.progress}
      subjectId={id} learner={shelf.learner} canEdit={canEdit} onChange={data.refresh}
      onPractice={() => go({ view: "book", id, page: "hom-nay" })} /> : data.reportError ? <p role="alert">{words.error.unknown}</p> : loading)}
    {page === "cai-dat" && <>
      {canEdit && subject.status !== "archived"
        ? <SubjectForm key={subject.id} subject={subject} shelf={shelf} hub2={hub2} /> : <SubjectFacts subject={subject} />}
      {hub2 && !child && <HistoryPanel subjectId={id} learner={shelf.learner} />}
      {canDelete && subject.status !== "archived" && <DeleteNotebook subject={subject} shelf={shelf} onDeleted={() => go({ view: "desk" })} />}
    </>}
  </Book>;
}
