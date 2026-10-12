"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { RuledPage } from "../../components/notebook/paper";

/** A sheet of notebook paper as a modal: focus moves in, Tab stays inside, Escape closes, focus returns. */
export function PaperDialog({ title, labelId, onClose, children }: { title: string; labelId: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>("input,select,textarea,button:not([aria-label='Đóng'])")?.focus();
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialog.current) return;
      const items = Array.from(dialog.current.querySelectorAll<HTMLElement>("button:not(:disabled),input,textarea,select,a[href]"));
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); previous?.focus(); };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30 flex animate-fade-in items-end justify-center bg-ink/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onClick={onClose}>
      <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby={labelId} onClick={(event) => event.stopPropagation()} className="max-h-[92dvh] w-full max-w-xl animate-sheet-in overflow-auto rounded-t-xl shadow-page sm:rounded-md">
        <RuledPage>
          <button type="button" aria-label="Đóng" onClick={onClose} className="absolute right-3 top-3 grid size-11 place-items-center rounded-full text-muted hover:bg-paper-2 hover:text-ink"><X size={20} /></button>
          <h2 id={labelId} className="relative top-2.5 font-hand text-[28px] leading-[3.5rem] text-accent">{title}</h2>
          {children}
        </RuledPage>
      </section>
    </div>
  );
}

export const fieldClass = "mt-1 block w-full rounded-none border-0 border-b-2 border-rule bg-transparent px-1 py-0.5 text-base leading-7 text-ink placeholder:text-muted focus:border-accent";
export const labelClass = "block text-sm font-semibold leading-7 text-muted";
