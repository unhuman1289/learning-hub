"use client";

import { useEffect, useState } from "react";

export type RunnerStatus = { online: boolean; lastSeenAt: string | null };

/** Asks every minute, only while something waits for the grading Mac. */
export function useRunnerStatus(waiting: boolean) {
  const [status, setStatus] = useState<RunnerStatus | null>(null);
  useEffect(() => {
    if (!waiting) return;
    let live = true;
    const load = () =>
      fetch("/api/runner-status", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<RunnerStatus>) : null))
        .then((value) => {
          if (live && value) setStatus(value);
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 60000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [waiting]);
  return waiting ? status : null;
}

const time = (iso: string) =>
  new Intl.DateTimeFormat("vi-VN", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(
    new Date(iso),
  );

/** Said plainly when work waits because the family Mac is off; nothing is claimed about when it returns. */
export function GraderOffline({ waiting, what = "Bài" }: { waiting: boolean; what?: string }) {
  const status = useRunnerStatus(waiting);
  if (!status || status.online) return null;
  return (
    <p
      role="status"
      className="rounded border border-amber-700/40 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
    >
      Máy chấm đang tắt{status.lastSeenAt ? ` (lần cuối ${time(status.lastSeenAt)})` : ""}. {what} sẽ được xử lý khi máy bật lại; câu trả lời đã được
      lưu.
    </p>
  );
}
