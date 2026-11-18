/** Poll only while visible. The clock continues while hidden, but no requests are made. */
export function startFeedbackPolling(options: {
  startedAt: number;
  read: () => Promise<void>;
  visible: () => boolean;
  subscribe: (change: () => void) => () => void;
  now?: () => number;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
}) {
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? setTimeout;
  const cancel = options.cancel ?? clearTimeout;
  let timer: ReturnType<typeof setTimeout> | undefined, disposed = false, inFlight = false;
  const clear = () => { if (timer !== undefined) cancel(timer); timer = undefined; };
  const next = () => {
    clear();
    if (disposed || inFlight || !options.visible()) return;
    const elapsed = Math.max(0, now() - options.startedAt);
    const delay = elapsed < 30_000 ? Math.min(2_000, 30_000 - elapsed) : 5_000;
    timer = schedule(() => { timer = undefined; void run(); }, delay);
  };
  const run = async () => {
    if (disposed || inFlight || !options.visible()) return;
    inFlight = true;
    try { await options.read(); } catch { /* Keep the last confirmed result and try again. */ }
    finally { inFlight = false; next(); }
  };
  const changed = () => { clear(); if (options.visible()) void run(); };
  const unsubscribe = options.subscribe(changed);
  next();
  return () => { disposed = true; clear(); unsubscribe(); };
}
