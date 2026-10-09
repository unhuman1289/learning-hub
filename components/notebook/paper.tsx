import type { ReactNode } from "react";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

/** Marble composition-notebook cover with a cloth spine and a white name label. */
export function NotebookCover({ title, lines = [], className }: { title: string; lines?: string[]; className?: string }) {
  return (
    <div className={cx("@container relative aspect-[3/4] overflow-hidden rounded-[3px_8px_8px_3px] bg-marble shadow-cover", className)}>
      <div className="absolute inset-y-0 left-0 w-[14%] border-r border-black/40 bg-spine" />
      <div className="absolute left-[24%] right-[8%] top-[15%] rounded-[10cqw] border-[1.5cqw] border-label bg-label px-[8%] pb-[8%] pt-[7%] text-label-ink shadow-[inset_0_0_0_0.8cqw_var(--color-label-ink)]">
        <p className="text-center font-hand text-[11cqw] leading-tight">{title}</p>
        {lines.map((line, index) => (
          <p key={index} className="mt-[1cqw] truncate border-b-[0.6cqw] border-label-ink pl-[2cqw] font-hand text-[7.5cqw] leading-[1.5]">{line || " "}</p>
        ))}
      </div>
    </div>
  );
}

/** Small notebook used in lists and the logo. */
export function MiniCover({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cx("relative block aspect-[3/4] w-7 shrink-0 overflow-hidden rounded-[1px_3px_3px_1px] bg-marble [background-size:90px_90px] shadow-[1px_1px_0_rgb(0_0_0/0.25)]", className)}>
      <span className="absolute inset-y-0 left-0 w-[16%] bg-spine" />
      <span className="absolute left-[30%] right-[12%] top-[22%] h-[26%] rounded-[2px] bg-label" />
    </span>
  );
}

/**
 * Ruled paper. Text inside keeps a 28px (leading-7) rhythm; the pink margin sits at
 * 2.25rem (phone) / 3.25rem, so content starts at pl-11 / pl-16 by default.
 */
export function RuledPage({ children, className, as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "article" | "section" | "aside" }) {
  return <Tag className={cx("bg-ruled relative min-w-0 py-7 pl-11 pr-4 [--margin-x:2.25rem] sm:pl-16 sm:pr-8 sm:[--margin-x:3.25rem]", className)}>{children}</Tag>;
}

/** Date written by hand in the page margin, beside the line it belongs to. Parent must be `relative`. */
export function MarginDate({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("absolute right-full top-0 mr-3 w-10 text-right font-hand text-[13px] leading-7 text-accent sm:mr-4 sm:text-[15px]", className)}>{children}</span>;
}

export function StickyNote({ children, className, tone = "rose" }: { children: ReactNode; className?: string; tone?: "rose" | "paper" }) {
  return (
    <div className={cx(
      "my-7 max-w-xl -rotate-[0.6deg] rounded-[2px] px-4 py-3 text-[15px] leading-6 shadow-[0_8px_14px_-10px_rgb(0_0_0/0.45)]",
      tone === "rose" ? "bg-rose-soft" : "border border-line bg-paper-2",
      className,
    )}>{children}</div>
  );
}

export function Stamp({ date, className, pressed = false }: { date?: string; className?: string; pressed?: boolean }) {
  return (
    <div aria-label={date ? `Đã học, ${date}` : "Đã học"} className={cx(pressed && "animate-stamp", "pointer-events-none grid size-20 -rotate-12 place-items-center rounded-full border-[3px] border-double border-ok text-center text-[11px] font-bold leading-tight tracking-[0.12em] text-ok opacity-90 sm:size-24 sm:text-[13px]", className)}>
      <span>ĐÃ<br />HỌC{date && <><br /><span className="text-[10px] font-semibold tracking-normal">{date}</span></>}</span>
    </div>
  );
}

const statusTone = {
  doing: "bg-rose-soft text-accent-hover",
  done: "bg-ok-soft text-ok",
  idle: "border border-line bg-paper-2 text-muted",
  warn: "bg-warn-soft text-warn",
} as const;

export function StatusChip({ tone, children }: { tone: keyof typeof statusTone; children: ReactNode }) {
  return <span className={cx("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold leading-5", statusTone[tone])}>{children}</span>;
}

/** Wooden-ruler style progress for minutes studied today. */
export function Ruler({ value, max }: { value: number; max: number }) {
  const percent = Math.min(100, (value / max) * 100);
  const marks = [0, 60, 120, 180, 240].filter((mark) => mark <= max);
  return (
    <div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(value, max)}
        aria-label={`Đã học ${value} trên ${max} phút`}
        className="relative h-9 overflow-hidden rounded-[3px] border border-line bg-paper-2 [background-image:repeating-linear-gradient(to_right,var(--color-muted)_0_1px,transparent_1px_calc(100%/8)),repeating-linear-gradient(to_right,var(--color-line)_0_1px,transparent_1px_calc(100%/48))] [background-position:0_100%,0_100%] [background-repeat:no-repeat] [background-size:100%_12px,100%_7px]"
      >
        <div className="absolute inset-y-0 left-0 origin-left animate-ruler border-r-2 border-accent bg-rose-soft/80" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-muted">{marks.map((mark) => <span key={mark}>{mark}</span>)}</div>
    </div>
  );
}

export { cx };
