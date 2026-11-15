import { flushSync } from "react-dom";

/** Size of the resting corner curl (px); the turn starts from at least this. */
const REST_CURL = 24;
const geometry = ["--leaf-w", "--leaf-h", "--curl-y", "--turn-from", "--turn-l"];

/** Paper curl needs the GPU; skip it when asked to or on low-memory phones. */
function stillPage() {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return matchMedia("(prefers-reduced-motion: reduce)").matches || (memory !== undefined && memory <= 2);
}

/**
 * Turns the lesson sheet. The old sheet folds away along a line from the bottom corner
 * (see `lesson-curl-*` in globals.css); `curl` is the current corner curl in px, so the
 * turn starts from what the learner already sees.
 */
export function turnLeaf(id: string, direction: "next" | "previous", update: () => void, curl = 0) {
  const html = document.documentElement;
  if (html.dataset.lessonTurn) return;
  if (stillPage()) { update(); return; }
  const leaf = document.getElementById(id);
  if (!document.startViewTransition || !leaf) {
    leaf?.setAttribute("data-fallback-turn", direction);
    update();
    return;
  }
  const { width, height, top } = leaf.getBoundingClientRect();
  // Fold from the visible bottom corner when the sheet is taller than the screen.
  const bottom = Math.max(REST_CURL, Math.min(height, innerHeight - top));
  const values = [width, height, bottom, Math.max(REST_CURL, curl), 2 * Math.ceil(Math.hypot(width, height)) + 2];
  geometry.forEach((name, index) => html.style.setProperty(name, values[index].toFixed(1) + "px"));
  html.dataset.lessonTurn = direction;
  void document.startViewTransition(() => {
    html.dataset.lessonTurnIn = "";
    flushSync(update);
  }).finished.catch(() => {}).finally(() => {
    delete html.dataset.lessonTurn;
    delete html.dataset.lessonTurnIn;
    geometry.forEach(name => html.style.removeProperty(name));
  });
}
