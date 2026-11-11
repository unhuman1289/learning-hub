"use client";

import { useState } from "react";
import type { Weather } from "../../../lib/lubeck/sky";
import { LubeckWindow, SeasonItem } from "./window";

const MONTHS = ["Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"];
const WEATHER: Record<string, [string, Weather]> = {
  clear: ["Trời quang", { cloud: 0.08, rain: false, snow: false, fog: 0 }],
  partly: ["Ít mây", { cloud: 0.45, rain: false, snow: false, fog: 0 }],
  overcast: ["U ám", { cloud: 0.92, rain: false, snow: false, fog: 0 }],
  rain: ["Mưa", { cloud: 0.92, rain: true, snow: false, fog: 0 }],
  snow: ["Tuyết", { cloud: 0.92, rain: false, snow: true, fog: 0 }],
  fog: ["Sương mù", { cloud: 0.6, rain: false, snow: false, fog: 0.55 }],
};
const clockText = (hour: number) => `${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.round((hour % 1) * 60)).padStart(2, "0")}`;

/** Admin preview of the study window at another hour, month, day and weather; changes nothing for learners. */
export function WindowPreview() {
  const [hour, setHour] = useState(16.25);
  const [month, setMonth] = useState(12);
  const [day, setDay] = useState(24);
  const [weather, setWeather] = useState("snow");
  const field = "rounded border border-line bg-paper px-2 py-1";
  return (
    <div className="grid gap-3">
      <h2 className="font-print text-2xl font-medium">Xem thử cửa sổ</h2>
      <p className="text-sm text-muted">Xem cửa sổ và đồ trang trí ở giờ, ngày và thời tiết khác. Chỉ là xem thử; bàn học của mọi người vẫn theo giờ và thời tiết thật ở Lübeck.</p>
      <LubeckWindow clock={{ hour, month, day, offsetHours: month >= 4 && month <= 10 ? 2 : 1, weekday: "" }} weather={WEATHER[weather][1]} />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex min-w-56 flex-1 items-center gap-2">Giờ
          <input type="range" min={0} max={23.75} step={0.25} value={hour} onChange={(e) => setHour(Number(e.target.value))} className="flex-1" />
          <span className="w-12 tabular-nums">{clockText(hour)}</span>
        </label>
        <label className="flex items-center gap-2">Tháng
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={field}>{MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}</select>
        </label>
        <label className="flex items-center gap-2">Ngày
          <input type="number" min={1} max={31} value={day} onChange={(e) => setDay(Math.max(1, Math.min(31, Number(e.target.value) || 1)))} className={field + " w-16"} />
        </label>
        <label className="flex items-center gap-2">Thời tiết
          <select value={weather} onChange={(e) => setWeather(e.target.value)} className={field}>{Object.entries(WEATHER).map(([key, [name]]) => <option key={key} value={key}>{name}</option>)}</select>
        </label>
      </div>
      <p className="flex items-end gap-6 text-sm text-muted">Trên bàn <SeasonItem place="desk" month={month} /> Trên tủ <SeasonItem place="shelf" month={month} /></p>
    </div>
  );
}
