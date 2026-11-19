"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { berlinClock, deviceClock, skyClock, typicalWeather, type BerlinClock, type Moon, type Weather } from "../../../lib/lubeck/sky";
import { deskItem, shelfItem } from "./items";
import type { mountScene } from "./scene";

type Ambient = { weather: Weather | null; moon: Moon | null };
const AMBIENT_REFRESH = 30 * 60 * 1000;
/** The window is repainted every two minutes: smooth enough for dusk, and almost no work in between. */
export const SKY_REFRESH = 2 * 60 * 1000;

/** The device clock, read as Lübeck time (or, with `deviceClock`, in the device's own zone); empty until mounted so server and client markup agree. */
export function useBerlinClock(interval = SKY_REFRESH, read: (now: Date) => BerlinClock = berlinClock) {
  const [clock, setClock] = useState<BerlinClock>();
  useEffect(() => {
    const update = () => setClock(read(new Date()));
    update();
    const timer = window.setInterval(update, interval);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [interval, read]);
  return clock;
}

/** The learner's own date and hour. */
export function useDeviceClock(interval = SKY_REFRESH) {
  return useBerlinClock(interval, deviceClock);
}

/** The clock the window is drawn with: the learner's date and hour against Lübeck's day (see `skyClock`). */
export function useSkyClock(interval = SKY_REFRESH) {
  const lubeck = useBerlinClock(interval);
  const device = useDeviceClock(interval);
  return useMemo(() => (lubeck && device ? skyClock(lubeck, device) : undefined), [lubeck, device]);
}

/**
 * The study window: old Lübeck at this hour, in today's weather and this month's dress. Decoration only,
 * hidden from assistive technology. `onDarkness` lets the room light its lamp after dusk.
 */
export function LubeckWindow({ clock, onDarkness, className, weather, waitingForDesk = false }: {
  clock: BerlinClock | undefined; onDarkness?: (darkness: number) => void; className?: string;
  waitingForDesk?: boolean;
  /** Preview only: show this weather instead of asking for today's. */
  weather?: Weather;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const draw = useRef<ReturnType<typeof mountScene>>(null);
  const [ambient, setAmbient] = useState<Ambient>({ weather: null, moon: null });

  const previewing = weather !== undefined;
  useEffect(() => {
    const windowSvg = svg.current;
    if (!windowSvg) return;
    let inView = true;
    const connection = (navigator as Navigator & { connection?: EventTarget & { saveData?: boolean } }).connection;
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const syncMotion = () => windowSvg.toggleAttribute(
      "data-motion-paused", document.hidden || !inView || connection?.saveData === true || (memory !== undefined && memory <= 2),
    );
    connection?.addEventListener("change", syncMotion);
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      syncMotion();
    });
    observer.observe(windowSvg);
    document.addEventListener("visibilitychange", syncMotion);
    syncMotion();
    return () => {
      observer.disconnect();
      connection?.removeEventListener("change", syncMotion);
      document.removeEventListener("visibilitychange", syncMotion);
    };
  }, []);

  useEffect(() => {
    if (previewing) return;
    let alive = true;
    const load = () => {
      if (document.hidden) return;
      fetch("/api/ambient")
        .then((response) => (response.ok ? (response.json() as Promise<Ambient>) : null))
        .then((value) => {
          if (alive && value) setAmbient({ weather: value.weather, moon: value.moon });
        })
        // Without the services the window keeps the season's usual weather and a computed moon.
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, AMBIENT_REFRESH);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [previewing]);

  useEffect(() => {
    if (!svg.current || !clock || document.hidden || waitingForDesk) return;
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (draw.current && memory !== undefined && memory <= 2) return;
    const node = svg.current;
    let active = true;
    const paint = async () => {
      if (!active) return;
      const { mountScene } = await import("./scene");
      if (!active) return;
      draw.current ??= mountScene(node);
      const darkness = draw.current({
        hour: clock.hour,
        month: clock.month,
        day: clock.day,
        offsetHours: clock.offsetHours,
        weather: weather ?? ambient.weather ?? typicalWeather(clock.month),
        moon: previewing ? null : ambient.moon,
      });
      onDarkness?.(darkness);
    };
    const drawScene = () => { void paint().catch(() => {}); };
    let idle: number | undefined;
    let observer: IntersectionObserver | undefined;
    // Start the delay after the desk has its lesson data, then let higher priority work finish.
    const timer = draw.current ? undefined : window.setTimeout(() => {
      if (typeof window.requestIdleCallback === "function") {
        idle = window.requestIdleCallback(drawScene, { timeout: 1000 });
      } else {
        observer = new IntersectionObserver(entries => {
          if (!entries.some(entry => entry.isIntersecting)) return;
          observer?.disconnect();
          drawScene();
        }, { rootMargin: "200px" });
        observer.observe(node);
      }
    }, 3000);
    if (draw.current) drawScene();
    return () => {
      active = false;
      window.clearTimeout(timer);
      observer?.disconnect();
      if (idle !== undefined) window.cancelIdleCallback(idle);
    };
  }, [clock, ambient, onDarkness, weather, previewing, waitingForDesk]);

  return <svg ref={svg} aria-hidden="true" viewBox="26 12 628 336" className={`lhw-window ${className ?? ""}`} style={{ display: "block", width: "100%" }} />;
}

/** This month's small object for the desk or the bookcase. */
export function SeasonItem({ place, month, className }: { className?: string; place: "desk" | "shelf"; month: number | undefined }) {
  const markup = useMemo(() => (month ? (place === "desk" ? deskItem(month) : shelfItem(month)) : ""), [place, month]);
  if (!markup) return null;
  return place === "desk"
    ? <svg aria-hidden="true" viewBox="-28 -62 56 68" className={className ?? "h-14 w-12 shrink-0 sm:h-16 sm:w-14"} dangerouslySetInnerHTML={{ __html: markup }} />
    : <svg aria-hidden="true" viewBox="-16 -46 32 48" className="block h-11 w-8" dangerouslySetInnerHTML={{ __html: markup }} />;
}
