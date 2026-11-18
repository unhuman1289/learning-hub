"use client";

import { useEffect, useRef, useState } from "react";
import { SketchIcon } from "./sketch-icons";
import { buttonClass } from "./ui";
import type { StudyClock } from "./use-study-clock";

const presets = [30, 45, 60, 90, 120];

/**
 * Minutes studied today on the oak bar in the top bar. Counted automatically while a notebook
 * is open. Hover or focus shows the breakdown; pressing it lets the learner change the daily target.
 */
export function StudyMeter({ clock, labelFor }: { clock: StudyClock; labelFor: (key: string) => string }) {
  const { minutes, byTrack, targetMinutes, counting } = clock;
  const [editing, setEditing] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const note = editing ? undefined : "study-meter-note";
  const reached = minutes >= targetMinutes;

  useEffect(() => {
    if (!editing) return;
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !wrapper.current?.contains(event.target as Node)) setEditing(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [editing]);

  return (
    <div ref={wrapper} className="group relative">
      <button
        type="button"
        aria-expanded={editing}
        aria-describedby={note}
        aria-label={`Đã học hôm nay ${minutes} trên ${targetMinutes} phút${counting ? ", đang tính giờ" : ""}. Đổi mục tiêu`}
        onClick={() => setEditing((open) => !open)}
        className="notebook-button notebook-ghost notebook-wood whitespace-nowrap tabular-nums"
      >
        <SketchIcon name="hourglass" size={17} />
        <span>{minutes}/{targetMinutes} phút</span>
      </button>

      {/* Tooltip: a small paper slip hanging from the bar (hidden while the target is being edited). */}
      {!editing && (
        <div
          id="study-meter-note"
          role="tooltip"
          className="postit invisible absolute right-0 top-full z-30 mt-3 w-64 rotate-1 rounded-[1px] bg-postit-yellow p-3.5 text-left opacity-0 transition-[opacity,translate,visibility] duration-200 -translate-y-1 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100"
        >
          <p className="font-hand text-lg leading-6">Đã học hôm nay: {minutes} / {targetMinutes} phút{reached ? " ✓" : ""}</p>
          {byTrack.length ? (
            <ul className="mt-1.5 grid gap-0.5 font-hand text-base leading-5">
              {byTrack.map((item) => (
                <li key={item.track} className="flex justify-between gap-3"><span>{labelFor(item.track)}</span><span className="tabular-nums">{item.minutes} phút</span></li>
              ))}
            </ul>
          ) : <p className="mt-1 font-hand text-base leading-5 opacity-80">Chưa mở cuốn sổ nào hôm nay.</p>}
          <p className="mt-2 border-t border-postit-ink/20 pt-2 text-xs leading-5 opacity-80">
            Đồng hồ chạy khi bạn mở sổ. Bấm để đổi mục tiêu.
          </p>
          {clock.error && <p className="mt-1 text-xs font-semibold text-brick">{clock.error} Sẽ thử lưu lại.</p>}
        </div>
      )}

      {editing && <TargetEditor key={targetMinutes} clock={clock} onDone={() => setEditing(false)} />}
    </div>
  );
}

function TargetEditor({ clock, onDone }: { clock: StudyClock; onDone: () => void }) {
  const [value, setValue] = useState(String(clock.targetMinutes));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.select(), []);
  const minutes = Number(value);
  const valid = Number.isInteger(minutes) && minutes >= 5 && minutes <= 720;

  async function save(next = minutes) {
    setBusy(true);
    setError("");
    try {
      await clock.setTarget(next);
      onDone();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      role="dialog"
      aria-label="Mục tiêu học mỗi ngày"
      onSubmit={(event) => { event.preventDefault(); if (valid) void save(); }}
      className="postit absolute right-0 top-full z-30 mt-3 w-72 animate-sheet-in rounded-[1px] bg-postit-yellow p-4 text-left"
    >
      <label htmlFor="study-target" className="font-hand text-lg leading-6">Mục tiêu mỗi ngày</label>
      <div className="mt-2 flex items-center gap-2">
        <input
          ref={input}
          id="study-target"
          type="number"
          inputMode="numeric"
          min={5}
          max={720}
          step={5}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="w-24 border-0 border-b-2 border-postit-ink/40 bg-transparent px-1 text-xl font-semibold tabular-nums text-postit-ink focus:border-brick"
        />
        <span className="font-hand text-lg">phút</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Chọn nhanh">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={busy}
            aria-pressed={minutes === preset}
            onClick={() => setValue(String(preset))}
            className="notebook-button notebook-choice"
          >
            {preset}
          </button>
        ))}
      </div>
      {!valid && <p className="mt-2 text-xs text-brick">Từ 5 đến 720 phút.</p>}
      {error && <p role="alert" className="mt-2 text-xs font-semibold text-brick">{error}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button type="submit" disabled={!valid || busy} className={buttonClass("primary", "min-h-11 px-3")}>{busy ? "Đang lưu…" : "Lưu mục tiêu"}</button>
        <button type="button" onClick={onDone} className={buttonClass("secondary", "text-postit-ink")}>Huỷ</button>
      </div>
    </form>
  );
}
