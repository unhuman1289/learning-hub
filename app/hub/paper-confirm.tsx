"use client";

import { useEffect, useId, useRef, type RefObject } from "react";
import { buttonClass } from "./ui";
import { words } from "./words";

export function PaperConfirm({ open, message, confirmLabel, cancelLabel = words.action.cancel, returnFocus, onConfirm, onCancel }: {
  open: boolean; message: string; confirmLabel: string; cancelLabel?: string; returnFocus?: RefObject<HTMLElement | null>; onConfirm: () => void; onCancel: () => void;
}) {
  const label = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const trigger = returnFocus?.current ?? (document.activeElement as HTMLElement | null);
    cancel.current?.focus();
    return () => trigger?.focus();
  }, [open, returnFocus]);
  if (!open) return null;
  return (
    <div role="alertdialog" aria-labelledby={label} className="my-2 max-w-sm basis-full rotate-[-1deg] bg-postit-yellow px-4 py-3 text-postit-ink shadow-page"
      onKeyDown={event => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        }
      }}>
      <p id={label} className="font-hand text-xl leading-snug">{message}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className={buttonClass("primary")} onClick={onConfirm}>{confirmLabel}</button>
        <button ref={cancel} type="button" className={buttonClass("secondary", "text-postit-ink")} onClick={onCancel}>{cancelLabel}</button>
      </div>
    </div>
  );
}
