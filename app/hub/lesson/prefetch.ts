"use client";

// A single, one-use reader snapshot, held only in this tab's memory.
declare global { interface Window { __lhLessonReader?: typeof import("../lesson-v2/reader").LessonReader } }

const MAX_AGE = 5 * 60_000;
type Entry = { owner: string; learner: string | null; id: string; at: number; value: unknown };
let entry: Entry | undefined;
let request: AbortController | undefined;
let hiddenAt = 0;
let expiry: ReturnType<typeof setTimeout> | undefined;

function clear() {
  entry = undefined;
  delete document.documentElement.dataset.prefetchedLesson;
  clearTimeout(expiry);
  expiry = undefined;
  request?.abort();
  request = undefined;
}
if (typeof window !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      request?.abort();
    } else if (hiddenAt && Date.now() - hiddenAt >= MAX_AGE) clear();
  });
  window.addEventListener("lh:profile-change", clear);
}

export function takePrefetched(owner: string, learner: string | null, id: string): unknown {
  performance.mark("f3:data-take");
  const value = entry;
  entry = undefined;
  delete document.documentElement.dataset.prefetchedLesson;
  clearTimeout(expiry);
  expiry = undefined;
  if (!value || value.owner !== owner || value.learner !== learner || value.id !== id || Date.now() - value.at >= MAX_AGE || (hiddenAt && document.hidden && Date.now() - hiddenAt >= MAX_AGE)) return undefined;
  return value.value;
}

export function prefetchLesson(owner: string, learner: string | null, id: string) {
  clear();
  if (document.hidden) return;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? "")) return;
  const controller = new AbortController();
  request = controller;
  const query = new URLSearchParams(learner ? { learner } : {});
  query.set("view", "reader");
  performance.mark("f3:chunk-import-start");
  void import("../lesson-v2/reader").then(module => {
    window.__lhLessonReader = module.LessonReader;
    performance.mark("f3:chunk-import-ready");
  }, () => {});
  void fetch(`/api/lessons/${encodeURIComponent(id)}?${query}`, { cache: "no-store", signal: controller.signal })
    .then(async response => response.ok ? response.json() : undefined)
    .then(value => { if (value && !controller.signal.aborted && !document.hidden) {
      entry = { owner, learner, id, at: Date.now(), value };
      document.documentElement.dataset.prefetchedLesson = id;
      expiry = setTimeout(clear, MAX_AGE);
    } })
    .catch(() => {});
}
