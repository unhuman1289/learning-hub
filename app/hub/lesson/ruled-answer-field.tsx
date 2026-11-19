import { GripHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

const lineBreak = /\r\n?|\n/g;

export function RuledAnswerField({ id, field, active, short, germanInput, disabled, value, onChange }: {
  id: string;
  field: RefObject<HTMLTextAreaElement | null>;
  active: boolean;
  short: boolean;
  germanInput: boolean;
  disabled: boolean;
  value: string;
  onChange: (answer: string) => void;
}) {
  const paper = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; rows: number; lineHeight: number; moved: boolean } | null>(null);
  const [manualRows, setManualRows] = useState<number | null>(null);
  const minRows = short ? 1 : 5;
  const answer = short ? value.replace(lineBreak, " ") : value;

  useEffect(() => {
    const element = paper.current;
    const viewport = window.visualViewport;
    if (!active || !element || !viewport) return;
    // iOS moves the visual viewport when the keyboard opens without shrinking dvh.
    const limitHeight = () => element.style.setProperty("--answer-viewport-height", `${viewport.height}px`);
    limitHeight();
    viewport.addEventListener("resize", limitHeight);
    return () => {
      viewport.removeEventListener("resize", limitHeight);
      element.style.removeProperty("--answer-viewport-height");
    };
  }, [active]);

  function readSize() {
    const input = field.current;
    if (!input) return null;
    const lineHeight = parseFloat(getComputedStyle(input).lineHeight);
    return { lineHeight, rows: Math.round(input.offsetHeight / lineHeight) };
  }

  return <div className="flex min-w-0 items-end">
    <div ref={paper} className="ruled-answer-paper" style={{
      "--answer-min-rows": minRows,
      "--answer-manual-rows": manualRows ?? undefined,
    } as CSSProperties}>
      {/* The mirror gives the textarea its wrapped height in browsers without field-sizing. */}
      <div aria-hidden="true" className="ruled-answer-text ruled-answer-mirror">
        {answer}{(!answer || answer.endsWith("\n")) && "\u200b"}
      </div>
      <textarea
        id={id}
        ref={field}
        rows={minRows}
        autoComplete="off"
        lang={germanInput ? "de" : undefined}
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        value={answer}
        disabled={disabled}
        wrap="soft"
        onKeyDown={event => {
          if (short && event.key === "Enter" && !event.nativeEvent.isComposing) event.preventDefault();
        }}
        onChange={event => {
          const input = event.currentTarget;
          const next = short ? input.value.replace(lineBreak, " ") : input.value;
          if (input.value !== next) {
            const caret = input.value.slice(0, input.selectionStart).replace(lineBreak, " ").length;
            input.value = next;
            input.setSelectionRange(caret, caret);
          }
          onChange(next);
        }}
        maxLength={8000}
        placeholder={short ? "Viết câu trả lời…" : "Viết bài làm ở đây…"}
        className="ruled-answer-text ruled-answer-input bg-lines placeholder:text-muted-paper"
      />
    </div>
    {!disabled && <button type="button" className="ruled-answer-grip"
      aria-label="Đổi chiều cao ô trả lời"
      title="Kéo hoặc dùng phím ↑ ↓ để đổi chiều cao. Bấm để tự giãn."
      aria-controls={id}
      onPointerDown={event => {
        if (event.button !== 0) return;
        const size = readSize();
        if (!size) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { y: event.clientY, ...size, moved: false };
      }}
      onPointerMove={event => {
        if (!drag.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const { y, rows, lineHeight } = drag.current;
        const change = Math.round((event.clientY - y) / lineHeight);
        if (!change && !drag.current.moved) return;
        drag.current.moved = true;
        setManualRows(Math.max(1, rows + change));
      }}
      onPointerCancel={() => { drag.current = null; }}
      onClick={event => {
        if (event.detail === 0 || !drag.current?.moved) setManualRows(null);
        drag.current = null;
      }}
      onKeyDown={event => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        const size = readSize();
        if (!size) return;
        event.preventDefault();
        setManualRows(Math.max(1, size.rows + (event.key === "ArrowDown" ? 1 : -1)));
      }}>
      <GripHorizontal aria-hidden="true" size={20} />
    </button>}
  </div>;
}
