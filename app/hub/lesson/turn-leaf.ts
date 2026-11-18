import { flushSync } from "react-dom";

/** Size of the resting corner curl (px); the turn starts from at least this. */
const REST_CURL = 24;
const geometry = ["--leaf-w", "--leaf-h", "--curl-y", "--turn-from", "--turn-l", "--out-clip", "--in-clip"];

/** Paper curl needs the GPU; skip it when asked to or on low-memory phones. */
function stillPage() {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return matchMedia("(prefers-reduced-motion: reduce)").matches || (memory !== undefined && memory <= 2);
}

const px = (value: number) => Math.max(0, value).toFixed(1) + "px";
/** Clip a sheet that spans [top, bottom] on screen to the window [from, to]. */
const clip = (top: number, bottom: number, from: number, to: number) => `inset(${px(from - top)} 0 ${px(bottom - to)} 0)`;

/** Turn between already mounted question pages without rendering or measuring in the callback. */
export function turnPrepared(leaf: HTMLElement, outgoing: HTMLElement, incoming: HTMLElement,
  heights: { old: number; next: number }, direction: "next" | "previous", done: () => void,
  curl = 0, corner: "top" | "bottom" = "bottom") {
  const html = document.documentElement;
  if (html.dataset.lessonTurn) return;
  const diag = (window as Window & { __e2eTurnDiag?: boolean }).__e2eTurnDiag;
  const mark = (phase: string) => { if (diag) performance.mark(`turn:${phase}`); };
  const measure = (name: string, start: string, end: string) => {
    if (diag) performance.measure(`turn:${name}`, `turn:${start}`, `turn:${end}`);
  };
  mark("start");
  mark("prepared");
  const old = leaf.getBoundingClientRect();
  const nextBottom = old.top + heights.next;
  const frameBottom = old.top + Math.max(heights.old, heights.next);
  let from = Math.max(0, old.top), to = Math.min(innerHeight, old.top + heights.old, nextBottom);
  if (to - from < 2 * REST_CURL) { from = Math.max(0, old.top); to = Math.max(Math.min(innerHeight, old.bottom), from + 2 * REST_CURL); }
  const values = [px(old.width), px(heights.old), px((corner === "top" ? from : to) - old.top), px(Math.max(REST_CURL, curl)),
    px(2 * Math.ceil(Math.hypot(old.width, heights.old)) + 2), clip(old.top, frameBottom, from, to), clip(old.top, frameBottom, from, to)];
  const swap = () => {
    mark("update-start");
    html.dataset.lessonTurnIn = "";
    delete outgoing.dataset.active;
    outgoing.inert = true;
    outgoing.setAttribute("aria-hidden", "true");
    incoming.dataset.active = "";
    incoming.inert = false;
    incoming.removeAttribute("aria-hidden");
    mark("update-end");
    measure("update", "update-start", "update-end");
  };
  const finish = () => {
    mark("end");
    measure("total", "start", "end");
    delete html.dataset.lessonTurn;
    delete html.dataset.lessonTurnIn;
    delete html.dataset.lessonFold;
    geometry.forEach(name => html.style.removeProperty(name));
    leaf.style.removeProperty("height");
    done();
  };
  if (stillPage() || !document.startViewTransition) { swap(); finish(); return; }
  html.dataset.lessonTurn = direction;
  html.dataset.lessonFold = corner;
  geometry.forEach((name, index) => html.style.setProperty(name, values[index]));
  leaf.style.height = px(Math.max(heights.old, heights.next));
  void document.startViewTransition(swap).finished.catch(() => {}).finally(finish);
}

/**
 * Turns the lesson sheet. The old sheet folds away along a line from the pressed corner
 * (see `lesson-curl-*` in globals.css); `curl` is the current corner curl in px, so the
 * turn starts from what the learner already sees. Both sheets are cut to the screen area
 * they share, so pages of different lengths, or a page scrolled down, turn as sheets of one size.
 */
export function turnLeaf(id: string, direction: "next" | "previous", update: () => void, curl = 0, corner: "top" | "bottom" = "bottom") {
  const html = document.documentElement;
  const diag = (window as Window & { __e2eTurnDiag?: boolean }).__e2eTurnDiag;
  const mark = (phase: string) => { if (diag) performance.mark(`turn:${phase}`); };
  const measure = (name: string, start: string, end: string) => {
    if (diag) performance.measure(`turn:${name}`, `turn:${start}`, `turn:${end}`);
  };
  mark("start");
  if (html.dataset.lessonTurn) return;
  if (stillPage()) { update(); return; }
  const leaf = document.getElementById(id);
  if (!document.startViewTransition || !leaf) {
    leaf?.setAttribute("data-fallback-turn", direction);
    update();
    return;
  }
  const old = leaf.getBoundingClientRect();
  html.dataset.lessonTurn = direction;
  html.dataset.lessonFold = corner;
  mark("transition-start");
  void document.startViewTransition(() => {
    mark("update-start");
    html.dataset.lessonTurnIn = "";
    mark("flush-start");
    flushSync(update);
    mark("flush-end");
    measure("flush", "flush-start", "flush-end");
    // The window is where both sheets are on screen; the old sheet folds from its corner.
    const next = document.getElementById(id)?.getBoundingClientRect() ?? old;
    let from = Math.max(0, old.top, next.top), to = Math.min(innerHeight, old.bottom, next.bottom);
    if (to - from < 2 * REST_CURL) { from = Math.max(0, old.top); to = Math.max(Math.min(innerHeight, old.bottom), from + 2 * REST_CURL); }
    const values = [px(old.width), px(old.height), px((corner === "top" ? from : to) - old.top), px(Math.max(REST_CURL, curl)),
      px(2 * Math.ceil(Math.hypot(old.width, old.height)) + 2), clip(old.top, old.bottom, from, to), clip(next.top, next.bottom, from, to)];
    geometry.forEach((name, index) => html.style.setProperty(name, values[index]));
    mark("update-end");
    measure("update", "update-start", "update-end");
  }).finished.catch(() => {}).finally(() => {
    mark("end");
    measure("transition", "transition-start", "end");
    measure("total", "start", "end");
    delete html.dataset.lessonTurn;
    delete html.dataset.lessonTurnIn;
    delete html.dataset.lessonFold;
    geometry.forEach(name => html.style.removeProperty(name));
    document.dispatchEvent(new Event("lesson-turn-finished"));
  });
}
