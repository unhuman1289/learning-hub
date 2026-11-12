"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { RuledPage } from "../../components/notebook/paper";
import { tracks } from "../content";
import { buttonClass } from "./ui";
import type { Note, WorkspaceApi } from "./use-workspace";

export type FormRequest = { track: string; note?: Note };

const fieldClass = "mt-1 block w-full rounded-none border-0 border-b-2 border-rule bg-transparent px-1 py-0.5 text-base leading-7 text-ink placeholder:text-muted focus:border-accent";

/** Edit a source in the notebook’s Tài liệu tab. */
export function DocumentForm({ request, workspace, onClose }: { request: FormRequest; workspace: WorkspaceApi; onClose: () => void }) {
  const [track, setTrack] = useState(request.note?.track ?? request.track);
  const [title, setTitle] = useState(request.note?.title ?? "");
  const [url, setUrl] = useState(request.note?.url ?? "");
  const [body, setBody] = useState(request.note?.body ?? "");
  const [error, setError] = useState("");
  const dialog = useRef<HTMLElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>("select,input,textarea")?.focus();
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialog.current) return;
      const items = Array.from(dialog.current.querySelectorAll<HTMLElement>("button:not(:disabled),input,textarea,select,a[href]"));
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [onClose]);

  function submit() {
    if (!title.trim()) return;
    if (url) {
      try {
        const parsed = new URL(url);
        if (!["https:", "http:"].includes(parsed.protocol)) throw Error();
      } catch {
        setError("Đường dẫn cần bắt đầu bằng https:// hoặc http://");
        return;
      }
    }
    const note: Note = { id: request.note?.id ?? crypto.randomUUID(), title: title.trim(), url, track, body };
    void workspace.commit((current) => ({
      ...current,
      notes: request.note ? current.notes.map((item) => item.id === note.id ? note : item) : [note, ...current.notes],
    }));
    onClose();
  }

  return (
    <div className="fixed inset-0 z-30 flex animate-fade-in items-end justify-center bg-ink/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onClick={onClose}>
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-form-title"
        onClick={(event) => event.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-xl animate-sheet-in overflow-auto rounded-t-xl shadow-page sm:rounded-md"
      >
        <RuledPage>
          <button type="button" aria-label="Đóng" onClick={onClose} className="absolute right-3 top-3 grid size-11 place-items-center rounded-full text-muted hover:bg-paper-2 hover:text-ink"><X size={20} /></button>
          <h2 id="document-form-title" className="font-hand text-[28px] leading-[3.5rem] relative top-2.5 text-accent">{request.note ? "Sửa tài liệu" : "Thêm tài liệu"}</h2>
          <form className="grid gap-7" onSubmit={(event) => { event.preventDefault(); submit(); }}>
            <label className="block text-sm font-semibold leading-7 text-muted">Sổ
              <select value={track} onChange={(event) => setTrack(event.target.value)} className={fieldClass}>
                {tracks.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold leading-7 text-muted">Tên tài liệu
              <input required value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} className={fieldClass} />
            </label>
            <label className="block text-sm font-semibold leading-7 text-muted">Link Google Docs hoặc nguồn gốc
              <input type="url" value={url} maxLength={2000} placeholder="https://docs.google.com/…" onChange={(event) => setUrl(event.target.value)} className={fieldClass} />
            </label>
            <label className="block text-sm font-semibold leading-7 text-muted">Mô tả
              <textarea
                value={body}
                maxLength={10000}
                rows={6}
                placeholder="Nội dung chính và phần đã đọc"
                onChange={(event) => setBody(event.target.value)}
                className="bg-lines mt-1 block min-h-42 w-full resize-y border-0 px-1 text-base font-normal text-ink placeholder:text-muted"
              />
            </label>
            {error && <p role="alert" className="rounded-md bg-rose-soft px-3 py-2 text-sm leading-6 text-accent-hover">{error}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={!workspace.loaded || !title.trim()} className={buttonClass("primary")}>Lưu vào sổ</button>
              <button type="button" onClick={onClose} className={buttonClass("ghost")}>Huỷ</button>
            </div>
            <p className="text-sm leading-7 text-muted">Đừng ghi tên, địa chỉ hay giấy tờ của bệnh nhân.</p>
          </form>
        </RuledPage>
      </section>
    </div>
  );
}
