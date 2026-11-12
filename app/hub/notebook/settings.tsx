"use client";

import { useState } from "react";
import { fieldClass, labelClass } from "../paper-dialog";
import { paperAction, PaperSummary } from "../paper-bits";
import type { ShelfApi, ShelfSubject } from "../use-shelf";

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
