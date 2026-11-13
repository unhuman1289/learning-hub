"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { RuledPage } from "../../../components/notebook/paper";
import { buttonClass } from "../ui";

export function LessonFlow({ initialPage, count, subject, notes, reference, page, status, locked }: {
  initialPage: number;
  count: number;
  subject: string;
  notes: ReactNode;
  reference: string;
  page: (index: number, jump: (index: number) => void) => ReactNode;
  status: string;
  locked: boolean;
}) {
  const [position, setPosition] = useState(initialPage);
  const [direction, setDirection] = useState<"next" | "previous">();
  const root = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const index = Math.min(position, count + 1);
  const end = index > count;
  const question = index > 0 && !end;

  function jump(next: number) {
    if (next < 0 || next > count + 1 || next === index) return;
    setDirection(next > index ? "next" : "previous");
    setPosition(next);
  }

  useEffect(() => {
    if (!direction) return;
    root.current?.querySelector<HTMLElement>("[data-lesson-heading]")?.focus({ preventScroll: true });
    const top = root.current?.getBoundingClientRect().top;
    if (top !== undefined && top < 85) root.current?.scrollIntoView({ block: "start" });
  }, [direction, index]);

  const interactive = "input, textarea, select, button, a, summary, [contenteditable], [role=dialog]";
  return <div ref={root} className="lesson-flow scroll-mt-24" tabIndex={-1}
    aria-label="Các trang bài học"
    onKeyDown={event => {
      if (locked || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
          !(event.target instanceof Element) || event.target.closest(interactive)) return;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        jump(index + (event.key === "ArrowRight" ? 1 : -1));
      }
    }}
    onTouchStart={event => {
      touch.current = null;
      if (locked || event.touches.length !== 1 || !(event.target instanceof Element) ||
          event.target.closest(interactive + ", pre, table, [data-lesson-notes]")) return;
      touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }}
    onTouchCancel={() => { touch.current = null; }}
    onTouchEnd={event => {
      const start = touch.current;
      touch.current = null;
      if (locked || !start || event.touches.length || event.changedTouches.length !== 1) return;
      const dx = event.changedTouches[0].clientX - start.x;
      const dy = event.changedTouches[0].clientY - start.y;
      if (Math.abs(dx) >= 64 && Math.abs(dx) > Math.abs(dy) * 1.5) jump(index + (dx < 0 ? 1 : -1));
    }}>
    <div className="lesson-flow-spread" data-companion={question}>
      <RuledPage as="section" className="lesson-flow-page">
        <div key={index} className="lesson-flow-content" data-direction={direction}>
          {question && <p className="mb-3 font-hand text-lg text-muted-paper">{subject} · Câu {index}/{count}</p>}
          {page(index, jump)}
        </div>
        <nav aria-label="Lật trang bài học" className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-2">
          <button type="button" disabled={locked || index === 0} onClick={() => jump(index - 1)}
            className={buttonClass("ghost", index === 0 ? "invisible" : "")}>Quay lại</button>
          {question && index > 1 && <button type="button" disabled={locked} onClick={() => jump(0)}
            className={buttonClass("ghost")}>Ghi nhớ</button>}
          {!end && <button type="button" disabled={locked} onClick={() => jump(index + 1)}
            className={buttonClass(question ? "secondary" : "primary")}>
            {index === 0 ? "Bắt đầu" : index === count ? "Tổng kết" : "Tiếp"}
          </button>}
          <span role="status" className="w-full text-sm text-muted-paper">{status}</span>
        </nav>
      </RuledPage>
      {question && <RuledPage as="aside" className="lesson-flow-companion">
        <h2 className="font-print text-2xl">Ghi nhớ</h2>
        <p className="mt-3 whitespace-pre-wrap break-words">{reference}</p>
        <details className="mt-3">
          <summary className="min-h-11 cursor-pointer content-center text-accent-paper">Xem ghi chú và nguồn</summary>
          <div className="mt-2">{notes}</div>
        </details>
      </RuledPage>}
    </div>
  </div>;
}
