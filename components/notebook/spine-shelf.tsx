"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { RouteLink } from "../../app/hub/ui";
import type { Route } from "../../app/hub/use-route";
import { cx, NotebookCover } from "./paper";
import { SPINE, chunkRows, coverShift, shelfCapacity, spineColor } from "./shelf-rows";

export type SpineBook = {
  id: string;
  title: string;
  status: string;
  /** Where the book opens; null when it may only be looked at. */
  route: Route | null;
  /** Name for the cover while it opens into the notebook. */
  transition?: string;
};

type Entry = { kind: "book"; book: SpineBook } | { kind: "new" };

/**
 * Notebooks standing on the shelf with their spines out. The book under the pointer (or keyboard focus,
 * or the first touch) is pulled out and turned to show its cover; the rest stay spine-out. A shelf fills
 * before the next one is started; the "new notebook" stub stands at the end like a small empty slot.
 */
export function SpineShelves({ books, go, onNew }: { books: SpineBook[]; go: (route: Route) => void; onNew: (() => void) | null }) {
  const [out, setOut] = useState<string | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  const measured = useRef<HTMLDivElement>(null);
  const lastPointer = useRef("mouse");
  const touch = useMemo(() => ({ note: (type: string) => { lastPointer.current = type; }, active: () => lastPointer.current === "touch" }), []);
  const root = useRef<HTMLDivElement>(null);

  // The first shelf's inner width decides how many spines fit on every shelf.
  useLayoutEffect(() => {
    const node = measured.current;
    if (!node) return;
    const read = () => setWidth(node.clientWidth);
    read();
    const watcher = new ResizeObserver(read);
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  // A touch has no "leave": a tap anywhere else puts the book back.
  useEffect(() => {
    if (out === null) return;
    const away = (event: PointerEvent) => {
      if (event.pointerType === "touch" && !root.current?.contains(event.target as Node)) setOut(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [out]);

  const capacity = shelfCapacity(width ?? 0);
  const rows = useMemo(() => {
    const entries: Entry[] = books.map((book) => ({ kind: "book", book }));
    if (onNew) entries.push({ kind: "new" });
    return chunkRows(entries, width === null ? 6 : capacity);
  }, [books, onNew, capacity, width]);

  return (
    <div ref={root} className="grid gap-y-4">
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="flex min-w-0 flex-col justify-end">
          <div ref={rowIndex === 0 ? measured : undefined} className="mx-2 flex items-end pt-4 sm:mx-3" style={{ gap: SPINE.gap }}>
            {row.map((entry, index) => {
              const shift = width === null ? 0 : coverShift(index, width);
              return entry.kind === "new"
                ? <NewStub key="new" onNew={onNew!} />
                : <Spine key={entry.book.id} book={entry.book} isOut={out === entry.book.id} shift={shift} go={go}
                    touch={touch} setOut={setOut} />;
            })}
          </div>
          <div className="bg-oak h-3 border-b-2 border-oak-dark/70 shadow-[0_4px_6px_-2px_rgb(0_0_0/0.45)]" />
        </div>
      ))}
    </div>
  );
}

function Spine({ book, isOut, shift, go, touch, setOut }: {
  book: SpineBook; isOut: boolean; shift: number; go: (route: Route) => void;
  touch: { note: (type: string) => void; active: () => boolean }; setOut: (update: (current: string | null) => string | null) => void;
}) {
  const color = spineColor(book.id);
  const set = (id: string | null) => setOut(() => id);
  const clear = () => setOut((current) => (current === book.id ? null : current));
  const props = {
    "data-out": isOut,
    "aria-label": book.route ? `Mở sổ ${book.title}` : `Sổ ${book.title}`,
    className: "spine-slot group rounded-[2px]",
    style: { "--shift": `${shift}px` } as CSSProperties,
    onPointerDown: (event: React.PointerEvent) => { touch.note(event.pointerType); },
    onPointerEnter: (event: React.PointerEvent) => { if (event.pointerType !== "touch") set(book.id); },
    onPointerLeave: (event: React.PointerEvent) => { if (event.pointerType !== "touch") clear(); },
    // Keyboard focus pulls the book out too; a tap or click that merely focuses it does not.
    onFocus: (event: React.FocusEvent<HTMLElement>) => { if (event.currentTarget.matches(":focus-visible")) set(book.id); },
    onBlur: (event: React.FocusEvent<HTMLElement>) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) clear(); },
  };
  const body = (
    <span className="spine-box">
      <SpineFace title={book.title} color={color} />
      <span className="spine-cover" style={isOut && book.transition ? { viewTransitionName: book.transition } : undefined}>
        <NotebookCover title={book.title} lines={[book.status]} spineColor={color} className="size-full !aspect-auto" />
      </span>
    </span>
  );
  if (!book.route) return <div role="group" tabIndex={0} {...props}>{body}</div>;
  return (
    <RouteLink
      route={book.route} go={go} {...props}
      // On a touch screen the first tap only pulls the book out; the second opens it.
      onClick={(event) => { if (touch.active() && !isOut) { event.preventDefault(); set(book.id); } }}
    >
      {body}
    </RouteLink>
  );
}

/** The book's back: cloth, two gold bands and a paper label with the title written along it. */
function SpineFace({ title, color }: { title: string; color: string }) {
  return (
    <span aria-hidden="true" className="spine-face overflow-hidden rounded-[2px_1px_1px_2px] shadow-[inset_2px_0_0_rgb(255_255_255/0.12),inset_-2px_0_0_rgb(0_0_0/0.35),1px_2px_3px_rgb(0_0_0/0.35)]" style={{ backgroundColor: color }}>
      <span className="absolute inset-x-0 top-2.5 h-[3px] bg-[#c9a24a]/80" />
      <span className="absolute inset-x-0 bottom-2.5 h-[3px] bg-[#c9a24a]/80" />
      <span className="absolute inset-x-[5px] bottom-[22px] top-[22px] grid place-items-center overflow-hidden rounded-[2px] bg-label py-1.5 text-label-ink">
        <span className="max-h-full truncate font-hand text-[15px] leading-none [text-orientation:mixed] [transform:rotate(180deg)] [writing-mode:vertical-rl]">{title}</span>
      </span>
    </span>
  );
}

/** A small empty slot at the end of the shelf: the place for the next notebook. */
function NewStub({ onNew }: { onNew: () => void }) {
  return (
    <button
      type="button" onClick={onNew} aria-label="Sổ mới"
      className="group grid h-[152px] w-9 flex-none place-items-end justify-center rounded-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span className={cx(
        "grid h-[92px] w-[30px] place-items-center gap-0 rounded-[2px] border-2 border-dashed border-cabinet-ink/40 py-1.5 text-cabinet-ink/70 transition-[translate,border-color,background-color] duration-200",
        "group-hover:-translate-y-1.5 group-hover:border-accent group-hover:bg-paper/40 group-hover:text-accent group-focus-visible:-translate-y-1.5 group-focus-visible:border-accent",
      )}>
        <span aria-hidden="true" className="font-hand text-xl leading-none">+</span>
        <span aria-hidden="true" className="font-hand text-[13px] leading-none [text-orientation:mixed] [transform:rotate(180deg)] [writing-mode:vertical-rl]">Sổ mới</span>
      </span>
    </button>
  );
}
