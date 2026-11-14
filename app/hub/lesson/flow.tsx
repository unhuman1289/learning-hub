"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { RuledPage } from "../../../components/notebook/paper";
import { buttonClass } from "../ui";

export function LessonFlow({ initialItem, groups, count, subject, materials, page, status, locked }: {
  initialItem: number;
  groups: number[][];
  count: number;
  subject: string;
  materials: ReactNode;
  page: (index: number, jump: (index: number) => void) => ReactNode;
  status: string;
  locked: boolean;
}) {
  const [selected, setSelected] = useState<number | "summary">(initialItem === count + 1 ? "summary" : initialItem);
  const [direction, setDirection] = useState<"next" | "previous">();
  const root = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const paperId = useId();
  const touch = useRef<{ x: number; y: number } | null>(null);
  const pages = [[0], ...groups, [count + 1]];
  const target = selected === "summary" ? count + 1 : selected;
  const index = Math.max(0, pages.findIndex(numbers => numbers.includes(target)));
  const end = index === pages.length - 1;
  const current = pages[index];
  const first = current[0];
  const last = current.at(-1);
  const question = index > 0 && !end;

  function jump(next: number) {
    if (next < 0 || next > count + 1 || next === target) return;
    const direction = next > target ? "next" : "previous";
    const update = () => {
      setDirection(direction);
      setSelected(next === count + 1 ? "summary" : next);
    };
    if (current.includes(next)) update();
    else {
      void import("./turn-leaf").then(({ turnLeaf }) => {
        if (document.getElementById(paperId)) turnLeaf(paperId, direction, update);
      }, () => {
        if (document.getElementById(paperId)) update();
      });
    }
  }

  function turn(offset: number) {
    const next = pages[index + offset]?.[0];
    if (next !== undefined) jump(next);
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

  function clearTouch() {
    const start = touch.current;
    touch.current = null;
    if (paper.current) delete paper.current.dataset.raisedEdge;
    return start;
  }

  const interactive = "input, textarea, select, button, a, summary, [contenteditable], [role=dialog]";
  return <div ref={root} className="lesson-flow scroll-mt-24" tabIndex={-1}
    aria-label="Các trang bài học"
    onKeyDown={event => {
      if (locked || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
          !(event.target instanceof Element) || event.target.closest(interactive)) return;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        turn(event.key === "ArrowRight" ? 1 : -1);
      }
    }}
    onTouchStart={event => {
      clearTouch();
      if (locked || event.touches.length !== 1 || !(event.target instanceof Element) ||
          event.target.closest(interactive + ", pre, table, [data-lesson-notes]")) return;
      const { clientX: x, clientY: y } = event.touches[0];
      touch.current = { x, y };
      const leaf = paper.current;
      if (!leaf) return;
      const { left, right } = leaf.getBoundingClientRect();
      if (x >= left && x - left < 36) leaf.dataset.raisedEdge = "left";
      if (x <= right && right - x < 36) leaf.dataset.raisedEdge = "right";
    }}
    onTouchMove={event => {
      const start = touch.current;
      if (!start || event.touches.length !== 1) { clearTouch(); return; }
      const { clientX, clientY } = event.touches[0];
      if (Math.abs(clientY - start.y) > 12 && Math.abs(clientY - start.y) > Math.abs(clientX - start.x)) clearTouch();
    }}
    onTouchCancel={clearTouch}
    onTouchEnd={event => {
      const start = clearTouch();
      if (locked || !start || event.touches.length || event.changedTouches.length !== 1) return;
      const dx = event.changedTouches[0].clientX - start.x;
      const dy = event.changedTouches[0].clientY - start.y;
      if (Math.abs(dx) >= 64 && Math.abs(dx) > Math.abs(dy) * 1.5) turn(dx < 0 ? 1 : -1);
    }}>
    <div id={paperId} ref={paper} className="lesson-flow-leaf" onAnimationEnd={event => {
      if (event.animationName === "lesson-leaf-arrive" && paper.current) delete paper.current.dataset.fallbackTurn;
    }}>
      <RuledPage key={first} as="section" className="lesson-flow-page">
        {question && <>
          <p className="mb-3 font-hand text-lg text-muted-paper">{subject} · {first === last ? `Câu ${first}/${count}` : `Câu ${first}–${last}/${count}`}</p>
          {materials}
        </>}
        <div className="lesson-flow-questions">
          {current.map(number => <div key={number} className="min-w-0">{page(number, jump)}</div>)}
        </div>
        <nav aria-label="Lật trang bài học" className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-2">
          <button type="button" data-turn-edge="left" disabled={locked || index === 0} onClick={() => turn(-1)}
            className={buttonClass("ghost", index === 0 ? "invisible" : "")}>Quay lại</button>
          {!end && <button type="button" data-turn-edge="right" disabled={locked} onClick={() => turn(1)}
            className={buttonClass(question ? "secondary" : "primary")}>
            {index === 0 ? "Bắt đầu" : index === pages.length - 2 ? "Tổng kết" : "Tiếp"}
          </button>}
          {status && <span role="status" className="w-full text-sm text-muted-paper">{status}</span>}
        </nav>
      </RuledPage>
    </div>
  </div>;
}
