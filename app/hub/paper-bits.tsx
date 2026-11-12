import { words } from "./words";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cx } from "../../components/notebook/paper";

/** Small things written or stamped on notebook paper, shared by the notebook, lesson and desk sheets. */

const stamps: Record<string, [string, string]> = {
  correct: [words.result.correct, "border-ok text-ok"],
  partial: [words.result.partial, "border-warn text-warn"],
  incorrect: [words.result.incorrect, "border-brick text-brick"],
};

/** The teacher's rubber stamp for a graded answer. */
export function ResultStamp({ result, className }: { result: string | null; className?: string }) {
  const [label, tone] = stamps[result ?? ""] ?? [words.result.pending, "border-muted text-muted"];
  return <span className={cx("inline-block -rotate-3 rounded-[3px] border-2 border-double px-2 font-hand text-[15px] uppercase leading-6 tracking-wider", tone, className)}>{label}</span>;
}

/** A remark in the teacher's red pen. */
export function RedPen({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("whitespace-pre-wrap break-words font-hand text-[19px] leading-7 text-brick", className)}>{children}</p>;
}

/** Pencilled aside: hints, small links, waiting notes. */
export const pencil = "font-hand text-[17px] leading-7 text-muted";
export const pencilLink = "inline-flex min-h-11 min-w-11 items-center font-hand text-[17px] leading-7 text-accent underline decoration-dotted underline-offset-4 hover:text-accent-hover disabled:opacity-50";

/** An underlined action printed on a paper tab, with room to tap on a phone. */
export const paperAction = "inline-flex min-h-11 w-fit items-center gap-2 border-b border-current px-2 font-hand text-xl leading-7 text-accent hover:bg-rose-soft hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current disabled:opacity-50";
export const postitAction = "inline-flex min-h-11 w-fit items-center border-b border-current px-2 font-hand text-xl leading-7 text-postit-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current";

export function PaperSummary({ children }: { children: ReactNode }) {
  return <summary className="group flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 border-b border-dashed border-rule pr-3 font-hand text-xl leading-7 text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current [&::-webkit-details-marker]:hidden">
    <ChevronDown size={16} aria-hidden="true" className="-rotate-90 group-open:rotate-0" />
    {children}
  </summary>;
}

/** Three dots filled in pencil as a skill settles: 0 not yet seen … 3 can do it alone. */
export function Dots({ value, label }: { value: number; label: string }) {
  return (
    <span role="img" aria-label={label} className="inline-flex shrink-0 items-center gap-1">
      {[1, 2, 3].map((n) => <span key={n} aria-hidden="true" className={cx("size-3 rounded-full border-[1.5px] border-accent", n <= value && "bg-accent")} />)}
    </span>
  );
}
export const masteryDots: Record<string, number> = { not_assessed: 0, introduced: 1, developing: 2, needs_review: 2, demonstrated: 3 };

/** Skills carry a readable name; older ones only have a key such as "modalverb-infinitiv". */
export function skillLabel(name: string) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)+$/.test(name)) return name;
  const words = name.replace(/^[gpn]-/, "").replaceAll("-", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "2026-10-16" or an ISO time → "16/10", read in Berlin. */
export function shortDay(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value.slice(8)}/${value.slice(5, 7)}`;
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" }).format(new Date(value));
}
export const clockTime = (iso: string) => new Intl.DateTimeFormat("vi-VN", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
