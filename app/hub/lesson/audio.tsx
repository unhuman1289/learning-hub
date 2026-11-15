"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { PaperConfirm } from "../paper-confirm";
import { pencilLink } from "../paper-bits";
import { revealTranscript, type ListeningAudio, type ListeningItem, type Voice } from "./listen-api";

type PlayState = "idle" | "starting" | "playing" | "paused" | "retry";
type PlayAttempt = { slow: boolean; retry: boolean };
const transport = "stone inline-flex min-h-14 min-w-14 items-center justify-center gap-2 px-3 text-sm font-medium";
const link = pencilLink + " min-h-11 text-sm";

export type ListeningControls = {
  item: ListeningItem;
  voice: Voice;
  asText: boolean;
  voiceSaving: boolean;
  voiceError: string;
  onVoice: (voice: Voice) => void;
  plays: number;
  onPlayed: (slow: boolean) => Promise<void>;
  playSaving: boolean;
  nextSrc?: string;
  answered: boolean;
};

function clock(seconds: number) {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function LessonAudio({ audio, ...controls }: { audio: ListeningAudio } & ListeningControls) {
  if (controls.asText) return <AudioTranscript audio={audio} item={controls.item} automatic />;
  const src = audio.src?.[controls.voice];
  return <>
    {src ? <Player key={src} audio={audio} src={src} {...controls} /> :
      <p className="text-sm text-muted-paper">Âm thanh chưa sẵn sàng</p>}
    {audio.transcript === "after_answer" && !controls.item.readOnly &&
      <AudioTranscript audio={audio} item={controls.item} answered={controls.answered} />}
  </>;
}

function Player({ audio, src, item, voice, voiceSaving, voiceError, onVoice, plays, onPlayed, playSaving, nextSrc }:
  { audio: ListeningAudio; src: string } & ListeningControls) {
  const media = useRef<HTMLAudioElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const attempt = useRef<PlayAttempt | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [state, setState] = useState<PlayState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [recordError, setRecordError] = useState(false);
  const remaining = Math.max(0, audio.maxPlays - plays);

  useEffect(() => {
    const player = media.current;
    const root = panel.current;
    if (!player || !root) return;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      // Keep the displayed element at preload=none. These requests warm the media cache.
      for (const url of new Set([src, nextSrc])) {
        if (url) void fetch(url, { headers: { Range: "bytes=0-" }, signal: controller.signal }).then(
          response => response.arrayBuffer(), () => undefined,
        ).catch(() => {});
      }
    });
    const controller = new AbortController();
    observer.observe(root);
    return () => {
      observer.disconnect();
      controller.abort();
      clearTimeout(timeout.current);
      player.pause();
    };
  }, [src, nextSrc]);

  function failed() {
    clearTimeout(timeout.current);
    setState("retry");
    media.current?.pause();
  }

  function waitForPlayback() {
    clearTimeout(timeout.current);
    timeout.current = setTimeout(failed, 12_000);
  }

  function start(slow = false, restart = false) {
    const player = media.current;
    if (!player || state === "starting" || playSaving) return;
    const retry = state === "retry" && !!attempt.current;
    if (retry && player.error) player.load();
    if (state !== "paused" || restart || slow) {
      attempt.current = { slow: slow || (retry && !!attempt.current?.slow), retry };
      player.currentTime = 0;
      setElapsed(0);
    }
    player.playbackRate = attempt.current?.slow ? 0.8 : audio.rate;
    player.preservesPitch = true;
    setState("starting");
    waitForPlayback();
    void player.play().catch(error => {
      if (error.name !== "AbortError") failed();
    });
  }

  function toggle() {
    if (state === "playing" || state === "starting") {
      clearTimeout(timeout.current);
      setState("paused");
      media.current?.pause();
    } else start();
  }

  const shortcut = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.repeat || event.altKey || event.ctrlKey || event.metaKey ||
        event.shiftKey || !(event.target instanceof Element) ||
        event.target.closest("input, textarea, select, [contenteditable], [role=alertdialog]")) return;
    if (event.code === "Space" && !event.target.closest("button, a, summary")) {
      event.preventDefault();
      toggle();
    } else if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      start(false, true);
    }
  });
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => shortcut(event);
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);

  function finished() {
    clearTimeout(timeout.current);
    const current = attempt.current;
    attempt.current = null;
    setState("idle");
    if (!current || current.retry) return;
    setRecordError(false);
    void onPlayed(current.slow).catch(() => setRecordError(true));
  }

  const active = state === "playing" || state === "starting";
  const playLabel = active ? "Tạm dừng" : state === "retry" ? "Phát lại" : state === "paused" ? "Nghe tiếp" :
    remaining === 0 ? "Nghe thêm (tính là gợi ý)" : "Phát âm thanh";
  const duration = (audio.durationMs ?? 0) / 1000;
  return <div ref={panel} className="grid gap-1">
    <audio
      ref={media} src={src} preload="none"
      onPlaying={() => { clearTimeout(timeout.current); setState("playing"); }}
      onWaiting={event => { if (attempt.current && !event.currentTarget.paused) waitForPlayback(); }}
      onPause={event => { if (state === "playing" && !event.currentTarget.ended) failed(); }}
      onTimeUpdate={event => setElapsed(event.currentTarget.currentTime)}
      onEnded={finished}
      onError={() => { if (attempt.current) failed(); }}
    />
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button type="button" className={transport} onClick={toggle} disabled={playSaving}>
        {active ? <Pause size={18} aria-hidden /> : state === "retry" ? <RotateCcw size={18} aria-hidden /> :
          <Play size={18} aria-hidden />}
        {playLabel}
      </button>
      <div role="group" aria-label="Giọng đọc" className="flex items-center text-sm text-muted-paper">
        <span>Giọng:</span>
        {(["f", "m"] as const).map(v => <button type="button" key={v} aria-pressed={v === voice}
          className={link + " min-w-11 px-1 aria-pressed:font-bold aria-pressed:underline"} disabled={voiceSaving || item.readOnly}
          onClick={() => onVoice(v)}>{v === "f" ? "Nữ" : "Nam"}</button>)}
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-x-3">
      <p role="status" className="text-sm text-muted-paper">
        {playSaving ? "Đang ghi lượt nghe…" : state === "starting" ? "Đang mở âm thanh…" : state === "playing" ? "Đang phát" :
          state === "retry" ? "Âm thanh bị gián đoạn." :
          remaining === 0 ? "Đã hết lượt nghe" : `Còn ${remaining} lượt nghe`}
      </p>
      {state === "playing" && <span aria-hidden="true" className="text-sm tabular-nums text-muted-paper">
        {clock(elapsed)}{duration > 0 && ` / ${clock(duration)}`}
      </span>}
      <button type="button" disabled={playSaving || state === "starting" || state === "retry"}
        className={link + " disabled:opacity-60"} onClick={() => start(true, true)}>Chậm hơn</button>
    </div>
    {(voiceError || recordError) && <p role="status" className="text-sm text-muted-paper">
      {voiceError || "Chưa ghi được lượt nghe."}
    </p>}
  </div>;
}

