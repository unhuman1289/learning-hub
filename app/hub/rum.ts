import {
  rumConnections, rumMaxMs, rumMaxSamples, type RumSample, type RumScreen,
} from "../../lib/rum-contract";

const queued: RumSample[] = [];
let timer: number | undefined;
let navigation: { screen: RumScreen; started: number } | undefined;

export function startRumNavigation(screen?: RumScreen) {
  navigation = screen ? { screen, started: performance.now() } : undefined;
}

export function rumNavigationStart(screen: RumScreen) {
  return navigation?.screen === screen ? navigation.started : 0;
}

function flushRum() {
  window.clearTimeout(timer);
  timer = undefined;
  if (!queued.length) return;
  const batch = queued.splice(0, rumMaxSamples);
  try {
    navigator.sendBeacon("/api/rum", new Blob([JSON.stringify(batch)], { type: "application/json" }));
  } catch { /* Metrics must not interrupt learning. */ }
}

// Call with performance.now() from the initiating action. For audio, finish
// from the playing event. For tutoring, finish when the first text is visible.
export function finishRum(screen: RumScreen, started: number) {
  const ms = Math.round(performance.now() - started);
  if (!navigator.sendBeacon || !Number.isFinite(ms) || ms < 0 || ms > rumMaxMs) return;
  const nav = navigator as Navigator & { connection?: { effectiveType?: string }; userAgentData?: { mobile: boolean } };
  const connection = rumConnections.find(type => type === nav.connection?.effectiveType) ?? "unknown";
  const phone = nav.userAgentData?.mobile ?? /Android|iPhone|iPod|Mobile/i.test(nav.userAgent);
  queued.push({ screen, ms, connection, device: phone ? "phone" : "computer" });
  window.addEventListener("pagehide", flushRum);
  if (queued.length === rumMaxSamples) flushRum();
  else timer ??= window.setTimeout(flushRum, 1_000);
}

// Wait for the committed UI to reach a frame before measuring. Hidden tabs
// are skipped so time spent away does not count towards the interaction.
export function rumAfterPaint(screen: RumScreen, started: number, onMeasured?: () => void) {
  if (document.hidden) return;
  let frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(() => {
      finishRum(screen, started);
      onMeasured?.();
      cleanup();
    });
  });
  function cleanup() {
    cancelAnimationFrame(frame);
    document.removeEventListener("visibilitychange", cleanup);
  }
  document.addEventListener("visibilitychange", cleanup);
  return cleanup;
}
