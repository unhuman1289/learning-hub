"use client";

import {SkillProgress} from "./skill-progress";

import { LessonList } from "./lesson-v2/list";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { RuledPage } from "../../components/notebook/paper";
import { fieldClass, labelClass } from "./paper-dialog";
import { buttonClass, RouteLink } from "./ui";
import type { Route } from "./use-route";
import type { ShelfApi, ShelfSubject } from "./use-shelf";

const statusText: Record<ShelfSubject["status"], string> = {
  setup: "Đang lập lộ trình",
  active: "Đang học",
  paused: "Tạm dừng",
  archived: "Đã cất",
};

/**
 * A notebook opened since Learning Hub 2.0. Until its skill map and first lessons exist, this page
 * shows the notebook's goal and lets the learner (adult) or a guardian adjust it.
 */
export function SubjectView({ id, shelf, canEdit, canManage, go, hub2 = false }: { id: string; shelf: ShelfApi; canEdit: boolean; canManage: boolean; go: (route: Route) => void; hub2?: boolean }) {
  const subject = shelf.subjects?.find((item) => item.id === id) ?? null;
  if (!shelf.subjects) return <p className="mx-auto max-w-4xl text-muted">{shelf.error || "Đang mở sổ…"}</p>;
  if (!subject) return <p className="mx-auto max-w-4xl text-muted">Không tìm thấy sổ này trên kệ.</p>;
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6">
      <RouteLink route={{ view: "desk" }} go={go} className="inline-flex items-center gap-1.5 self-start text-sm text-accent hover:underline"><ArrowLeft size={16} aria-hidden="true" /> Về phòng học</RouteLink>
      <RuledPage>
        <p className="font-hand text-lg leading-7 text-accent">{statusText[subject.status]}</p>
        <h1 className="relative top-2.5 font-print text-[2.25rem] font-medium leading-[3.5rem]">{subject.title}</h1>
        {hub2 && <LessonList subjectId={id} learner={shelf.learner} go={go} showBoth canRequest={subject.status === "active" || subject.status === "setup"} />}
        {hub2 && <SkillProgress subjectId={id} learner={shelf.learner} canEdit={canManage} />}
        <details className="border-t border-line bg-paper py-3">
          <summary className="min-h-11 cursor-pointer font-hand text-xl text-accent">Thêm</summary>
          {!shelf.learner && <RouteLink route={{view:"notes"}} go={go} className={buttonClass("ghost")}>Ghi chú và nhật ký</RouteLink>}
        </details>
        <details className="border-t border-line bg-paper py-3">
          <summary className="min-h-11 cursor-pointer font-hand text-xl text-accent">Cài đặt sổ</summary>
          {canEdit ? <SubjectForm key={subject.id} subject={subject} shelf={shelf} hub2={hub2} /> : <SubjectFacts subject={subject} />}
        </details>
      </RuledPage>
    </div>
  );
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
  const [goal, setGoal] = useState(subject.goal);
  const [level, setLevel] = useState(subject.level);
  const [curriculum, setCurriculum] = useState(subject.curriculum);
  const [instructions, setInstructions] = useState(subject.instructions ?? "");
  const [aiEnabled,setAiEnabled]=useState(subject.aiEnabled);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");
  const changed = goal !== subject.goal || level !== subject.level || curriculum !== subject.curriculum || instructions !== (subject.instructions ?? "") || aiEnabled!==subject.aiEnabled;

  async function save() {
    setState("saving");
    setError("");
    try {
      await shelf.update(subject.id, { revision: subject.revision, goal, level, curriculum, ...(hub2 ? { instructions } : {}), aiEnabled });
      setState("saved");
    } catch (cause) {
      setError((cause as Error).message);
      setState("idle");
    }
  }

  return (
    <form className="mt-4 grid gap-7" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label className={labelClass}>Mục tiêu
        <textarea value={goal} maxLength={2000} rows={3} onChange={(event) => { setGoal(event.target.value); setState("idle"); }} className={fieldClass} />
      </label>
      <label className={labelClass}>Trình độ hiện tại
        <input value={level} maxLength={200} onChange={(event) => { setLevel(event.target.value); setState("idle"); }} className={fieldClass} />
      </label>
      <label className={labelClass}>Chương trình
        <input value={curriculum} maxLength={500} onChange={(event) => { setCurriculum(event.target.value); setState("idle"); }} className={fieldClass} />
      </label>
{hub2 && (
        <label className={labelClass}>Prompt của sổ
          <span className="text-sm font-normal text-muted">Hướng dẫn riêng cho người soạn và chấm bài của sổ này, ví dụ bối cảnh, tỉ lệ chủ đề, cách sửa bài. Luật của Hub vẫn được áp dụng.</span>
          <textarea value={instructions} maxLength={4000} rows={6} onChange={(event) => { setInstructions(event.target.value); setState("idle"); }} className={fieldClass} />
        </label>
      )}
{hub2 && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={aiEnabled} disabled={subject.status!=="active"} onChange={e=>{setAiEnabled(e.target.checked);setState("idle");}}/> Tự chuẩn bị bài mới qua đêm khi sổ đã học hết bài.</label>}
      {error && <p role="alert" className="rounded-md bg-rose-soft px-3 py-2 text-sm leading-6 text-accent-hover">{error}</p>}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <span role="status" className="text-sm text-muted">{state === "saved" && !changed ? "Đã lưu." : ""}</span>
        <button type="submit" disabled={!changed || state === "saving"} className={buttonClass("primary")}>{state === "saving" ? "Đang lưu…" : "Lưu"}</button>
      </div>
    </form>
  );
}
