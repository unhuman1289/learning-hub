import type { ReactNode } from "react";
import { cx } from "./paper";

/** Oak desk top: boards with a front edge. Paper and notebooks lie on it. */
/** `lamp` (0–1) is how much the desk lamp shows: a warm pool of light on the boards after dusk. */
export function OakDesk({ children, className, drawers = false, lamp = 0 }: { children: ReactNode; className?: string; drawers?: boolean | { label: string; onOpen: () => void }[]; lamp?: number }) {
  const labelled = Array.isArray(drawers) ? drawers : [];
  return (
    <div className={cx("rounded-[6px] shadow-furniture", className)}>
      <div className="bg-oak-planks relative rounded-t-[6px] p-2.5 sm:p-5">
        {lamp > 0 && <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-t-[6px] bg-[radial-gradient(ellipse_at_50%_45%,rgb(255_213_138/0.55),transparent_70%)] transition-opacity duration-1000" style={{ opacity: lamp }} />}
        <div className="relative">{children}</div>
      </div>
      {/* Front edge of the desk top. */}
      <div className="bg-oak h-2.5 border-y border-oak-dark/70 brightness-90" />
      {drawers ? (
        <div className="bg-oak-v grid grid-cols-2 gap-2 rounded-b-[6px] px-2.5 pb-2.5 pt-2 sm:grid-cols-3 sm:px-5">
          {[0, 1, 2].map((index) => {
            const drawer = labelled[index];
            const face = cx("relative grid h-10 place-items-center rounded-[3px] bg-oak shadow-[inset_0_0_0_1px_rgb(60_40_20/0.35),inset_0_2px_5px_rgb(60_40_20/0.25)] transition-[translate,box-shadow] duration-300 ease-out hover:translate-y-1.5 hover:shadow-[inset_0_0_0_1px_rgb(60_40_20/0.35),0_6px_8px_-4px_rgb(0_0_0/0.5)]", index === 2 && "hidden sm:grid");
            // A labelled drawer opens something; its brass plate says what is inside.
            return drawer ? (
              <button key={index} type="button" onClick={drawer.onOpen} className={cx(face, "min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper")}>
                <span className="rounded-[2px] border border-oak-dark/60 bg-[#c9a24a] px-2.5 font-hand text-[15px] leading-5 text-[#3b2410] shadow-[inset_0_1px_0_rgb(255_255_255/0.4)]">{drawer.label}</span>
              </button>
            ) : (
              <div key={index} className={face}>
                <span className="size-2.5 rounded-full bg-iron shadow-[0_1px_1px_rgb(255_255_255/0.35)]" />
              </div>
            );
          })}
        </div>
      ) : <div className="bg-oak-v h-2 rounded-b-[6px]" />}
    </div>
  );
}

/** Oak picture frame hung on the wall; content sits on paper inside. */
export function WoodFrame({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <section aria-label={label} className={cx("bg-oak-v rounded-[3px] p-2 shadow-furniture", className)}>
      <div className="h-full rounded-[1px] bg-paper p-5 shadow-[inset_0_0_0_1px_rgb(60_40_20/0.25),inset_0_3px_8px_rgb(60_40_20/0.18)]">{children}</div>
    </section>
  );
}

/**
 * White-painted Landhaus bookcase with oak trim: oak crown, oak shelves, an oak counter top and
 * white bead-board doors below.
 * Each child is one compartment; its own shelf board joins the neighbours' into a continuous shelf.
 */
export function Bookcase({ title, children, className, counterDecoration }: { title: ReactNode; children: ReactNode; className?: string; counterDecoration?: ReactNode }) {
  return (
    <section aria-label="Tủ sách" className={cx("shadow-furniture", className)}>
      {/* Crown moulding */}
      <div className="bg-oak relative z-[1] -mx-2 h-4 rounded-t-[4px] border-b-4 border-oak-dark/60 shadow-[0_3px_4px_-2px_rgb(0_0_0/0.35)]" />
      <div className="bg-cabinet px-2.5 pb-3 pt-3 sm:px-3.5">
        <div className="mb-3 flex items-baseline justify-between gap-3 px-1 text-cabinet-ink">{title}</div>
        <div className="grid grid-cols-3 gap-y-4 rounded-[2px] bg-cabinet-back px-1 pt-4 shadow-[inset_0_6px_14px_rgb(60_40_20/0.22),inset_0_0_0_1px_rgb(60_40_20/0.18)] sm:grid-cols-3 lg:grid-cols-2">
          {children}
        </div>
      </div>
      {/* Oak counter top over the lower cupboard */}
      <div className="bg-oak relative z-[1] -mx-1.5 h-3.5 rounded-[2px] border-b-2 border-oak-dark shadow-[0_3px_4px_-2px_rgb(0_0_0/0.35)]">
        {counterDecoration && <div className="pointer-events-none absolute bottom-1 right-4">{counterDecoration}</div>}
      </div>
      {/* Lower cupboard with bead-board doors */}
      <div className="bg-cabinet grid grid-cols-2 gap-2 px-2.5 pb-2.5 pt-2.5 [perspective:700px] sm:px-3.5">
        {[0, 1].map((index) => (
          /* The dark inside of the cupboard shows when a door swings ajar on hover. */
          <div key={index} className="group/door rounded-[2px] bg-iron/85">
            <div className={cx(
              "bg-beadboard relative h-20 rounded-[2px] shadow-[inset_0_0_0_4px_var(--color-cabinet),inset_0_0_0_5px_rgb(60_40_20/0.22)] transition-transform duration-500 ease-[cubic-bezier(0.3,1.2,0.5,1)]",
              index === 0 ? "origin-left group-hover/door:[transform:rotateY(-24deg)]" : "origin-right group-hover/door:[transform:rotateY(24deg)]",
            )}>
              <span className={cx("absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-iron", index === 0 ? "right-3" : "left-3")} />
            </div>
          </div>
        ))}
      </div>
      {/* Plinth */}
      <div className="bg-oak h-3 rounded-b-[3px] border-t border-oak-dark/70" />
    </section>
  );
}

/** One compartment of the bookcase: whatever stands in it rests on an oak shelf board. */
export function Shelf({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col justify-end">
      <div className="px-2 sm:px-3">{children}</div>
      <div className="bg-oak mt-0 h-3 border-b-2 border-oak-dark/70 shadow-[0_4px_6px_-2px_rgb(0_0_0/0.45)]" />
    </div>
  );
}

/** Learning Hub mark: a Landhaus cottage whose chimney is a pencil (same drawing as public/favicon.svg). */
export function HouseLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={cx("shrink-0", className)}>
      <g stroke="#3d2a19" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
        <polygon points="42,14 46,3 50,14" fill="#e9cda6" />
        <polygon points="44.6,7.4 46,3 47.4,7.4" fill="#2b2b2e" stroke="none" />
        <rect x="42" y="14" width="8" height="16" fill="#d9a23c" />
        <rect x="45" y="15" width="2" height="14" fill="#efc05e" stroke="none" />
        <polygon points="4,34 32,9 60,34" fill="#7c5a3c" />
        <line x1="13" y1="30" x2="32" y2="13" stroke="#a17c52" strokeWidth="1.5" />
        <rect x="11" y="33" width="42" height="25" fill="#f2efe8" />
        <rect x="17" y="38" width="13" height="11" fill="#cfe0d6" stroke="#1f1f22" />
        <line x1="23.5" y1="38" x2="23.5" y2="49" stroke="#1f1f22" />
        <line x1="17" y1="43.5" x2="30" y2="43.5" stroke="#1f1f22" />
        <path d="M36 58 V44 a5 5 0 0 1 10 0 V58 Z" fill="#7c5a3c" />
        <circle cx="43.5" cy="51" r="0.9" fill="#1f1f22" stroke="none" />
      </g>
    </svg>
  );
}

/** Oak ceiling beam used under the top bar. */
export function Beam({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx("bg-oak h-2.5 border-b border-oak-dark shadow-[0_4px_8px_-3px_rgb(40_24_8/0.5)]", className)} />;
}
