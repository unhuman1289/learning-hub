"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { flushSync } from "react-dom";
import { pageBlocks, type PageBlock } from "./page-blocks";

export type SpreadBlock = PageBlock & { node: ReactNode; label?: string };

export function Spread({ blocks, startAt, storageKey, jump, preferStart = false }: {
  blocks: SpreadBlock[]; startAt?: string; preferStart?: boolean; storageKey: string; jump?: { id: string; key: number } | null;
}) {
  const [double, setDouble] = useState(false);
  const [selection, setSelection] = useState(startAt);
  const preferInitialBlock = useRef(preferStart || startAt === "summary");
  const [fallback, setFallback] = useState(false);
  const [measurement, setMeasurement] = useState<{ heights: Record<string, number>; limit: number }>();
  const book = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const shouldFocus = useRef(false);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const pages = pageBlocks(blocks, 3, measurement);
  const structure = pages.map(page => page.map(block => block.id).join(",")).join("|");
  const index = Math.max(0, pages.findIndex(page => page.some(block => block.id === (selection ?? startAt))));
  const step = double ? 2 : 1;
  const first = Math.floor(index / step) * step;
  const count = pages.length;
  const last = Math.min(first + step, count);
  const editable = (target: EventTarget | null) =>
    target instanceof Element && !!target.closest("input,textarea,select,[contenteditable=true]");

  useEffect(() => {
    const area = book.current;
    if (!area || typeof ResizeObserver === "undefined") return;
    let animation = 0;
    const measure = () => {
      cancelAnimationFrame(animation);
      animation = requestAnimationFrame(() => {
        // Regrouping changes a block’s React parent. Wait until the learner leaves
        // the controls to keep keyboard focus, text selection and open dialogs intact.
        const active = document.activeElement;
        if (active?.closest("[data-block]") && area.contains(active)) return;
        const line = getComputedStyle(area).getPropertyValue("--paper-line-height").trim() === "2rem" ? 32 : 28;
        const limit = Math.max(line * 10, Math.floor((innerHeight - 220) / line) * line);
        const heights = Object.fromEntries(Array.from(area.querySelectorAll<HTMLElement>("[data-block]"),
          node => [node.dataset.block!, Math.ceil(node.getBoundingClientRect().height)]));
        if (!Object.values(heights).some(Boolean)) return;
        setMeasurement(current => {
          if (current?.limit === limit && JSON.stringify(current.heights) === JSON.stringify(heights)) return current;
          return { heights, limit };
        });
      });
    };
    const observer = new ResizeObserver(measure);
    area.addEventListener("focusout", measure);
    window.addEventListener("resize", measure);
    observer.observe(area);
    area.querySelectorAll("[data-block]").forEach(block => observer.observe(block));
    return () => {
      observer.disconnect();
      area.removeEventListener("focusout", measure);
      window.removeEventListener("resize", measure);
      cancelAnimationFrame(animation);
    };
  }, [structure, double]);

  useEffect(() => {
    const query = matchMedia("(min-width: 1024px)");
    const sync = () => setDouble(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    function restore() {
      const hash = window.location.hash.match(/^#cau-(\d+)$/)?.[1];
      if (hash) { setSelection("cau-" + hash); return; }
      if (preferInitialBlock.current) return;
      try { setSelection(sessionStorage.getItem(storageKey) ?? undefined); } catch { /* Storage is optional. */ }
    }
    restore();
    window.addEventListener("hashchange", restore);
    return () => window.removeEventListener("hashchange", restore);
  }, [storageKey]);

  useEffect(() => {
    if (!jump) return;
    const frame = requestAnimationFrame(() => {
      shouldFocus.current = true;
      setSelection(jump.id);
      try { sessionStorage.setItem(storageKey, jump.id); } catch { /* Storage is optional. */ }
    });
    return () => cancelAnimationFrame(frame);
  }, [jump, storageKey]);

  useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    const active = frame.current?.querySelector(`.spread-page:not([inert]) [data-block="${CSS.escape(selection ?? "")}"]`)?.closest(".spread-page")
      ?? frame.current?.querySelector(".spread-page:not([inert])");
    (active?.querySelector<HTMLElement>(":is(h1,h2,h3)[tabindex]") ??
      active?.querySelector<HTMLElement>("[data-page-focus]"))?.focus();
  }, [first, selection]);

  function turn(page: number) {
    const block = pages[page]?.[0];
    if (!block || page === first) return;
    shouldFocus.current = true;
    try { sessionStorage.setItem(storageKey, block.id); } catch { /* Storage is optional. */ }
    const update = () => setSelection(block.id);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { update(); return; }
    if (document.startViewTransition && double) {
      document.documentElement.setAttribute("data-vt", "turn");
      void document.startViewTransition(() => flushSync(update)).finished
        .catch(() => {}).finally(() => { document.documentElement.removeAttribute("data-vt"); });
    } else {
      setFallback(true);
      update();
    }
  }

  const visibleLabels = pages.slice(first, last).flatMap(page => page).filter(block => block.kind === "item");
  const firstQuestion = visibleLabels[0]?.id.slice(4);
  const lastQuestion = visibleLabels.at(-1)?.id.slice(4);
  const caption = first + 1 === last ? `Trang ${last} trên ${count}` : `Trang ${first + 1}–${last} trên ${count}`;
  return (
    <div ref={frame} className="lesson-spread" data-double={double}
      onKeyDown={event => {
        if (editable(event.target) || event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
        const destination = ({
          ArrowLeft: first - step, PageUp: first - step, ArrowRight: first + step,
          PageDown: first + step, Home: 0, End: Math.floor((count - 1) / step) * step,
        } as Record<string, number>)[event.key];
        if (destination === undefined || destination < 0 || destination >= count) return;
        event.preventDefault();
        turn(destination);
      }}
      onPointerDown={event => {
        pointer.current = event.pointerType === "touch" && !editable(event.target)
          ? { x: event.clientX, y: event.clientY } : null;
      }}
      onPointerUp={event => {
        const start = pointer.current;
        pointer.current = null;
        if (!start) return;
        const x = event.clientX - start.x;
        const y = event.clientY - start.y;
        if (Math.abs(x) >= 40 && Math.abs(x) > Math.abs(y) * 1.35) turn(first + (x < 0 ? step : -step));
      }}
      onPointerCancel={() => { pointer.current = null; }}>
      <button type="button" className="spread-edge" aria-label="Trang trước" disabled={first === 0} onClick={() => turn(first - step)}><ChevronLeft aria-hidden="true" /></button>
      <div ref={book} className={fallback ? "spread-pages animate-spread-turn" : "spread-pages"} onAnimationEnd={() => setFallback(false)}>
        {pages.map((page, n) => {
          const visible = n >= first && n < last;
          return <section key={page[0].id} data-offpage={!visible} inert={!visible} aria-hidden={!visible || undefined} aria-roledescription="trang"
            aria-label={`Trang ${n + 1}`} className="spread-page bg-ruled">
            <p tabIndex={-1} data-page-focus className="font-hand text-sm text-muted">{page[0].label}</p>
            {page.map(block => <div key={block.id} data-block={block.id} className="spread-block">{block.node}</div>)}
            <p aria-hidden="true" className="mt-4 text-center font-hand text-sm text-muted">{n + 1} / {count}</p>
          </section>;
        })}
      </div>
      <button type="button" className="spread-edge" aria-label="Trang sau" disabled={last >= count} onClick={() => turn(first + step)}><ChevronRight aria-hidden="true" /></button>
      <p role="status" className="sr-only">{caption}{firstQuestion && (firstQuestion === lastQuestion ? `, câu ${firstQuestion}` : `, câu ${firstQuestion} đến ${lastQuestion}`)}</p>
    </div>
  );
}
