"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { blockLines, pageBlocks, pageGeometry, type PageBlock } from "./page-blocks";

export type SpreadBlock = PageBlock & { node: ReactNode; label?: string };

export function Spread({ blocks, startAt, jump, child = false, status }: {
  blocks: SpreadBlock[]; startAt: string; child?: boolean; status?: string; jump?: { id: string; key: number } | null;
}) {
  const [viewport, setViewport] = useState({ width: 768, height: 720, pageWidth: 0 });
  const [selection, setSelection] = useState(startAt);
  const [returnTo, setReturnTo] = useState<string>();
  const [fallback, setFallback] = useState(false);
  const paper = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const shouldFocus = useRef(false);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const geometry = pageGeometry(viewport.width, viewport.height, child, viewport.pageWidth || undefined);
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
    const area = paper.current;
    const shell = area?.closest(".spread-shell");
    if (!area || !(shell instanceof HTMLElement)) return;
    const sync = () => {
      const width = window.innerWidth;
      const top = area.getBoundingClientRect().top + window.scrollY;
      const height = Math.max(0, window.innerHeight - top - (width < 640 ? 72 : 16));
      const contentWidth = shell.clientWidth - (width >= 640 ? 112 : 0);
      const pageWidth = width >= 1024 ? (contentWidth - 2) / 2 : contentWidth;
      setViewport(old => old.width === width && old.height === height && old.pageWidth === pageWidth
        ? old : { width, height, pageWidth });
    };
    const observer = new ResizeObserver(sync);
    observer.observe(area);
    observer.observe(shell);
    const main = area.closest("main");
    if (main) observer.observe(main);
    window.addEventListener("resize", sync);
    sync();
    return () => { observer.disconnect(); window.removeEventListener("resize", sync); };
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
  return (<div className="spread-shell">
    <nav aria-label="Ghi nhớ của bài" className="spread-memory mx-auto flex max-w-5xl flex-wrap gap-x-4 px-2 font-hand text-oak-ink">
      <button type="button" className="min-h-11 rounded-sm bg-postit-yellow px-3 text-postit-ink hover:underline" onClick={() => {
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
      style={{ "--spread-height": `${(geometry.lines + 2) * geometry.line}px`, "--spread-width": `${geometry.width * step + (double ? 2 : 0)}px` } as CSSProperties}
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
      <button type="button" className="spread-edge" aria-label="Trang trước" disabled={first === 0} onClick={() => turn(first - step)}><TurnCorner back /></button>
      <div ref={paper} className={fallback ? "spread-pages animate-spread-turn" : "spread-pages"} onAnimationEnd={() => setFallback(false)}>
        {pages.map((page, n) => {
          const visible = n >= first && n < last;
          return <section key={page[0].id} data-offpage={!visible} inert={!visible} aria-hidden={!visible || undefined} aria-roledescription="trang"
            aria-label={`Trang ${n + 1}`} className="spread-page bg-ruled">
            <div className="spread-paper-body" data-overflow={page.some(block =>
              block.kind === "summary" || block.long || blockLines(block, geometry) > geometry.lines - 1)}>
            <p tabIndex={-1} data-page-focus className="spread-page-label font-hand text-sm text-muted">{page[0].kind === "summary" ? "Tổng kết" : page[0].kind === "item"
                ? page.length > 1 && page.at(-1)?.kind === "item" ? `Câu ${page[0].id.slice(4)}–${page.at(-1)?.id.slice(4)}` : page[0].label
                : "Ghi nhớ"}</p>
            {page.map(block => <div key={block.id} data-block={block.id} data-kind={block.kind} className="spread-block">{block.node}</div>)}
            </div>
            <p aria-hidden="true" className="spread-page-count text-center font-hand text-sm text-muted">{count <= 12
              ? Array.from({ length: count }, (_, index) => <span key={index} className="spread-dot" data-current={index === n} />)
              : `${n + 1} / ${count}`}</p>
          </section>;
        })}
      </div>
      <button type="button" className="spread-edge" aria-label="Trang sau" disabled={last >= count} onClick={() => turn(first + step)}><TurnCorner /></button>
      {status && <p role="status" className="spread-save rounded-b-sm bg-paper px-2 font-hand text-sm text-ink-paper">{status}</p>}
      <p role="status" className="sr-only">{caption}{firstQuestion && (firstQuestion === lastQuestion ? `, câu ${firstQuestion}` : `, câu ${firstQuestion} đến ${lastQuestion}`)}</p>
    </div>
  </div>);
}

function TurnCorner({ back = false }: { back?: boolean }) {
  return <svg width="38" height="38" viewBox="0 0 40 40" aria-hidden="true" style={{ transform: back ? "scaleX(-1)" : undefined }}>
    <path d="M4 5h31v18L20 35H4Z" fill="#f7eac9" stroke="#6b4e36" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M20 35c4-4 7-9 6-14l9 2M10 17h10m-4-4 4 4-4 4" fill="none" stroke="#6b4e36" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
