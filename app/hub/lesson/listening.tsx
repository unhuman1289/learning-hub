"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { apiJson } from "../api";
import { pencilLink } from "../paper-bits";
import type { Voice } from "./listen-api";

type Preferences = Record<string, unknown>;

export function useListeningSettings(owner: string, enabled: boolean) {
  const url = `/api/learners/${encodeURIComponent(owner)}/settings`;
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [chosenVoice, setChosenVoice] = useState<Voice>();
  const [voiceSaving, setVoiceSaving] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const saving = useRef(false);
  const savedVoice: Voice = preferences?.listeningVoice === "m" ? "m" : "f";
  const voice = chosenVoice ?? savedVoice;

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void apiJson<{ settings: { preferences: Preferences } }>(url).then(
      data => { if (active) setPreferences(data.settings.preferences ?? {}); },
      () => { if (active) setPreferences({}); },
    );
    return () => { active = false; };
  }, [enabled, url]);

  async function onVoice(next: Voice) {
    if ((next === voice && !voiceError) || saving.current) return;
    saving.current = true;
    setChosenVoice(next);
    setVoiceSaving(true);
    setVoiceError("");
    try {
      await apiJson<{ voice: Voice }>('/api/learners/me/voice', { method: 'POST', json: { voice: next } });
      setPreferences(current => ({ ...current, listeningVoice: next }));
    } catch {
      setVoiceError("Đã đổi giọng cho bài này. Chưa lưu được vào hồ sơ.");
    } finally {
      saving.current = false;
      setVoiceSaving(false);
    }
  }

  return { ready: !enabled || preferences !== null, voice, asText: preferences?.replaceAudioWithText === true, voiceSaving, voiceError, onVoice };
}

const subscribeUserAgent = () => () => {};
const isInApp = () => /Zalo|Messenger|FBAN\/(?:Messenger|Orca|FBMessenger)|FB_IAB\/(?:Messenger|Orca|FBMessenger)/i.test(navigator.userAgent);
const serverIsInApp = () => false;

export function ListeningBrowserNotice() {
  const inApp = useSyncExternalStore(subscribeUserAgent, isInApp, serverIsInApp);
  const [copy, setCopy] = useState<"idle" | "done" | "manual">("idle");
  if (!inApp) return null;
  return <aside className="mb-2 flex flex-wrap items-center gap-x-3 bg-postit-yellow px-3 text-sm text-postit-ink">
    <p className="py-2">Mở bằng Safari/Chrome để dùng đầy đủ</p>
    <button type="button" className={pencilLink + " min-h-11"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          setCopy("done");
        } catch {
          setCopy("manual");
        }
      }}>Sao chép liên kết</button>
    {copy === "done" && <span role="status">Đã sao chép</span>}
    {copy === "manual" && <input readOnly aria-label="Liên kết bài học" value={window.location.href}
      className="mb-2 min-h-11 w-full bg-paper px-2 text-ink-paper" onFocus={event => event.currentTarget.select()} />}
  </aside>;
}
