"use client";

import { LessonList } from "./lesson-v2/list";
import { useEffect, useState } from "react";
import { fieldClass, labelClass } from "./paper-dialog";
import { paperAction, PaperSummary } from "./paper-bits";
import type { BookPage, Route } from "./use-route";
import type { ShelfApi, ShelfSubject } from "./use-shelf";
import type { NotebookOverview } from "../../lib/learner-model/overview";
import { apiJson, learnerQuery } from "./api";
import { useLiveRefresh } from "./use-live-refresh";
import { Book } from "./notebook/book";
import { RecentNotebookReport } from "./notebook/today";
import { BookProgress } from "./notebook/progress";
import { HistoryPanel } from "./history-panel";
import { words } from "./words";

export function SubjectView(props: { id: string; page?: BookPage; shelf: ShelfApi; canEdit: boolean; canManage: boolean; go: (route: Route) => void; hub2?: boolean }) {
  return <SubjectBook key={props.id + ":" + (props.shelf.learner ?? "self")} {...props} />;
}

function SubjectBook({ id, page = "hom-nay", shelf, canEdit, go, hub2 = false }: Parameters<typeof SubjectView>[0]) {
  const subject = shelf.subjects?.find((item) => item.id === id);
  const child = shelf.learners.find(learner => shelf.learner ? learner.id === shelf.learner : learner.relation === "self")?.role === "child";
  const [data, setData] = useState<NotebookOverview | null>(null);
  const [error, setError] = useState(false);
  const query = learnerQuery(shelf.learner);
  const url = `/api/subjects/${id}?view=overview${query ? "&" + query.slice(1) : ""}`;
  useEffect(() => {
    if (!hub2) return;
    let alive = true;
    apiJson<NotebookOverview>(url).then(value => { if (alive) setData(value); }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [hub2, url]);
  useLiveRefresh(async () => { setData(await apiJson<NotebookOverview>(url)); setError(false); }, hub2);
  if (!subject) return <p className="mx-auto max-w-4xl text-muted">{shelf.subjects ? "Không tìm thấy sổ này." : shelf.error || "Đang mở sổ…"}</p>;
  return <Book id={id} title={subject.title} page={page} go={go}>
    {page === "muc-luc" && <>
      {subject.goal && <p className="mb-4 whitespace-pre-wrap font-hand text-xl">{subject.goal}</p>}
      {!!subject.roadmap?.length && <section className="mb-4"><h2 className="font-hand text-xl text-accent">{words.place.next}</h2>
        <ol className="ml-5 list-decimal">{subject.roadmap.slice(0, 3).map((step, index) => <li key={index}>{step.title}</li>)}</ol></section>}
    </>}
    <div hidden={page !== "hom-nay" && page !== "muc-luc"} className={page === "hom-nay" ? "md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-7" : undefined}>
      <div className={page === "hom-nay" ? "min-w-0 md:col-start-2 md:row-start-1" : undefined}>
        {hub2 && <LessonList subjectId={id} learner={shelf.learner} go={go} showBoth bookPage={page === "muc-luc" ? "contents" : "today"}
          canRequest={!shelf.learner && (subject.status === "active" || subject.status === "setup")} />}
      </div>
      {page === "hom-nay" && hub2 && <div className="mt-6 md:col-start-1 md:row-start-1 md:mt-0"><RecentNotebookReport data={data} subject={subject} /></div>}
    </div>
    {page === "tien-do" && (data ? <BookProgress data={data} child={child} /> : <p role={error ? "alert" : "status"}>{error ? words.error.unknown : "Đang đọc tiến độ…"}</p>)}
    {page === "cai-dat" && <>
      {canEdit && !child && subject.status !== "archived"
        ? <SubjectForm key={subject.id} subject={subject} shelf={shelf} hub2={hub2} /> : <SubjectFacts subject={subject} />}
      {hub2 && !child && <HistoryPanel subjectId={id} learner={shelf.learner} />}
    </>}
  </Book>;
}

export function SubjectFacts({ subject }: { subject: ShelfSubject }) {
  const rows: [string, string][] = [["Mục tiêu", subject.goal], ["Trình độ", subject.level], ["Chương trình", subject.curriculum]];
  return (
    <dl className="mt-4 grid gap-1">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-x-4 sm:grid-cols-[9rem_1fr]">
          <dt className="text-sm font-semibold leading-7 text-muted">{label}</dt>
          <dd className="whitespace-pre-wrap leading-7">{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SubjectForm({ subject, shelf, hub2 = false }: { subject: ShelfSubject; shelf: ShelfApi; hub2?: boolean }) {
  type Draft = Partial<Pick<ShelfSubject, "goal" | "level" | "curriculum" | "instructions" | "aiEnabled">>;
  const [draft, setDraft] = useState<Draft>({});
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");
  const changed = Object.entries(draft).some(([field, value]) => value !== subject[field as keyof Draft]);

  function edit(fields: Draft) {
    setDraft(current => ({ ...current, ...fields }));
    setState("idle");
  }

  async function save() {
    setState("saving");
    setError("");
    try {
      await shelf.update(subject.id, { revision: subject.revision, ...draft });
      setDraft(current => current === draft ? {} : current);
      setState("saved");
    } catch (cause) {
      setError((cause as Error).message);
      setState("idle");
    }
  }

  return (
    <form className="mt-4 grid gap-7" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label className={labelClass}>Mục tiêu
        <textarea value={draft.goal ?? subject.goal} maxLength={2000} rows={3} onChange={(event) => edit({ goal: event.target.value })} className={fieldClass} />
      </label>
      <label className={labelClass}>Trình độ hiện tại
        <input value={draft.level ?? subject.level} maxLength={200} onChange={(event) => edit({ level: event.target.value })} className={fieldClass} />
      </label>
      <label className={labelClass}>Chương trình
        <input value={draft.curriculum ?? subject.curriculum} maxLength={500} onChange={(event) => edit({ curriculum: event.target.value })} className={fieldClass} />
      </label>
{hub2 && (
        <label className={labelClass}>Lời dặn
          <span className="text-sm font-normal text-muted">Điều bạn muốn cô soạn và sửa bài lưu ý.</span>
          <textarea value={draft.instructions ?? subject.instructions} maxLength={4000} rows={6} onChange={(event) => edit({ instructions: event.target.value })} className={fieldClass} />
        </label>
      )}
{hub2 && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={draft.aiEnabled ?? subject.aiEnabled} disabled={subject.status!=="active"} onChange={e => edit({ aiEnabled: e.target.checked })}/> Mỗi sáng có bài mới khi bạn đã xong bài hôm trước.</label>}
      {subject.openingBrief && <details>
        <PaperSummary>Nội dung lúc mở sổ</PaperSummary>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-muted">{subject.openingBrief}</p>
      </details>}
      {error && <p role="alert" className="rounded-md bg-rose-soft px-3 py-2 text-sm leading-6 text-accent-hover">{error}</p>}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <span role="status" className="text-sm text-muted">{state === "saved" && !changed ? "Đã lưu." : ""}</span>
        <button type="submit" disabled={!changed || state === "saving"} className={paperAction}>{state === "saving" ? "Đang lưu…" : "Lưu"}</button>
      </div>
    </form>
  );
}
