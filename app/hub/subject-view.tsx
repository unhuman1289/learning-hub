"use client";

import { useCallback, useState } from "react";
import { RuledPage } from "../../components/notebook/paper";
import type { BookPage, Route } from "./use-route";
import type { ShelfApi } from "./use-shelf";
import { Book } from "./notebook/book";
import { NotebookToday } from "./notebook/today";
import { NotebookPath } from "./notebook/path";
import { NotebookHistory } from "./notebook/history";
import { useBook } from "./notebook/use-book";
import { DeleteNotebook, SubjectFacts, SubjectForm, NotebookSettings } from "./notebook/settings";
import { pencilLink } from "./paper-bits";

export function SubjectView(props: { id: string; page?: BookPage; shelf: ShelfApi; canEdit: boolean; canDelete?: boolean; canManage: boolean; go: (route: Route) => void; hub2?: boolean }) {
  return <SubjectBook key={props.id + ":" + (props.shelf.learner ?? "self")} {...props} />;
}

function SubjectBook({ id, page = "hom-nay", shelf, canEdit, canDelete = false, go, hub2 = false }: Parameters<typeof SubjectView>[0]) {
  const subject = shelf.subjects?.find(item => item.id === id);
  const child = shelf.learners.find(learner => shelf.learner ? learner.id === shelf.learner : learner.relation === "self")?.role === "child";
  const data = useBook(id, shelf.learner, hub2, false);
  const [historyOpen, setHistoryOpen] = useState(page === "muc-luc");
  const closeSettings = useCallback(() => go({ view: "book", id, page: "hom-nay" }), [go, id]);
  if (!subject) return <p className="mx-auto max-w-4xl text-muted">{shelf.subjects ? "Không tìm thấy sổ này." : shelf.error || "Đang mở sổ…"}</p>;
  const practice = () => document.getElementById("notebook-today")?.scrollIntoView({ block: "start" });
  return <Book id={id} title={subject.title} page={page} go={go} paged={hub2} compactNotebook={hub2}>
    {hub2 && <div className="notebook-u3">
      <RuledPage as="aside" className="notebook-u3-today">
        <h1 className="mb-4 break-words font-print text-4xl leading-tight lg:hidden">{subject.title}</h1>
        {data.book ? <NotebookToday subject={subject} book={data.book} learner={shelf.learner} go={go} refresh={data.refresh} />
          : data.error ? <p role="alert">Chưa tải được bài học. <button className={pencilLink} onClick={() => void data.refresh()}>Thử lại</button></p>
          : <p role="status">Đang mở bài hôm nay…</p>}
      </RuledPage>
      <RuledPage as="section" className="notebook-u3-path">
        <h1 className="mb-5 hidden break-words font-print text-4xl leading-tight lg:block">{subject.title}</h1>
        {data.overview ? <NotebookPath data={data.overview} child={child} showProgress={page === "tien-do"} roadmap={data.overview.report.progress}
          subjectId={id} learner={shelf.learner} canEdit={canEdit} onChange={data.refresh} onPractice={practice} />
          : data.reportError ? <p role="alert">Chưa đọc được đường học. <button className={pencilLink} onClick={() => void data.refresh()}>Thử lại</button></p>
          : <p role="status">Đang đọc đường học…</p>}
        <details open={historyOpen || page === "muc-luc"} className="mt-4 border-t border-rule pt-1"
          onToggle={event => {
            const open = event.currentTarget.open;
            setHistoryOpen(open);
            if (!open && page === "muc-luc") go({ view: "book", id });
          }}>
          <summary className="min-h-11 cursor-pointer content-center font-hand text-xl text-accent-paper">Lịch sử</summary>
          {(historyOpen || page === "muc-luc") && <NotebookHistory subjectId={id} learner={shelf.learner} child={child} go={go} />}
        </details>
      </RuledPage>
    </div>}
    {page === "cai-dat" && <NotebookSettings title={subject.title} onClose={closeSettings}>
      {canEdit && subject.status !== "archived"
        ? <SubjectForm key={subject.id} subject={subject} shelf={shelf} hub2={hub2} /> : <SubjectFacts subject={subject} />}
      {canDelete && subject.status !== "archived" && <DeleteNotebook subject={subject} shelf={shelf} onDeleted={() => go({ view: "desk" })} />}
    </NotebookSettings>}
  </Book>;
}
