"use client";

import { useCallback, useEffect, useRef, useState } from "react";
/** A legacy track name or a notebook id (`sub_…`), as accepted by /api/study. */
type TrackId = string;

type StudyDay = { day: string; targetMinutes: number; seconds: Partial<Record<TrackId, number>> };

/** Measure in small steps so the ruler grows steadily. */
const TICK_MS = 5_000;
/** Report to the server about every 30 seconds, and whenever the notebook is closed or the tab hidden. */
const FLUSH_MS = 30_000;
/** No mouse, key, scroll or touch for this long: the open notebook is no longer being studied. */
const IDLE_MS = 10 * 60_000;
/** The server accepts at most two minutes per report. */
const MAX_REPORT = 120;

/**
 * Counts study time automatically while a notebook is open, the tab is visible and the learner
 * has interacted within the last ten minutes, and stores it on the server per account and Berlin
 * day. Seconds not yet confirmed by the server are shown too and retried on the next report.
 */
export function useStudyClock(
  track: TrackId | null, loadStudy = true, deskStudy?: StudyDay, refreshDesk?: () => Promise<void>, lessonStudy?: StudyDay,
) {
  const [server, setServer] = useState<StudyDay | null>(null);
  const [pending, setPending] = useState<Partial<Record<TrackId, number>>>({});
  const [counting, setCounting] = useState(false);
  const [error, setError] = useState("");
  const pendingRef = useRef<Partial<Record<TrackId, number>>>({});
  const lastActivity = useRef(0);
  const lastTick = useRef(0);
  const flushing = useRef(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/study", { cache: "no-store" });
      const body = await response.json() as StudyDay & { error?: string };
      if (!response.ok) throw Error(body.error);
      setServer(body);
    } catch {
      // The meter shows local seconds until the server answers.
    }
  }, []);

  useEffect(() => {
    if (loadStudy) void Promise.resolve().then(load);
  }, [load, loadStudy]);

  useEffect(() => { if (lessonStudy) void Promise.resolve(lessonStudy).then(setServer); }, [lessonStudy]);

  const addPending = useCallback((id: TrackId, seconds: number) => {
    const next = { ...pendingRef.current, [id]: (pendingRef.current[id] ?? 0) + seconds };
    pendingRef.current = next;
    setPending(next);
  }, []);

  const flush = useCallback(async (keepalive = false) => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      for (const [id, total] of Object.entries(pendingRef.current) as [TrackId, number][]) {
        let left = Math.floor(total);
        while (left >= 1) {
          const seconds = Math.min(left, MAX_REPORT);
          const response = await fetch("/api/study", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ track: id, seconds }),
            keepalive,
          });
          const body = await response.json().catch(() => null) as (StudyDay & { error?: string }) | null;
          if (!response.ok || !body) throw Error(body?.error || "Chưa lưu được thời gian học.");
          // Confirmed: move these seconds from "pending" into the server total.
          addPending(id, -seconds);
          setServer(body);
          left -= seconds;
        }
      }
      setError("");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      flushing.current = false;
    }
  }, [addPending]);

  useEffect(() => {
    const touch = () => {
      lastActivity.current = Date.now();
    };
    touch();
    const events = ["pointermove", "pointerdown", "keydown", "wheel", "scroll", "touchstart"] as const;
    for (const name of events) window.addEventListener(name, touch, { passive: true });
    return () => {
      for (const name of events) window.removeEventListener(name, touch);
    };
  }, []);

  useEffect(() => {
    if (!track) {
      void Promise.resolve().then(() => setCounting(false));
      return;
    }
    lastTick.current = Date.now();
    const tick = () => {
      const now = Date.now();
      const active = document.visibilityState === "visible" && now - lastActivity.current < IDLE_MS;
      // A long gap means the computer slept or the tab was throttled; never count more than two steps.
      const elapsed = Math.min(now - lastTick.current, TICK_MS * 2) / 1000;
      lastTick.current = now;
      setCounting(active);
      if (active && elapsed > 0) addPending(track, elapsed);
    };
    const ticker = window.setInterval(tick, TICK_MS);
    const flusher = window.setInterval(() => void flush(), FLUSH_MS);
    const onHide = () => {
      tick();
      if (document.visibilityState === "hidden") void flush(true);
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    void Promise.resolve().then(() => setCounting(document.visibilityState === "visible"));
    return () => {
      tick();
      void flush(true);
      window.clearInterval(ticker);
      window.clearInterval(flusher);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [track, addPending, flush]);

  const setTarget = useCallback(async (targetMinutes: number) => {
    const response = await fetch("/api/study", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetMinutes }),
    });
    const body = await response.json().catch(() => null) as (StudyDay & { error?: string }) | null;
    if (!response.ok || !body) throw Error(body?.error || "Chưa lưu được mục tiêu.");
    setServer(body);
    await refreshDesk?.();
  }, [refreshDesk]);

  const confirmed = deskStudy ?? server;
  const ids = new Set([...Object.keys(confirmed?.seconds ?? {}), ...Object.keys(pending)]) as Set<TrackId>;
  const secondsByTrack = [...ids]
    .map((id) => ({ track: id, seconds: (confirmed?.seconds[id] ?? 0) + Math.max(0, pending[id] ?? 0) }))
    .filter((item) => item.seconds >= 1)
    .sort((a, b) => b.seconds - a.seconds);
  const seconds = secondsByTrack.reduce((total, item) => total + item.seconds, 0);
  return {
    loaded: !!confirmed,
    seconds,
    minutes: Math.floor(seconds / 60),
    byTrack: secondsByTrack.map((item) => ({ track: item.track, minutes: Math.floor(item.seconds / 60) })),
    targetMinutes: confirmed?.targetMinutes ?? 60,
    counting: counting && !!track,
    error,
    setTarget,
  };
}

export type StudyClock = ReturnType<typeof useStudyClock>;
