import { flushSync } from "react-dom";

export function turnLeaf(id: string, direction: "next" | "previous", update: () => void) {
  const html = document.documentElement;
  if (html.dataset.lessonTurn) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { update(); return; }
  if (!document.startViewTransition) {
    document.getElementById(id)?.setAttribute("data-fallback-turn", direction);
    update();
    return;
  }
  html.dataset.lessonTurn = direction;
  void document.startViewTransition(() => flushSync(update)).finished.catch(() => {}).finally(() => {
    delete html.dataset.lessonTurn;
  });
}
