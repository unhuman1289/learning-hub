"use client";
import type { ItemView } from "../../../lib/lesson-v2/store";
import { pencil, pencilLink } from "../paper-bits";

type Reveal = (level: "hint1" | "hint2" | "solution") => void;
const confirmSolution = () => window.confirm("Xem lời giải sẽ được ghi nhận là đã dùng hỗ trợ. Vẫn mở lời giải?");

/** Pencilled asides beside the check button: the next hint, then the solution. */
export function HintLinks({ item, disabled, onReveal }: { item: ItemView; disabled: boolean; onReveal: Reveal }) {
  const shown = item.revealed.hints.length;
  const next = shown < item.hintCount ? (shown === 0 ? "hint1" : "hint2") : null;
  return (
    <span className="flex flex-wrap items-center gap-x-4">
      {next && <button type="button" disabled={disabled} className={pencilLink} onClick={() => onReveal(next)}>Gợi ý</button>}
      {!item.revealed.solution && (
        <button type="button" disabled={disabled} className={pencilLink} onClick={() => { if (confirmSolution()) onReveal("solution"); }}>Lời giải</button>
      )}
    </span>
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
