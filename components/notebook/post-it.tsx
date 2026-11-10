import type { CSSProperties, ReactNode } from "react";
import { cx } from "./paper";

const tilts = [-1.6, 1.2, -0.8, 1.8, -1.2, 0.9, -1.9];

/** A post-it pressed onto the desk, slightly tilted; it straightens and lifts on hover. */
export function PostIt({ color, index, taped = false, children }: { color: string; index: number; taped?: boolean; children: ReactNode }) {
  return (
    <li
      style={{ "--tilt": `${tilts[index % tilts.length]}deg`, animationDelay: `${150 + index * 110}ms` } as CSSProperties}
      className={cx("postit flex min-h-44 flex-col rounded-[1px] p-4 animate-stick [rotate:var(--tilt)] hover:-translate-y-1 hover:[rotate:0deg] focus-within:[rotate:0deg]", color, taped && "pt-6")}
    >
      {/* Review notes are held down by a strip of paper tape. */}
      {taped && <span aria-hidden="true" className="absolute -top-3 left-1/2 h-6 w-24 -translate-x-1/2 -rotate-3 bg-paper/70 shadow-[0_1px_2px_rgb(0_0_0/0.18)] [clip-path:polygon(3%_0,97%_4%,100%_50%,96%_100%,2%_96%,0_50%)]" />}
      {children}
    </li>
  );
}
