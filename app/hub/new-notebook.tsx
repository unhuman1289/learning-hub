"use client";

import { useState } from "react";
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
  const [kind, setKind] = useState<"topic" | "prepared">("topic");
  const [legacyTrack, setLegacyTrack] = useState<string>(prepared[0] ?? "");
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState<"skill" | "reading">("skill");
  const [goal, setGoal] = useState("");
  const [level, setLevel] = useState("");
  const [curriculum, setCurriculum] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    const input: NewSubject = kind === "prepared"
      ? { legacyTrack, goal, level }
      : { title, template, goal, level, curriculum };
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
      <form className="grid gap-7" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        {prepared.length > 0 && (
          <fieldset className="grid gap-1">
            <legend className={labelClass}>Loại sổ</legend>
            <label className="flex items-center gap-2 leading-7"><input type="radio" name="kind" checked={kind === "topic"} onChange={() => setKind("topic")} /> Chủ đề mới</label>
            <label className="flex items-center gap-2 leading-7"><input type="radio" name="kind" checked={kind === "prepared"} onChange={() => setKind("prepared")} /> Sổ có sẵn bài nền</label>
          </fieldset>
        )}
        {kind === "prepared" ? (
          <label className={labelClass}>Sổ có sẵn
            <select value={legacyTrack} onChange={(event) => setLegacyTrack(event.target.value)} className={fieldClass}>
              {prepared.map((track) => <option key={track} value={track}>{coverTitle[track]} · {trackInfo(track).title}</option>)}
            </select>
          </label>
        ) : (
          <>
            <label className={labelClass}>Tên sổ
              <input required value={title} maxLength={80} placeholder="Ví dụ: Toán 7" onChange={(event) => setTitle(event.target.value)} className={fieldClass} />
            </label>
            <label className={labelClass}>Cách học
              <select value={template} onChange={(event) => setTemplate(event.target.value as "skill" | "reading")} className={fieldClass}>
                <option value="skill">Luyện kỹ năng (nhớ lại, phiếu, luyện, tự làm)</option>
                <option value="reading">Đọc và phân tích (nguồn, câu hỏi, sản phẩm)</option>
              </select>
            </label>
            <label className={labelClass}>Chương trình
              <input value={curriculum} maxLength={500} placeholder="Ví dụ: Chương trình GDPT 2018 (Việt Nam), lớp 7" onChange={(event) => setCurriculum(event.target.value)} className={fieldClass} />
            </label>
          </>
        )}
        <label className={labelClass}>Mục tiêu
          <textarea value={goal} maxLength={2000} rows={3} placeholder="Học để làm được gì?" onChange={(event) => setGoal(event.target.value)} className={fieldClass} />
        </label>
        <label className={labelClass}>Trình độ hiện tại
          <input value={level} maxLength={200} placeholder="Ví dụ: A2, đã học tới chương 3" onChange={(event) => setLevel(event.target.value)} className={fieldClass} />
        </label>
        {error && <p role="alert" className="rounded-md bg-rose-soft px-3 py-2 text-sm leading-6 text-accent-hover">{error}</p>}
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onClose} className={buttonClass("ghost")}>Huỷ</button>
          <button type="submit" disabled={busy || (kind === "topic" ? !title.trim() : !legacyTrack)} className={buttonClass("primary")}>{busy ? "Đang mở…" : "Mở sổ"}</button>
        </div>
      </form>
    </PaperDialog>
  );
}
