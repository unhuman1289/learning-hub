"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ItemView } from "../../../lib/lesson-v2/store";
import { pencilLink } from "../paper-bits";

type Reveal = (level: "hint1" | "hint2" | "solution") => void;

export function HintNote({ item, disabled, onReveal, formatText = (text: string) => text }: {
  item: ItemView; disabled: boolean; onReveal: Reveal; formatText?: (text: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const note = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const panel = useId();
  const shown = item.revealed.hints.length;
  const next = shown < item.hintCount ? (shown === 0 ? "hint1" : "hint2") : null;

  useLayoutEffect(() => {
    const card = overlay.current;
    const button = trigger.current;
    if (!open || !card || !button) return;
    function position() {
      if (!card || !button) return;
      const anchor = button.getBoundingClientRect();
      const x = Math.max(8, Math.min(anchor.right - card.offsetWidth, window.innerWidth - card.offsetWidth - 8));
      const below = anchor.bottom + 4;
      const y = below + card.offsetHeight <= window.innerHeight - 8
        ? below : Math.max(8, anchor.top - card.offsetHeight - 4);
      card.style.left = x + "px";
      card.style.top = y + "px";
    }
    position();
    const observer = new ResizeObserver(position);
    observer.observe(card);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !note.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  if (!item.hintCount && item.revealed.solution) return null;
  return <div ref={note} className="relative shrink-0"
    onKeyDown={event => {
      if (event.key !== "Escape" || !open) return;
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    }}>
    <button ref={trigger} type="button" aria-label="Gợi ý" aria-expanded={open} aria-controls={open ? panel : undefined}
      className={`question-hint grid size-11 place-items-center font-hand text-lg text-postit-ink ${item.revealed.solutionSeen ? "bg-ok-soft" : shown ? "bg-stone" : "bg-postit-yellow"}`}
      onClick={() => setOpen(!open)}>?</button>
    {open && <div ref={overlay} id={panel} role="region" aria-label="Gợi ý cho câu này"
      className="fixed z-20 max-h-[55dvh] w-[min(20rem,calc(100vw-5rem))] overflow-auto bg-postit-yellow p-3 text-base text-postit-ink shadow-page">
      <div aria-live="polite">
        {item.revealed.hints.map((hint, i) => <p key={i}>Gợi ý {i + 1} · {formatText(hint)}</p>)}
      </div>
      {next && <button type="button" disabled={disabled} className={pencilLink} onClick={() => onReveal(next)}>
        {shown ? "Gợi ý tiếp" : "Gợi ý 1"}
      </button>}
      {!item.revealed.solutionSeen &&
        <button type="button" disabled={disabled} className={pencilLink} onClick={() => {
          setOpen(false);
          trigger.current?.focus();
          onReveal("solution");
        }}>Xem lời giải</button>}
      {item.revealed.solutionSeen && <p>Đã xem lời giải.</p>}
    </div>}
  </div>;
}

export function RevealedSolution({ item, formatText = (text: string) => text }: { item: ItemView; formatText?: (text: string) => string }) {
  if (!item.revealed.solution) return null;
  return <p className="whitespace-pre-wrap font-hand text-[19px] leading-7 text-ok">
    <span className="block text-base">{item.revealed.solutionSeen ? "Đã xem lời giải" : "Lời giải"}</span>
    {formatText(item.revealed.solution)}
    {item.revealed.explanation && <span className="block">{formatText(item.revealed.explanation)}</span>}
  </p>;
}
