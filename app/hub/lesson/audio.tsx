"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { FileText, Pause, Play, RotateCcw } from "lucide-react";
import { PaperConfirm } from "../paper-confirm";
import { buttonClass } from "../ui";
import { recordPlaybackSupport, revealTranscript, type ListeningAudio, type ListeningItem, type Voice } from "./listen-api";

type PlayState = "idle" | "authorizing" | "ready" | "starting" | "playing" | "paused" | "retry";
type PlayAttempt = { slow: boolean; retry: boolean };

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

export function LessonAudio({ audio, active = true, ...controls }: { audio: ListeningAudio; active?: boolean } & ListeningControls) {
  if (controls.asText) return <AudioTranscript audio={audio} item={controls.item} automatic active={active} />;
  const src = audio.src?.[controls.voice];
  return <>
    {src ? <Player key={src} audio={audio} src={src} {...controls} active={active} /> :
      <p className="text-sm text-muted-paper">Âm thanh chưa sẵn sàng</p>}
    {audio.transcript === "after_answer" && !controls.item.readOnly &&
      <AudioTranscript audio={audio} item={controls.item} answered={controls.answered} active={active} />}
  </>;
}

function Player({ audio, src, item, voice, voiceSaving, voiceError, onVoice, plays, onPlayed, playSaving, nextSrc, active }:
  { audio: ListeningAudio; src: string; active: boolean } & ListeningControls) {
  const media = useRef<HTMLAudioElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const attempt = useRef<PlayAttempt | null>(null);
  const supportSaved = useRef(false);
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [state, setState] = useState<PlayState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [slow, setSlow] = useState(false);
  const [recordError, setRecordError] = useState(false);
  const remaining = Math.max(0, audio.maxPlays - plays);

  useEffect(() => {
    if (!active) return;
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
  }, [src, nextSrc, active]);

  function failed() {
    clearTimeout(timeout.current);
    setState("retry");
    media.current?.pause();
  }

  function waitForPlayback() {
    clearTimeout(timeout.current);
    timeout.current = setTimeout(failed, 12_000);
  }

  async function start(slow = false, restart = false) {
    const player = media.current;
    if (!player || state === "starting" || state === "authorizing" || playSaving) return;
    const retry = state === "retry" && !!attempt.current;
    if (retry && player.error) player.load();
    const restartFromBeginning = (state !== "paused" && state !== "ready") || restart || slow;
    if (restartFromBeginning) {
      attempt.current = { slow: slow || (retry && !!attempt.current?.slow), retry };
    }
    const current = attempt.current;
    if (!current) return;
    setSlow(current.slow);
    const support = current.slow ? "slow" : remaining === 0 ? "extra" : null;
    const authorizing = support && !supportSaved.current && !item.readOnly;
    if (authorizing) {
      // Commit assistance before any assisted audio can be heard, including when the learner
      // submits from another tab or leaves this page before the audio ends.
      setState("authorizing");
      player.pause();
      setRecordError(false);
      try {
        await recordPlaybackSupport(item, support);
      } catch {
        if (media.current === player) {
          setRecordError(true);
          setState("ready");
        }
        return;
      }
      if (media.current !== player) return;
      supportSaved.current = true;
    }
    if (restartFromBeginning || authorizing) {
      player.currentTime = 0;
      setElapsed(0);
    }
    player.playbackRate = current.slow ? 0.8 : audio.rate;
    player.preservesPitch = true;
    setState("starting");
    waitForPlayback();
    void player.play().catch(error => {
      if (authorizing && error.name === "NotAllowedError") {
        clearTimeout(timeout.current);
        // Some browsers require a fresh gesture after the network request.
        setState("ready");
      } else if (error.name !== "AbortError") failed();
    });
  }

  function toggle() {
    if (state === "playing" || state === "starting") {
      clearTimeout(timeout.current);
      setState("paused");
      media.current?.pause();
    } else void start();
  }

  function toggleSlow() {
    if (!slow) {
      void start(true, true);
      return;
    }
    // Restarting in normal mode is a separate listen. Only a completed listen counts.
    clearTimeout(timeout.current);
    attempt.current = null;
    media.current?.pause();
    setElapsed(0);
    setSlow(false);
    setState("idle");
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
      void start(false, true);
    }
  });
  useEffect(() => {
    if (!active) return;
    const keydown = (event: KeyboardEvent) => shortcut(event);
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [active]);

  function finished() {
    clearTimeout(timeout.current);
    const current = attempt.current;
    attempt.current = null;
    setSlow(false);
    setState("idle");
    if (!current || current.retry) return;
    setRecordError(false);
    void onPlayed(current.slow).catch(() => setRecordError(true));
  }

  const playing = state === "playing" || state === "starting";
  const playLabel = playing ? "Tạm dừng" : state === "ready" ? "Phát âm thanh" : state === "retry" ? "Phát lại" : state === "paused" ? "Nghe tiếp" :
    remaining === 0 ? "Nghe thêm (tính là gợi ý)" : "Phát âm thanh";
  const duration = mediaDuration || (audio.durationMs ?? 0) / 1000;
  const percent = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;
  const time = `${clock(elapsed)} / ${duration > 0 ? clock(duration) : "–:–"}`;
  const status = playSaving || state === "authorizing" ? "Đang ghi lượt nghe…" :
    state === "starting" ? "Đang mở âm thanh…" : state === "retry" ? "Âm thanh bị gián đoạn." : "";
  return <div ref={panel} className="grid gap-1">
    <audio
      ref={media} src={src} preload="none"
      onPlaying={() => { clearTimeout(timeout.current); setState("playing"); }}
      onWaiting={event => { if (attempt.current && !event.currentTarget.paused) waitForPlayback(); }}
      onPause={event => { if (attempt.current && state === "playing" && !event.currentTarget.ended) failed(); }}
      onLoadedMetadata={event => {
        const seconds = event.currentTarget.duration;
        if (Number.isFinite(seconds)) setMediaDuration(seconds);
      }}
      onTimeUpdate={event => setElapsed(event.currentTarget.currentTime)}
      onEnded={finished}
      onError={() => { if (attempt.current) failed(); }}
    />
    <div className="flex items-center gap-3">
      <button type="button" className="notebook-button audio-disc" aria-label={playLabel}
        onClick={toggle} disabled={playSaving || state === "authorizing"}>
        {playing ? <Pause size={22} fill="currentColor" aria-hidden /> : state === "retry" ? <RotateCcw size={22} aria-hidden /> :
          <Play size={22} fill="currentColor" aria-hidden />}
      </button>
      <div className="min-w-0 flex-1 px-1">
        <div className="audio-track" role="progressbar" aria-label="Tiến độ nghe" aria-valuenow={Math.round(percent)}
          aria-valuetext={duration > 0 ? `Đã nghe ${Math.floor(elapsed)} trên ${Math.floor(duration)} giây` :
            `Đã nghe ${Math.floor(elapsed)} giây. Chưa rõ thời lượng.`}>
          <span style={{ width: `${percent}%` }} />
        </div>
        <div className="flex flex-wrap justify-between gap-x-2 font-hand text-lg leading-tight tabular-nums text-muted-paper">
          <span aria-hidden="true">{time}</span>
          <span role="status">
            <span className="sr-only">{remaining ? `Còn ${remaining} lượt nghe` : "Đã hết lượt nghe"}</span>
            {remaining > 0 ? <span aria-hidden="true">còn {Array.from({ length: remaining }, (_, i) => <i key={i} className="audio-tally" />)} lượt</span> :
              <span aria-hidden="true">hết lượt</span>}
          </span>
        </div>
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-1 font-hand text-lg text-muted-paper">
      <div role="group" aria-label="Giọng đọc" className="flex items-center gap-1">
        <span aria-hidden="true">Giọng</span>
        {(["f", "m"] as const).map(v => <button type="button" key={v} aria-pressed={v === voice}
          aria-label={v === "f" ? "Giọng nữ" : "Giọng nam"} className="notebook-button notebook-choice" disabled={voiceSaving || item.readOnly}
          onClick={() => onVoice(v)}>{v === "f" ? "nữ" : "nam"}</button>)}
      </div>
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-rule" />
      <button type="button" aria-pressed={slow} aria-label="Nghe chậm"
        disabled={playSaving || state === "authorizing" || state === "starting" || state === "retry"}
        className="notebook-button notebook-choice" onClick={toggleSlow}><span aria-hidden="true">🐢</span> chậm</button>
    </div>
    {status && <p role="status" className="text-sm text-muted-paper">{status}</p>}
    {state === "playing" && <span role="status" className="sr-only">Đang phát</span>}
    {(voiceError || recordError) && <p role="status" className="text-sm text-muted-paper">
      {voiceError || "Chưa ghi được lượt nghe."}
    </p>}
  </div>;
}

