"use client";

import { useEffect, useState } from "react";
import { GardenWindow } from "../../components/notebook/house";
import { seasonForDeviceDate } from "./desk-season";

const dateFormat = new Intl.DateTimeFormat("vi-VN", {
  weekday: "long", day: "numeric", month: "long",
});
const clockFormat = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" });

function useDeviceNow(interval: number) {
  const [now, setNow] = useState<Date>();
  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = window.setInterval(update, interval);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [interval]);
  return now;
}

export function DeviceDate() {
  const now = useDeviceNow(1000);
  return <time className="block min-h-7 font-hand text-xl text-accent first-letter:uppercase">
    {now ? dateFormat.format(now) : null}
  </time>;
}

function DeskClock({ now }: { now?: Date }) {
  const hours = now ? now.getHours() % 12 + now.getMinutes() / 60 : 0;
  const minutes = now ? now.getMinutes() + now.getSeconds() / 60 : 0;
  const label = now ? clockFormat.format(now) : undefined;

  return <div className="grid shrink-0 justify-items-center gap-1">
    <div aria-hidden="true" className="bg-oak-v grid size-[5.25rem] place-items-center rounded-full border-2 border-oak-dark p-1.5 shadow-furniture sm:size-24">
      <div className="relative size-full rounded-full border border-stone bg-paper-2 text-ink shadow-inner">
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} className="absolute inset-0" style={{ rotate: `${i * 30}deg` }}>
            <span className={`absolute left-1/2 top-[8%] -translate-x-1/2 rounded-sm bg-current ${i % 3 === 0 ? "h-[9%] w-0.5" : "h-[4%] w-px opacity-60"}`} />
          </span>
        ))}
        {now && <>
          <span className="absolute bottom-1/2 left-1/2 h-[26%] w-1 origin-bottom -translate-x-1/2 rounded-t-full bg-current" style={{ rotate: `${hours * 30}deg` }} />
          <span className="absolute bottom-1/2 left-1/2 h-[34%] w-0.5 origin-bottom -translate-x-1/2 rounded-t-full bg-current" style={{ rotate: `${minutes * 6}deg` }} />
          <span className="absolute bottom-1/2 left-1/2 h-[36%] w-px origin-bottom -translate-x-1/2 bg-brick" style={{ rotate: `${now.getSeconds() * 6}deg` }} />
        </>}
        <span className="absolute left-1/2 top-1/2 size-1.5 -translate-1/2 rounded-full bg-stone ring-1 ring-oak-dark" />
      </div>
    </div>
    <time className="text-xs tabular-nums text-muted" aria-label={label ? `Giờ trên thiết bị: ${label}` : "Giờ trên thiết bị"}>{label ?? "–:–"}</time>
  </div>;
}

function RainOnGlass() {
  return <div aria-hidden="true" className="pointer-events-none absolute inset-[6px] overflow-hidden bg-[linear-gradient(165deg,rgba(63,84,102,0.48),rgba(158,170,177,0.14))]">
    <div className="absolute inset-x-0 bottom-0 h-2/3 bg-[#3e505a]/60 [clip-path:polygon(0_70%,8%_53%,16%_68%,25%_37%,34%_58%,42%_41%,49%_58%,58%_23%,65%_55%,73%_40%,81%_64%,89%_47%,100%_70%,100%_100%,0_100%)]" />
    <span className="absolute bottom-[15%] left-[58%] h-1.5 w-1 rounded-sm bg-amber-200/85" />
    <span className="absolute bottom-[15%] left-[73%] h-1.5 w-1 rounded-sm bg-amber-200/85" />
    <div className="absolute inset-0 bg-[repeating-linear-gradient(113deg,transparent_0_12px,rgba(234,243,248,0.36)_13px,transparent_14px_22px)] opacity-75" />
  </div>;
}

function WindowLantern() {
  return <div aria-hidden="true" className="relative mb-2 grid w-7 shrink-0 justify-items-center">
    <span className="h-2 w-3 rounded-t-full border-2 border-oak-dark dark:border-stone" />
    <span className="z-10 -mt-px h-1.5 w-7 rounded-t-md bg-oak-dark dark:bg-stone" />
    <span className="relative grid h-7 w-5 place-items-center rounded-b-sm border-2 border-oak-dark bg-amber-100 shadow-[0_2px_16px_rgba(217,154,58,0.38)] dark:border-stone">
      <span className="mt-2 h-3 w-1.5 rounded-t-full rounded-b-sm bg-amber-500" />
    </span>
    <span className="h-1.5 w-7 rounded-b-sm bg-oak-dark dark:bg-stone" />
  </div>;
}

export function DeskDecor() {
  const now = useDeviceNow(1000);
  const season = seasonForDeviceDate(now);

  return <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
    <DeskClock now={now} />
    <div className="relative hidden h-[6.5rem] w-36 md:block">
      <GardenWindow className="h-full w-full" />
      {season?.rain && <RainOnGlass />}
    </div>
    {season?.lantern && <WindowLantern />}
  </div>;
}

export function FurnitureDecor({ place }: { place: "desk" | "bookcase" }) {
  const season = seasonForDeviceDate(useDeviceNow(15000));
  if (place === "desk") {
    return season?.mug ? <span aria-hidden="true" className="relative mr-1 inline-block h-8 w-10 shrink-0">
      <span className="absolute bottom-0 left-0 h-1.5 w-9 rounded-[50%] bg-[#4b2c20]/60 blur-[1px]" />
      <span className="absolute bottom-2 right-1 h-3 w-3 rounded-r-full border-2 border-[#d3a18a]" />
      <span className="absolute bottom-1 left-1 h-5 w-6 rounded-b-[7px] border border-[#a46c58] bg-[linear-gradient(100deg,#dca58a,#ad6551)]" />
      <span className="absolute bottom-[1.375rem] left-1 h-2 w-6 rounded-[50%] border-2 border-[#e9bda6] bg-[#604235]" />
    </span> : null;
  }
  return season?.pineSprig ? <span aria-hidden="true" className="relative block h-5 w-14 rotate-[-7deg]">
    <span className="absolute bottom-1.5 left-1 h-0.5 w-12 rotate-[-10deg] rounded-full bg-[#65432e]" />
    {[0, 1, 2, 3].map(index => <span key={index} className="absolute bottom-1.5 h-3 w-3"
      style={{ left: `${10 + index * 8}px`, bottom: `${4 + index}px` }}>
      <span className="absolute inset-0 rounded-tl-full rounded-br-full bg-[#46694f]" />
      <span className="absolute inset-0 translate-y-1 rotate-45 rounded-tl-full rounded-br-full bg-[#274e40]" />
    </span>)}
    <span className="absolute bottom-1.5 left-3 size-1.5 rounded-full bg-[#aa4b3c] ring-1 ring-[#6e3829]" />
  </span> : null;
}
