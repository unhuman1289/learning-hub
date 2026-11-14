"use client";

import { useEffect, useRef } from "react";
import type { ItemView } from "../../../../lib/lesson-v2/store";

import { CodeLines } from "./code-lines";

export function CodeInput({ item, value, onChange, disabled, focusLine }: {
  item: Extract<ItemView, { input: "code" }>; value: string; onChange: (value: string) => void;
  disabled: boolean; focusLine?: { line: number; key: number };
}) {
  const editor = useRef<HTMLTextAreaElement>(null);
  const ink = useRef<HTMLPreElement>(null);
  const tabLeaves = useRef(false);
  const handledLine = useRef<number>(-1);

  useEffect(() => {
    if (!focusLine || handledLine.current === focusLine.key) return;
    const frame = requestAnimationFrame(() => {
      const area = editor.current;
      if (!area) return;
      const rows = area.value.split("\n");
      const i = Math.max(0, Math.min(rows.length - 1, focusLine.line - 1));
      const offset = rows.slice(0, i).reduce((total, row) => total + row.length + 1, 0);
      area.focus({ preventScroll: true });
      area.setSelectionRange(offset, offset + rows[i].length);
      area.scrollTop = Math.max(0, (i - 1) * 24);
      if (ink.current) ink.current.scrollTop = area.scrollTop;
      handledLine.current = focusLine.key;
    });
    return () => cancelAnimationFrame(frame);
  }, [focusLine]);

  return <div>
    <p id={item.id + "-code-help"} className="font-hand text-base text-muted-paper">Tab thụt dòng. Bấm Esc rồi Tab để ra khỏi ô.</p>
    <div className="relative min-w-0 overflow-hidden border border-rule bg-paper-2 font-mono text-base leading-6 focus-within:ring-2 focus-within:ring-accent-paper/50">
      <pre ref={ink} aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre py-1 text-ink-paper">
        <CodeLines code={value} language={item.language} highlighted={focusLine?.line} />
      </pre>
      <textarea ref={editor} aria-label="Code của bạn" aria-describedby={item.id + "-code-help"} value={value} rows={item.lines} wrap="off" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
        readOnly={disabled} maxLength={8000} className="relative block w-full resize-none bg-transparent py-1 pr-1 pl-10 font-mono text-base leading-6 text-transparent caret-ink-paper outline-none selection:bg-accent-paper/25"
        onChange={event => onChange(event.target.value)}
        onScroll={event => {
          if (!ink.current) return;
          ink.current.scrollTop = event.currentTarget.scrollTop;
          ink.current.scrollLeft = event.currentTarget.scrollLeft;
        }}
        onKeyDown={event => {
          if (disabled) return;
          if (event.key === "Escape") { tabLeaves.current = true; return; }
          if (event.key !== "Tab") { tabLeaves.current = false; return; }
          if (event.shiftKey || tabLeaves.current) { tabLeaves.current = false; return; }
          event.preventDefault();
          const area = event.currentTarget;
          const { selectionStart, selectionEnd } = area;
          if (area.value.length - (selectionEnd - selectionStart) + 4 > area.maxLength) return;
          onChange(area.value.slice(0, selectionStart) + "    " + area.value.slice(selectionEnd));
          requestAnimationFrame(() => area.setSelectionRange(selectionStart + 4, selectionStart + 4));
        }} />
    </div>
  </div>;
}
