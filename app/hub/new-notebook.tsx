"use client";

import { useRef, useState } from "react";
import { learningTracks } from "../../lib/daily-policy";
import { coverTitle, trackInfo } from "./model";
import { PaperDialog, fieldClass, labelClass } from "./paper-dialog";
import { buttonClass } from "./ui";
import type { NewSubject, ShelfApi, ShelfSubject } from "./use-shelf";

/**
 * Opens a notebook: either one of the five prepared notebooks (with their foundation lessons)
 * or a new topic. A new topic waits in "đang lập lộ trình" until its skill map exists.
 */
export function NewNotebookDialog({ shelf, forName, onClose, onCreated }: {
  shelf: ShelfApi; forName: string | null; onClose: () => void; onCreated: (subject: ShelfSubject) => void;
}) {
  const onShelf = new Set((shelf.subjects ?? []).map((item) => item.legacyTrack).filter(Boolean));
  const prepared = learningTracks.filter((track) => !onShelf.has(track));
  const [usePrepared, setUsePrepared] = useState(false);
  const titleField = useRef<HTMLInputElement>(null);
  const preparedField = useRef<HTMLSelectElement>(null);
  const [legacyTrack, setLegacyTrack] = useState<string>(prepared[0] ?? "");
  const selectedTrack = prepared.find(track => track === legacyTrack) ?? prepared[0];
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function switchNotebookType() {
    const next = !usePrepared;
    setUsePrepared(next);
    requestAnimationFrame(() => (next ? preparedField : titleField).current?.focus());
  }

  const canSubmit = usePrepared ? !!selectedTrack : !!title.trim() && !!goal.trim();

  async function submit() {
    if (busy || !canSubmit) return;
    setBusy(true);
    setError("");
    const input: NewSubject = usePrepared
      ? { legacyTrack: selectedTrack }
      : { title: title.trim(), goal: goal.trim() };
    try {
      const created = await shelf.create(input);
      onCreated(created);
    } catch (cause) {
      setError((cause as Error).message);
      setBusy(false);
    }
  }

  return (
    <PaperDialog title={forName ? `Sổ mới cho ${forName}` : "Mở sổ mới"} labelId="new-notebook-title" onClose={onClose}>
      <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        {usePrepared ? (
          <label className={labelClass}>Sổ có sẵn
            <select ref={preparedField} value={selectedTrack ?? ""} onChange={(event) => setLegacyTrack(event.target.value)} className={fieldClass}>
              {prepared.map((track) => <option key={track} value={track}>{coverTitle[track]} · {trackInfo(track).title}</option>)}
            </select>
          </label>
        ) : (
          <label className={labelClass}>Tên sổ
            <input ref={titleField} required value={title} maxLength={80} placeholder="Ví dụ: Toán 7" onChange={(event) => setTitle(event.target.value)} className={fieldClass} />
          </label>
        )}
        {!usePrepared && (
          <div>
            <label className={labelClass}>Bạn muốn học gì?
              <textarea required value={goal} maxLength={2000} rows={3}
                aria-describedby="new-notebook-hint"
                placeholder="Ví dụ: Ôn phân số lớp 7 bằng bài tập ngắn, theo sách Kết nối tri thức."
                onChange={(event) => setGoal(event.target.value)} className={fieldClass} />
            </label>
            <p id="new-notebook-hint" className="mt-1 text-sm leading-6 text-muted">Bạn có thể ghi mục tiêu, cách muốn học, trình độ hoặc tên sách. Bài đầu tiên sẽ được chuẩn bị theo lời dặn của bạn.</p>
          </div>
        )}
        {error && <p role="alert" className="rounded-md bg-rose-soft px-3 py-2 text-sm leading-6 text-accent-hover">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          {prepared.length > 0 && (
            <button type="button" disabled={busy} onClick={switchNotebookType} className="min-h-11 text-left text-sm font-medium text-accent-hover hover:underline">
              {usePrepared ? "Tạo sổ theo chủ đề mới" : "Dùng sổ có sẵn"}
            </button>
          )}
          <div className="ml-auto flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} className={buttonClass("ghost")}>Huỷ</button>
            <button type="submit" disabled={busy || !canSubmit} className={buttonClass("primary")}>{busy ? "Đang mở…" : "Mở sổ"}</button>
          </div>
        </div>
      </form>
    </PaperDialog>
  );
}
