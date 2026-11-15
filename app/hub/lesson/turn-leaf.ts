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

/**
 * Turns the lesson sheet. The old sheet folds away along a line from the pressed corner
 * (see `lesson-curl-*` in globals.css); `curl` is the current corner curl in px, so the
 * turn starts from what the learner already sees. Both sheets are cut to the screen area
 * they share, so pages of different lengths, or a page scrolled down, turn as sheets of one size.
 */
export function turnLeaf(id: string, direction: "next" | "previous", update: () => void, curl = 0, corner: "top" | "bottom" = "bottom") {
  const html = document.documentElement;
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
  void document.startViewTransition(() => {
    html.dataset.lessonTurnIn = "";
    flushSync(update);
    // The window is where both sheets are on screen; the old sheet folds from its corner.
    const next = document.getElementById(id)?.getBoundingClientRect() ?? old;
    let from = Math.max(0, old.top, next.top), to = Math.min(innerHeight, old.bottom, next.bottom);
    if (to - from < 2 * REST_CURL) { from = Math.max(0, old.top); to = Math.max(Math.min(innerHeight, old.bottom), from + 2 * REST_CURL); }
    const values = [px(old.width), px(old.height), px((corner === "top" ? from : to) - old.top), px(Math.max(REST_CURL, curl)),
      px(2 * Math.ceil(Math.hypot(old.width, old.height)) + 2), clip(old.top, old.bottom, from, to), clip(next.top, next.bottom, from, to)];
    geometry.forEach((name, index) => html.style.setProperty(name, values[index]));
  }).finished.catch(() => {}).finally(() => {
    delete html.dataset.lessonTurn;
    delete html.dataset.lessonTurnIn;
    delete html.dataset.lessonFold;
    geometry.forEach(name => html.style.removeProperty(name));
  });
}
