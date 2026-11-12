"use client";

import { useEffect, useState } from "react";
import { pencil } from "./paper-bits";

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

/** Said plainly when work waits because the family Mac is off; nothing is claimed about when it returns. */
export function GraderOffline({ waiting }: { waiting: boolean }) {
  const status = useRunnerStatus(waiting);
  if (!status || status.online) return null;
  return <p role="status" className={pencil}>Bài đã lưu, sẽ có lời phê sau.</p>;
}