function AudioTranscript({ audio, item, answered = false, automatic = false }:
  { audio: ListeningAudio; item: ListeningItem; answered?: boolean; automatic?: boolean }) {
  const [transcript, setTranscript] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [request, setRequest] = useState(0);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!automatic && request === 0) return;
    let active = true;
    function unavailable() {
      if (active) setStatus("Lời thoại chưa sẵn sàng.");
    }
    void revealTranscript({ lessonId: item.lessonId, itemId: item.itemId, readOnly: item.readOnly }).then(text => {
      if (!text) unavailable();
      else if (active) { setTranscript(text); setStatus(""); }
    }, unavailable);
    return () => { active = false; };
  }, [automatic, request, item.lessonId, item.itemId, item.readOnly]);

  function load() {
    setConfirm(false);
    setStatus("Đang tải lời thoại…");
    setRequest(previous => previous + 1);
  }

  if (transcript) return <div className="border-y border-rule py-1">
    <p className="font-hand text-lg text-muted-paper">Lời thoại</p>
    <p lang={audio.lang} className="whitespace-pre-wrap break-words">{transcript}</p>
  </div>;
  return <div>
    {!automatic && <button type="button" className={link} disabled={status === "Đang tải lời thoại…"}
      onClick={() => answered ? load() : setConfirm(true)}>Xem lời thoại</button>}
    <PaperConfirm open={confirm} message="Xem lời thoại trước khi trả lời sẽ tính là gợi ý."
      confirmLabel="Xem lời thoại" onCancel={() => setConfirm(false)} onConfirm={load} />
    {(status || automatic) && <p role="status" className="text-sm text-muted-paper">{status || "Đang tải lời thoại…"}</p>}
    {automatic && status === "Lời thoại chưa sẵn sàng." && !item.readOnly &&
      <button type="button" className={link} onClick={load}>Thử lại</button>}
  </div>;
}
