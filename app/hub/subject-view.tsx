"use client";

import { lazy, Suspense, useCallback, useState } from "react";
import { RuledPage } from "../../components/notebook/paper";
import type { BookPage, Route } from "./use-route";
import type { ShelfApi } from "./use-shelf";
import { Book } from "./notebook/book";
import { NotebookToday } from "./notebook/today";
import { NotebookPath } from "./notebook/path";
import { NotebookHistory } from "./notebook/history";
import { useBook } from "./notebook/use-book";
import { pencilLink } from "./paper-bits";

const Settings = lazy(() => import("./notebook/subject-settings").then(module => ({ default: module.SubjectSettings })));

export function SubjectView(props: { id: string; page?: BookPage; shelf: ShelfApi; canEdit: boolean; canDelete?: boolean; canManage: boolean; go: (route: Route) => void; hub2?: boolean }) {
  return <SubjectBook key={props.id + ":" + (props.shelf.learner ?? "self")} {...props} />;
}

function SubjectBook({ id, page = "hom-nay", shelf, canEdit, canDelete = false, canManage, go, hub2 = false }: Parameters<typeof SubjectView>[0]) {
  const data = useBook(id, shelf.learner, hub2);
  const subject = hub2 ? data.subject : shelf.subjects?.find(item => item.id === id);
  const child = data.child ?? false;
  const editable = hub2 && !shelf.learner ? !child : canEdit;
  const [historyOpen, setHistoryOpen] = useState(page === "muc-luc");
  const closeSettings = useCallback(() => go({ view: "book", id, page: "hom-nay" }), [go, id]);
  if (!subject) return data.error
    ? <p role="alert" className="mx-auto max-w-4xl">Chưa mở được sổ. <button className={pencilLink} onClick={() => void data.refresh()}>Thử lại</button></p>
    : <p className="mx-auto max-w-4xl text-muted">{!hub2 && shelf.subjects ? "Không tìm thấy sổ này." : shelf.error || "Đang mở sổ…"}</p>;
  const practice = () => document.getElementById("notebook-today")?.scrollIntoView({ block: "start" });
  return <Book id={id} title={subject.title} page={page} go={go} paged={hub2} compactNotebook={hub2}>
    {hub2 && <div className="notebook-u3">
      <RuledPage as="aside" className="notebook-u3-today">
        <h1 className="mb-4 break-words font-print text-4xl leading-tight lg:hidden">{subject.title}</h1>
        {data.book ? <NotebookToday subject={subject} book={data.book} learner={shelf.learner} go={go} refresh={data.refresh} requests={data.requests} />
          : data.error ? <p role="alert">Chưa tải được bài học. <button className={pencilLink} onClick={() => void data.refresh()}>Thử lại</button></p>
          : <p role="status">Đang mở bài hôm nay…</p>}
      </RuledPage>
      <RuledPage as="section" className="notebook-u3-path">
        <h1 className="mb-5 hidden break-words font-print text-4xl leading-tight lg:block">{subject.title}</h1>
        {data.overview ? <NotebookPath data={data.overview} child={child} showProgress={page === "tien-do"} roadmap={data.overview.report.progress}
          subjectId={id} learner={shelf.learner} canEdit={editable} onChange={data.refresh} onPractice={practice} />
          : data.error ? <p role="alert">Chưa đọc được đường học. <button className={pencilLink} onClick={() => void data.refresh()}>Thử lại</button></p>
          : <p role="status">Đang đọc đường học…</p>}
        <details open={historyOpen || page === "muc-luc"} className="mt-4 border-t border-rule pt-1"
          onToggle={event => {
            const open = event.currentTarget.open;
            setHistoryOpen(open);
            if (!open && page === "muc-luc") go({ view: "book", id });
          }}>
          <summary className="min-h-11 cursor-pointer content-center font-hand text-xl text-accent-paper">Lịch sử</summary>
          {(historyOpen || page === "muc-luc") && <NotebookHistory data={data} subjectId={id} learner={shelf.learner} child={child} go={go} />}
        </details>
      </RuledPage>
    </div>}
    {page === "cai-dat" && <Suspense fallback={<p role="status">Đang mở cài đặt…</p>}>
      <Settings subject={subject} shelf={shelf} hub2={hub2} canEdit={editable} canDelete={canDelete}
        canManage={canManage} onClose={() => { void data.refresh(); closeSettings(); }} onDeleted={() => go({ view: "desk" })} />
    </Suspense>}
  </Book>;
}
