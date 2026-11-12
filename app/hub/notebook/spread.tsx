"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { flushSync } from "react-dom";
import { pageBlocks, pageGeometry, type PageBlock } from "./page-blocks";

export type SpreadBlock = PageBlock & { node: ReactNode; label?: string };

export function Spread({ blocks, startAt, jump, child = false }: {
  blocks: SpreadBlock[]; startAt: string; child?: boolean; jump?: { id: string; key: number } | null;
}) {
  const [viewport, setViewport] = useState({ width: 768, height: 900 });
  const [selection, setSelection] = useState(startAt);
  const [returnTo, setReturnTo] = useState<string>();
  const [fallback, setFallback] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const shouldFocus = useRef(false);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const geometry = pageGeometry(viewport.width, viewport.height, child);
  const { double } = geometry;
  const pages = pageBlocks(blocks, geometry);
  const index = Math.max(0, pages.findIndex(page => page.some(block => block.id === (selection ?? startAt))));
  const step = double ? 2 : 1;
  const first = Math.floor(index / step) * step;
  const count = pages.length;
  const last = Math.min(first + step, count);
  const editable = (target: EventTarget | null) =>
    target instanceof Element && !!target.closest("input,textarea,select,[contenteditable=true]");

  useEffect(() => {
    const sync = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  useEffect(() => {
    function restore() {
      const hash = window.location.hash.match(/^#cau-(\d+)$/)?.[1];
      if (hash) setSelection("cau-" + hash);
    }
    restore();
    window.addEventListener("hashchange", restore);
    return () => window.removeEventListener("hashchange", restore);
  }, []);

  useEffect(() => {
    if (!jump) return;
    const frame = requestAnimationFrame(() => {
      shouldFocus.current = true;
      setSelection(jump.id);
    });
    return () => cancelAnimationFrame(frame);
  }, [jump]);

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
  return (<>
    <nav aria-label="Ghi nhớ của bài" className="mx-auto flex max-w-5xl flex-wrap gap-x-4 px-2 font-hand text-accent">
      <button type="button" className="min-h-11 px-2 hover:underline" onClick={() => {
        const current = pages[index]?.find(block => block.id === selection);
        if (current?.kind === "item") setReturnTo(current.id);
        else if (!pages[first]?.some(block => block.kind === "head")) {
          const question = pages.slice(first, last).flat().find(block => block.kind === "item");
          if (question) setReturnTo(question.id);
        }
        shouldFocus.current = true;
        setSelection("head");
      }}>Ghi nhớ</button>
      {returnTo && pages[first]?.some(block => block.kind === "head") && <button type="button" className="min-h-11 px-2 hover:underline"
        onClick={() => { shouldFocus.current = true; setSelection(returnTo); setReturnTo(undefined); }}>Quay lại câu đang làm</button>}
    </nav>
    <div ref={frame} className="lesson-spread" data-double={double}
      style={{ "--spread-height": `${geometry.lines * geometry.line}px`, "--spread-width": `${geometry.width * step + (double ? 2 : 0)}px` } as CSSProperties}
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
      <div className={fallback ? "spread-pages animate-spread-turn" : "spread-pages"} onAnimationEnd={() => setFallback(false)}>
        {pages.map((page, n) => {
          const visible = n >= first && n < last;
          return <section key={page[0].id} data-offpage={!visible} inert={!visible} aria-hidden={!visible || undefined} aria-roledescription="trang"
            aria-label={`Trang ${n + 1}`} className="spread-page bg-ruled">
            <p tabIndex={-1} data-page-focus className="font-hand text-sm text-muted">{page[0].kind === "summary" ? "Tổng kết" : page[0].kind === "item"
                ? page.length > 1 && page.at(-1)?.kind === "item" ? `Câu ${page[0].id.slice(4)}–${page.at(-1)?.id.slice(4)}` : page[0].label
                : "Ghi nhớ"}</p>
            {page.map(block => <div key={block.id} data-block={block.id} className="spread-block">{block.node}</div>)}
            <p aria-hidden="true" className="mt-4 text-center font-hand text-sm text-muted">{count <= 12
              ? Array.from({ length: count }, (_, index) => <span key={index} className={index === n ? "text-accent" : "opacity-50"}>{index === n ? "●" : "○"}</span>)
              : `${n + 1} / ${count}`}</p>
          </section>;
        })}
      </div>
      <button type="button" className="spread-edge" aria-label="Trang sau" disabled={last >= count} onClick={() => turn(first + step)}><ChevronRight aria-hidden="true" /></button>
      <p role="status" className="sr-only">{caption}{firstQuestion && (firstQuestion === lastQuestion ? `, câu ${firstQuestion}` : `, câu ${firstQuestion} đến ${lastQuestion}`)}</p>
    </div>
  </>);
}
