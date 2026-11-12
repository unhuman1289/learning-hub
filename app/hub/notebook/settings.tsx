"use client";

import { useState } from "react";
import { fieldClass, labelClass } from "../paper-dialog";
import { paperAction, PaperSummary } from "../paper-bits";
import type { ShelfApi, ShelfSubject } from "../use-shelf";
import { frameworks } from "../../../lib/roadmap/frameworks";
import { PaperConfirm } from "../paper-confirm";

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
  const [framework, setFramework] = useState(subject.framework.key);
  const [custom, setCustom] = useState(subject.framework.custom ?? "");
  const frameworkChanged = framework !== subject.framework.key || (framework === "custom" && custom.trim() !== subject.framework.custom);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");
  const changed = frameworkChanged || Object.entries(draft).some(([field, value]) => value !== subject[field as keyof Draft]);

  function edit(fields: Draft) {
    setDraft(current => ({ ...current, ...fields }));
    setState("idle");
  }

  async function save() {
    setState("saving");
    setError("");
    try {
      const saved = await shelf.update(subject.id, { revision: subject.revision, ...draft, ...(frameworkChanged ? { framework: { key: framework, ...(framework === "custom" ? { custom: custom.trim() } : {}) } } : {}) });
      setDraft(current => current === draft ? {} : current);
      setFramework(current => current === framework ? saved.framework.key : current);
      setCustom(current => current === custom ? saved.framework.custom ?? "" : current);
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
      {hub2 && <label className={labelClass}>Chuẩn học
        <select value={framework} className={fieldClass} onChange={event => { setFramework(event.target.value as typeof framework); setState("idle"); }}>
          {frameworks.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
          <option value="custom">Yêu cầu riêng</option>
        </select>
        {frameworkChanged && <span className="text-sm font-normal text-muted">Các bước chưa học sẽ được soạn lại ở lượt kế tiếp.</span>}
      </label>}
      {hub2 && framework === "custom" && <label className={labelClass}>Tên chuẩn học
        <input required value={custom} maxLength={80} className={fieldClass} onChange={event => { setCustom(event.target.value); setState("idle"); }} />
      </label>}
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

/** Deleting hides the notebook from the shelf; the server keeps its history. */
export function DeleteNotebook({ subject, shelf, onDeleted }: { subject: ShelfSubject; shelf: ShelfApi; onDeleted: () => void }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await shelf.update(subject.id, { revision: subject.revision, status: "archived" });
      await shelf.load();
      onDeleted();
    } catch (cause) {
      setError((cause as Error).message);
      setBusy(false);
      setAsking(false);
    }
  }
  return (
    <section className="mt-10 border-t border-muted/30 pt-4">
      <h3 className="font-hand text-xl leading-7">Xoá sổ</h3>
      <p className="text-sm leading-6 text-muted">Sổ biến mất khỏi kệ và không soạn bài mới nữa.</p>
      {error && <p role="alert" className="mt-2 rounded-md bg-rose-soft px-3 py-2 text-sm leading-6 text-accent-hover">{error}</p>}
      {!asking && <button type="button" className={paperAction + " mt-2"} onClick={() => setAsking(true)}>Xoá sổ “{subject.title}”</button>}
      <PaperConfirm open={asking} message={`Xoá sổ “${subject.title}”? Sổ sẽ không còn trên kệ.`} confirmLabel={busy ? "Đang xoá…" : "Xoá sổ"}
        onConfirm={() => { if (!busy) void remove(); }} onCancel={() => setAsking(false)} />
    </section>
  );
}
