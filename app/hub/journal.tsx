"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import { MarginDate, RuledPage, cx } from "../../components/notebook/paper";
import { tracks } from "../content";
import { berlinKey, shortDate } from "./model";
import { buttonClass } from "./ui";
import type { Log, Note, Workspace, WorkspaceApi } from "./use-workspace";

// Study time is counted automatically while a notebook is open, so there is no manual "Buổi học" entry.
export const journalKinds = ["Review tuần", "Quan sát Bột", "Lỗi tiếng Đức", "Quyết định dự án"] as const;

export type FormRequest = { kind: string; track: string; note?: Note };

const placeholder: Record<string, string> = {
  "Review tuần": "Đã hiểu:\nĐã làm:\nCòn vướng / bước tiếp theo:",
  "Quyết định dự án": "Hiện trạng:\nĐã quyết định:\nCâu hỏi mở:\nBước tiếp theo:",
  "Quan sát Bột": "Ngày / bối cảnh:\nQuan sát cụ thể:\nĂn · ngủ · vận động · giao tiếp:\nĐiều muốn thử tiếp:",
  "Lỗi tiếng Đức": "Câu đã viết / nói:\nCâu đúng:\nQuy tắc cần nhớ:",
  "Tài liệu": "Câu hỏi, nội dung chính, phần đã đọc, bước tiếp theo",
};

const fieldClass = "mt-1 block w-full rounded-none border-0 border-b-2 border-rule bg-transparent px-1 py-0.5 text-base leading-7 text-ink placeholder:text-muted focus:border-accent";

/** A sheet of notebook paper for writing a review, observation, decision or source note. */
export function JournalForm({ request, workspace, onClose }: { request: FormRequest; workspace: WorkspaceApi; onClose: () => void }) {
  const isNote = request.kind === "Tài liệu";
  const [track, setTrack] = useState(request.note?.track ?? request.track);
  const [title, setTitle] = useState(request.note?.title ?? "");
  const [url, setUrl] = useState(request.note?.url ?? "");
  const [body, setBody] = useState(request.note?.body ?? "");
  const [due, setDue] = useState("");
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
    if (isNote) {
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
    } else {
      if (!body.trim()) return;
      const log: Log = { id: crypto.randomUUID(), kind: request.kind, track, date: new Date().toISOString(), body, due: due || undefined };
      void workspace.commit((current) => ({ ...current, logs: [log, ...current.logs] }));
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-30 flex animate-fade-in items-end justify-center bg-ink/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onClick={onClose}>
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="journal-form-title"
        onClick={(event) => event.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-xl animate-sheet-in overflow-auto rounded-t-xl shadow-page sm:rounded-md"
      >
        <RuledPage>
          <button type="button" aria-label="Đóng" onClick={onClose} className="absolute right-3 top-3 grid size-11 place-items-center rounded-full text-muted hover:bg-paper-2 hover:text-ink"><X size={20} /></button>
          <h2 id="journal-form-title" className="font-hand text-[28px] leading-[3.5rem] relative top-2.5 text-accent">{request.note ? "Sửa tài liệu" : isNote ? "Thêm tài liệu" : request.kind}</h2>
          <form className="grid gap-7" onSubmit={(event) => { event.preventDefault(); submit(); }}>
            <label className="block text-sm font-semibold leading-7 text-muted">Sổ
              <select value={track} onChange={(event) => setTrack(event.target.value)} className={fieldClass}>
                {tracks.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
            </label>
            {isNote && (
              <>
                <label className="block text-sm font-semibold leading-7 text-muted">Tên tài liệu
                  <input required value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} className={fieldClass} />
                </label>
                <label className="block text-sm font-semibold leading-7 text-muted">Link Google Docs hoặc nguồn gốc
                  <input type="url" value={url} maxLength={2000} placeholder="https://docs.google.com/…" onChange={(event) => setUrl(event.target.value)} className={fieldClass} />
                </label>
              </>
            )}
            <label className="block text-sm font-semibold leading-7 text-muted">{isNote ? "Ghi chú" : "Nội dung"}
              <textarea
                value={body}
                maxLength={10000}
                rows={6}
                placeholder={placeholder[request.kind] ?? "Ví dụ → thử → điều hiểu được → bước tiếp theo"}
                onChange={(event) => setBody(event.target.value)}
                className="bg-lines mt-1 block min-h-42 w-full resize-y border-0 px-1 text-base font-normal text-ink placeholder:text-muted"
              />
            </label>
            {!isNote && (
              <label className="block text-sm font-semibold leading-7 text-muted">Ngày ôn lại (không bắt buộc)
                <input type="date" value={due} onChange={(event) => setDue(event.target.value)} className={cx(fieldClass, "max-w-48")} />
              </label>
            )}
            {error && <p role="alert" className="rounded-md bg-rose-soft px-3 py-2 text-sm leading-6 text-accent-hover">{error}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={!workspace.loaded || (isNote ? !title.trim() : !body.trim())} className={buttonClass("primary")}>Lưu vào sổ</button>
              <button type="button" onClick={onClose} className={buttonClass("ghost")}>Huỷ</button>
            </div>
            <p className="text-sm leading-7 text-muted">Không ghi thông tin định danh bệnh nhân.</p>
          </form>
        </RuledPage>
      </section>
    </div>
  );
}

/** Journal entries written down a ruled page, newest first. */
export function JournalList({ logs, workspace, empty }: { logs: Log[]; workspace: Pick<Workspace, "done"> & { toggle: (id: string) => void }; empty: string }) {
  const today = berlinKey(new Date());
  const [seen] = useState(() => new Set(logs.map((log) => log.id)));
  if (!logs.length) return <p className="leading-7 text-muted">{empty}</p>;
  return (
    <ol className="grid">
      {logs.map((log) => {
        const reviewed = workspace.done.includes(log.id);
        const due = !!log.due && log.due <= today && !reviewed;
        return (
          <li key={log.id} className="relative pb-7">
            <MarginDate>{shortDate(berlinKey(log.date))}</MarginDate>
            <p className="text-xs font-semibold uppercase leading-7 tracking-[0.12em] text-muted">
              {log.kind} · {log.track}{log.minutes ? ` · ${log.minutes} phút` : ""}
            </p>
            <p className={cx("whitespace-pre-wrap break-words leading-7", !seen.has(log.id) && "animate-write")}>{log.body}</p>
            {log.due && (
              <p className="flex flex-wrap items-center gap-x-3 leading-7 text-sm text-muted">
                <RotateCcw size={14} aria-hidden="true" /> Ôn lại {shortDate(log.due)}
                {due && <span className="font-hand text-base text-accent">đến hạn</span>}
                <button type="button" onClick={() => workspace.toggle(log.id)} className="min-h-7 text-accent underline-offset-2 hover:underline">
                  {reviewed ? "Đã ôn · bỏ đánh dấu" : "Đánh dấu đã ôn"}
                </button>
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