function AudioTranscript({ audio, item, answered = false, automatic = false, active }:
  { audio: ListeningAudio; item: ListeningItem; answered?: boolean; automatic?: boolean; active: boolean }) {
  const transcriptTab = useRef<HTMLButtonElement>(null);
  const [transcript, setTranscript] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [request, setRequest] = useState(0);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!active) return;
    if (!automatic && request === 0) return;
    let live = true;
    function unavailable() {
      if (live) setStatus("Lời thoại chưa sẵn sàng.");
    }
    void revealTranscript({ lessonId: item.lessonId, itemId: item.itemId, readOnly: item.readOnly }).then(text => {
      if (!text) unavailable();
      else if (live) { setTranscript(text); setStatus(""); }
    }, unavailable);
    return () => { live = false; };
  }, [active, automatic, request, item.lessonId, item.itemId, item.readOnly]);

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
    {!automatic && <button type="button" ref={transcriptTab} className={confirm ? "sr-only" : "notebook-button audio-transcript-tab"}
      aria-hidden={confirm || undefined} tabIndex={confirm ? -1 : undefined} disabled={status === "Đang tải lời thoại…"}
      onClick={() => answered ? load() : setConfirm(true)}><FileText size={16} aria-hidden /> Lời thoại</button>}
    <PaperConfirm open={confirm} message="Xem lời thoại bây giờ thì câu này tính là đã dùng gợi ý nha."
      confirmLabel="Mở xem" cancelLabel="Thôi" returnFocus={transcriptTab} onCancel={() => setConfirm(false)} onConfirm={load} />
    {(status || automatic) && <p role="status" className="text-sm text-muted-paper">{status || "Đang tải lời thoại…"}</p>}
    {automatic && status === "Lời thoại chưa sẵn sàng." && !item.readOnly &&
      <button type="button" className={buttonClass("secondary")} onClick={load}>Thử lại</button>}
  </div>;
}
