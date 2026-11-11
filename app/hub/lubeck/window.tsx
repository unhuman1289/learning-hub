"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { berlinClock, typicalWeather, type BerlinClock, type Moon, type Weather } from "../../../lib/lubeck/sky";
import { deskItem, shelfItem } from "./items";
import { mountScene } from "./scene";

type Ambient = { weather: Weather | null; moon: Moon | null };
const AMBIENT_REFRESH = 30 * 60 * 1000;

/** The device clock, read as Lübeck time; empty until mounted so server and client markup agree. */
export function useBerlinClock(interval = 30000) {
  const [clock, setClock] = useState<BerlinClock>();
  useEffect(() => {
    const update = () => setClock(berlinClock(new Date()));
    update();
    const timer = window.setInterval(update, interval);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [interval]);
  return clock;
}

/**
 * The study window: old Lübeck at this hour, in today's weather and this month's dress. Decoration only,
 * hidden from assistive technology. `onDarkness` lets the room light its lamp after dusk.
 */
export function LubeckWindow({ clock, onDarkness, className, weather }: {
  clock: BerlinClock | undefined; onDarkness?: (darkness: number) => void; className?: string;
  /** Preview only: show this weather instead of asking for today's. */
  weather?: Weather;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const draw = useRef<ReturnType<typeof mountScene>>(null);
  const [ambient, setAmbient] = useState<Ambient>({ weather: null, moon: null });

  const previewing = weather !== undefined;
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
    if (!svg.current || !clock) return;
    draw.current ??= mountScene(svg.current);
    const darkness = draw.current({
      hour: clock.hour,
      month: clock.month,
      day: clock.day,
      offsetHours: clock.offsetHours,
      weather: weather ?? ambient.weather ?? typicalWeather(clock.month),
      moon: previewing ? null : ambient.moon,
    });
    onDarkness?.(darkness);
  }, [clock, ambient, onDarkness, weather, previewing]);

  return <svg ref={svg} aria-hidden="true" viewBox="26 12 628 336" className={className} style={{ display: "block", width: "100%" }} />;
}

/** This month's small object for the desk or the bookcase. */
export function SeasonItem({ place, month }: { place: "desk" | "shelf"; month: number | undefined }) {
  const markup = useMemo(() => (month ? (place === "desk" ? deskItem(month) : shelfItem(month)) : ""), [place, month]);
  if (!markup) return null;
  return place === "desk"
    ? <svg aria-hidden="true" viewBox="-28 -62 56 68" className="h-14 w-12 shrink-0 sm:h-16 sm:w-14" dangerouslySetInnerHTML={{ __html: markup }} />
    : <svg aria-hidden="true" viewBox="-16 -46 32 48" className="block h-11 w-8" dangerouslySetInnerHTML={{ __html: markup }} />;
}

const MONTHS = ["Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"];

/** Tear-off calendar leaf with today's date in Lübeck. */
export function CalendarLeaf({ clock }: { clock: BerlinClock | undefined }) {
  return (
    <time className="grid w-[4.5rem] shrink-0 overflow-hidden rounded-[3px] bg-paper text-center text-ink shadow-page" aria-label={clock ? `${clock.weekday}, ngày ${clock.day} ${MONTHS[clock.month - 1].toLowerCase()}` : undefined}>
      <span className="bg-brick py-0.5 text-xs font-semibold text-white">{clock ? MONTHS[clock.month - 1] : " "}</span>
      <span className="font-print text-[2rem] font-medium leading-9 tabular-nums">{clock?.day ?? " "}</span>
      <span className="pb-1 text-[11px] leading-4 text-muted">{clock?.weekday ?? " "}</span>
    </time>
  );
}
