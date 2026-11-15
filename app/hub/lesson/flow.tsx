"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { RuledPage } from "../../../components/notebook/paper";

type Side = "left" | "right";
type Corner = "top" | "bottom";

/** A swipe this far (px) turns the page; shorter pulls spring back. */
const SWIPE = 64;

export function LessonFlow({ initialItem, groups, count, subject, materials, page, status, locked, hint = false, onHintSeen = () => {} }: {
  initialItem: number;
  groups: number[][];
  count: number;
  subject: string;
  materials: ReactNode;
  page: (index: number, jump: (index: number) => void) => ReactNode;
  status: string;
  locked: boolean;
  /** Show "Chạm mép giấy để lật" until the learner first turns a page. */
  hint?: boolean;
  onHintSeen?: () => void;
}) {
  const [selected, setSelected] = useState<number | "summary">(initialItem === count + 1 ? "summary" : initialItem);
  const [direction, setDirection] = useState<"next" | "previous">();
  const root = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const paperId = useId();
  const touch = useRef<{ x: number; y: number; corner: Corner } | null>(null);
  const pages = [[0], ...groups, [count + 1]];
  const target = selected === "summary" ? count + 1 : selected;
  const index = Math.max(0, pages.findIndex(numbers => numbers.includes(target)));
  const end = index === pages.length - 1;
  const current = pages[index];
  const first = current[0];
  const last = current.at(-1);
  const question = index > 0 && !end;

  function jump(next: number, curl = 0, corner: Corner = "bottom") {
    if (next < 0 || next > count + 1 || next === target) return;
    const direction = next > target ? "next" : "previous";
    const update = () => {
      setDirection(direction);
      setSelected(next === count + 1 ? "summary" : next);
    };
    if (current.includes(next)) update();
    else {
      void import("./turn-leaf").then(({ turnLeaf }) => {
        if (document.getElementById(paperId)) turnLeaf(paperId, direction, update, curl, corner);
      }, () => {
        if (document.getElementById(paperId)) update();
      });
    }
  }

  function turn(offset: number, curl = 0, corner: Corner = "bottom") {
    const next = pages[index + offset]?.[0];
    if (next !== undefined) jump(next, curl, corner);
  }

  useEffect(() => {
    if (!direction && target === first) return;
    const section = root.current;
    const heading = section?.querySelector<HTMLElement>(`[data-question-number="${target}"]`) ??
      section?.querySelector<HTMLElement>("[data-lesson-heading]");
    if (direction) heading?.focus({ preventScroll: true });
    if (target !== first) heading?.scrollIntoView({ block: "start" });
    else if (section && section.getBoundingClientRect().top < 85) section.scrollIntoView({ block: "start" });
  }, [direction, first, target]);

  const edges = useRef(new Map<string, HTMLElement>());
  function keepEdge(key: string, element: HTMLElement | null) {
    if (element) edges.current.set(key, element);
    else edges.current.delete(key);
  }
  const frame = useRef(0);

  /** Lift one corner as far as the finger has pulled it (0 = at rest, 1 = turn threshold). */
  function pull(side: Side | null, amount = 0, corner: Corner = "bottom") {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      for (const [key, edge] of edges.current) {
        if (key === side + "-" + corner && amount > 0) {
          edge.dataset.pulled = "";
          edge.style.setProperty("--pull", Math.min(amount, 1.25).toFixed(3));
        } else if ("pulled" in edge.dataset) {
          delete edge.dataset.pulled;
          edge.style.removeProperty("--pull");
        }
      }
    });
  }

  function turnFrom(offset: 1 | -1, corner: Corner = "bottom") {
    if (locked) return;
    const edge = edges.current.get((offset > 0 ? "right" : "left") + "-" + corner);
    const curl = edge?.querySelector<HTMLElement>("[data-curl]")?.getBoundingClientRect().width ?? 0;
    if (hint && pages[index + offset]) onHintSeen();
    turn(offset, curl, corner);
  }

  /** A swipe lifts the top corner when it starts in the upper half of a sheet whose top is on screen. */
  function cornerAt(y: number): Corner {
    const sheet = paper.current?.getBoundingClientRect();
    if (!sheet || sheet.top < 0) return "bottom";
    return y < (sheet.top + Math.min(sheet.bottom, innerHeight)) / 2 ? "top" : "bottom";
  }

  function clearTouch() {
    const start = touch.current;
    touch.current = null;
    return start;
  }

  const nextNumbers = pages[index + 1];
  const nextLabel = index === 0 ? "Bắt đầu bài" : index === pages.length - 2 ? "Sang Tổng kết" :
    nextNumbers ? `Trang sau: Câu ${nextNumbers.length > 1 ? `${nextNumbers[0]}–${nextNumbers.at(-1)}` : nextNumbers[0]}` : "";
  const interactive = "input, textarea, select, button:not([data-turn-edge]), a, summary, [contenteditable], [role=dialog]";
  return <div ref={root} className="lesson-flow scroll-mt-24" tabIndex={-1}
    aria-label="Các trang bài học"
    onKeyDown={event => {
      if (locked || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
          !(event.target instanceof Element) || event.target.closest(interactive)) return;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        turnFrom(event.key === "ArrowRight" ? 1 : -1);
      }
    }}
    onTouchStart={event => {
      clearTouch();
      pull(null);
      if (locked || event.touches.length !== 1 || !(event.target instanceof Element) ||
          event.target.closest(interactive + ", pre, table, [data-lesson-notes]")) return;
      const { clientX: x, clientY: y } = event.touches[0];
      touch.current = { x, y, corner: cornerAt(y) };
    }}
    onTouchMove={event => {
      const start = touch.current;
      if (!start || event.touches.length !== 1) { clearTouch(); pull(null); return; }
      const { clientX, clientY } = event.touches[0];
      const dx = clientX - start.x, dy = clientY - start.y;
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { clearTouch(); pull(null); return; }
      pull(dx < 0 ? "right" : "left", Math.abs(dx) / SWIPE, start.corner);
    }}
    onTouchCancel={() => { clearTouch(); pull(null); }}
    onTouchEnd={event => {
      const start = clearTouch();
      if (locked || !start || event.touches.length || event.changedTouches.length !== 1) { pull(null); return; }
      const dx = event.changedTouches[0].clientX - start.x;
      const dy = event.changedTouches[0].clientY - start.y;
      const offset = dx < 0 ? 1 : -1;
      if (Math.abs(dx) >= SWIPE && Math.abs(dx) > Math.abs(dy) * 1.5 && pages[index + offset]) turnFrom(offset, start.corner);
      else pull(null);
    }}>
    <div id={paperId} ref={paper} className="lesson-flow-leaf" onAnimationEnd={event => {
      if (event.animationName === "lesson-leaf-arrive" && paper.current) delete paper.current.dataset.fallbackTurn;
    }}>
      <span className="lesson-flow-curl" aria-hidden="true" />
      <RuledPage key={first} as="section" className="lesson-flow-page">
        {question && <>
          <p className="mb-3 font-hand text-lg text-muted-paper">{subject} · {first === last ? `Câu ${first}/${count}` : `Câu ${first}–${last}/${count}`}</p>
          {materials}
        </>}
        <div className="lesson-flow-questions">
          {current.map(number => <div key={number} className="min-w-0">{page(number, jump)}</div>)}
        </div>
        {hint && !end && <p className="lesson-flow-hint font-hand">Chạm mép giấy để lật</p>}
        {status && <p role="status" className="mt-5 border-t border-rule pt-2 text-sm text-muted-paper">{status}</p>}
        <nav aria-label="Lật trang bài học">
          {index > 0 && <>
            <button type="button" ref={element => keepEdge("left-bottom", element)} data-turn-edge="left" data-side="left" data-corner="bottom"
              className="lesson-flow-edge" disabled={locked} aria-label="Trang trước" onClick={() => turnFrom(-1)}>
              <span data-curl aria-hidden="true" />
            </button>
            <span ref={element => keepEdge("left-top", element)} data-turn-corner="left" data-side="left" data-corner="top" aria-hidden="true"
              className="lesson-flow-edge" data-disabled={locked || undefined} onClick={() => turnFrom(-1, "top")}>
              <span data-curl />
            </span>
          </>}
          {!end && <>
            <button type="button" ref={element => keepEdge("right-bottom", element)} data-turn-edge="right" data-side="right" data-corner="bottom"
              className="lesson-flow-edge" disabled={locked} aria-label={nextLabel} onClick={() => turnFrom(1)}>
              <span data-curl aria-hidden="true" />
            </button>
            <span ref={element => keepEdge("right-top", element)} data-turn-corner="right" data-side="right" data-corner="top" aria-hidden="true"
              className="lesson-flow-edge" data-disabled={locked || undefined} onClick={() => turnFrom(1, "top")}>
              <span data-curl />
            </span>
          </>}
        </nav>
      </RuledPage>
    </div>
  </div>;
}
