"use client";
import { useState } from "react";
import { PaperConfirm } from "../paper-confirm";
import type { ItemView } from "../../../lib/lesson-v2/store";
import { pencil, pencilLink } from "../paper-bits";

type Reveal = (level: "hint1" | "hint2" | "solution") => void;

/** Pencilled asides beside the check button: the next hint, then the solution. */
export function HintLinks({ item, disabled, onReveal }: { item: ItemView; disabled: boolean; onReveal: Reveal }) {
  const [confirm, setConfirm] = useState(false);
  const shown = item.revealed.hints.length;
  const next = shown < item.hintCount ? (shown === 0 ? "hint1" : "hint2") : null;
  return (
    <div className="flex flex-wrap items-center gap-x-4">
      {next && <button type="button" disabled={disabled} className={pencilLink} onClick={() => onReveal(next)}>{shown === 0 ? "Gợi ý" : "Gợi ý tiếp"}</button>}
      {!item.revealed.solution && (
        <button type="button" disabled={disabled} className={pencilLink} onClick={() => setConfirm(true)}>Lời giải</button>
      )}
      <PaperConfirm open={confirm && !disabled} message="Mở lời giải thì câu này tính là có trợ giúp. Vẫn mở?"
        confirmLabel="Mở lời giải" onCancel={() => setConfirm(false)}
        onConfirm={() => { setConfirm(false); onReveal("solution"); }} />
    </div>
  );
}

export function Revealed({ item, formatText = (text: string) => text }: { item: ItemView; formatText?: (text: string) => string }) {
  return (
    <>
      {item.revealed.hints.map((hint, i) => <p key={i} className={pencil}>Gợi ý {i + 1}: {formatText(hint)}</p>)}
      {item.revealed.solution && (
        <p className="whitespace-pre-wrap font-hand text-[19px] leading-7">
          Lời giải: {formatText(item.revealed.solution)}
          {item.revealed.explanation && <span className="block text-muted">{formatText(item.revealed.explanation)}</span>}
        </p>
      )}
    </>
  );
}
