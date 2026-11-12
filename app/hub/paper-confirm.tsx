"use client";

import { useEffect, useId, useRef } from "react";
import { buttonClass } from "./ui";
import { words } from "./words";

export function PaperConfirm({ open, message, confirmLabel, onConfirm, onCancel }: {
  open: boolean; message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void;
}) {
  const label = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement as HTMLElement | null;
    cancel.current?.focus();
    return () => trigger?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div role="alertdialog" aria-labelledby={label} className="my-2 basis-full bg-postit-yellow px-4 py-3 text-postit-ink shadow-page"
      onKeyDown={event => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        }
      }}>
      <p id={label}>{message}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button ref={cancel} type="button" className={buttonClass("secondary")} onClick={onCancel}>{words.action.cancel}</button>
        <button type="button" className={buttonClass("secondary")} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </div>
  );
}
