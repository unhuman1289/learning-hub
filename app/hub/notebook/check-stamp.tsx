"use client";

import { useEffect, useRef, useState } from "react";

export function CheckStamp({ label, disabled, canSubmit, hasAnswer, onSubmit }: {
  label: string; disabled: boolean; canSubmit: boolean; hasAnswer: boolean; onSubmit?: () => void;
}) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return <div className="relative flex justify-end">
    <button type="button" disabled={disabled} className="relative min-h-11 min-w-28 px-4 font-hand text-lg text-accent transition-transform hover:text-accent-hover active:scale-95 disabled:opacity-50"
      onClick={() => {
        clearTimeout(timer.current);
        if (canSubmit) { setMessage(""); onSubmit?.(); return; }
        setMessage(hasAnswer ? "Sửa câu trả lời để kiểm tra lại." : "Viết câu trả lời trước nhé.");
        timer.current = setTimeout(() => setMessage(""), 3000);
      }}>
      <svg viewBox="0 0 120 46" preserveAspectRatio="none" aria-hidden="true" className="pointer-events-none absolute inset-0 size-full fill-none stroke-current">
        <path strokeWidth="1.6" strokeLinecap="round" d="M11 10C23 1 96 1 110 12c11 9 4 23-9 26-23 6-75 7-91-2C1 30 1 16 11 10Z" />
      </svg>
      {label}
    </button>
    {message && <p role="status" className="absolute right-0 top-full z-10 w-max max-w-full bg-postit-yellow px-3 py-2 text-sm text-postit-ink shadow-page">{message}</p>}
  </div>;
}
