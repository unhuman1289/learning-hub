"use client";
import {useLiveRefresh} from "./use-live-refresh";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LearnerSummary } from "../../lib/learners/list";
import type { Greeting } from "../../lib/greeting";
import type { TodayItem } from "../../lib/today";
import type { StudyDay } from "../../lib/study-sql";
import type { SubjectView } from "../../lib/subjects/service";

export type ShelfSubject = SubjectView;
export type NewSubject = {
  title?: string; template?: "skill" | "reading"; goal?: string; level?: string; curriculum?: string; legacyTrack?: string;
};

const query = (learner: string | null) => (learner ? `?learner=${encodeURIComponent(learner)}` : "");

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || !body) throw Error(body?.error || fallback);
  return body;
}

type TodayData = {
  subjects: ShelfSubject[];
  learners: LearnerSummary[];
  greeting: Greeting;
  items: TodayItem[];
  study: StudyDay;
  adaptiveSubjects: string[];
  preparing: { subjectId: string; title: string; writing: boolean }[];
  gradingWaits: boolean;
  gradingActive?: boolean;
};

/** Keep a shelf snapshot scoped to its learner, including the desk payload when on the desk. */
export function useShelf(learner: string | null, desk: boolean, ready: boolean, profileId: string) {
  const [offline, setOffline] = useState(false);
  const [learners, setLearners] = useState<LearnerSummary[]>([]);
  const [snapshot, setSnapshot] = useState<{ learner: string | null; subjects: ShelfSubject[]; today?: TodayData }>();
  const [failure, setFailure] = useState<{ learner: string | null; message: string }>();
  const inFlight = useRef<AbortController>(undefined);
  const current = snapshot?.learner === learner ? snapshot : undefined;
  const error = failure?.learner === learner ? failure.message : "";

  const load = useCallback(async () => {
    inFlight.current?.abort();
    const request = new AbortController();
    inFlight.current = request;
    const { signal } = request;
    const params = new URLSearchParams(learner ? { learner } : {});
    const init = { cache: "no-store" as const, signal };
    try {
      if (desk) {
        params.set("hour", String(new Date().getHours()));
        const response = await fetch(`/api/today?${params}`, { ...init, headers: { "X-LH-Profile": profileId } });
        const data = await readJson<TodayData>(response, "Chưa tải được bàn học.");
        setOffline(response.headers.get("X-LH-Offline") === "1");
        if (signal.aborted) return;
        setLearners(data.learners);
        setSnapshot({ learner, subjects: data.subjects, today: data });
      } else {
        const data = await readJson<{ subjects: ShelfSubject[] }>(await fetch(`/api/subjects${query(learner)}`, init), "Chưa tải được tủ sách.");
        if (signal.aborted) return;
        setSnapshot({ learner, subjects: data.subjects });
      }
      setFailure(undefined);
    } catch {
      if (!signal.aborted) setFailure({ learner, message: desk ? "Chưa tải được bàn học." : "Chưa tải được kệ sách." });
    }
  }, [desk, learner, profileId]);

  useEffect(() => {
    if (!ready) return;
    const initial = window.setTimeout(() => void load(), 0);
    const reconnect = () => void load();
    window.addEventListener("online", reconnect);
    return () => {
      window.clearTimeout(initial);
      inFlight.current?.abort();
      window.removeEventListener("online", reconnect);
    };
  }, [load, ready]);

  useEffect(() => {
    if (!ready || desk || learners.length) return;
    const request = new AbortController();
    fetch("/api/learners", { cache: "no-store", signal: request.signal })
      .then((response) => readJson<{ learners: LearnerSummary[] }>(response, ""))
      .then((body) => { if (!request.signal.aborted) setLearners(body.learners); })
      .catch(() => {});
    return () => request.abort();
  }, [desk, learners.length, ready]);

  useLiveRefresh(() => load(), ready, desk && current?.today &&
    (current.today.preparing.length || current.today.gradingActive) ? 15_000 : null);

  const create = useCallback(async (input: NewSubject) => {
    const body = await readJson<{ subject: ShelfSubject }>(await fetch(`/api/subjects${query(learner)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }), "Chưa mở được sổ mới.");
    setSnapshot((current) => ({
      learner,
      subjects: [...(current?.learner === learner ? current.subjects : []), body.subject],
      today: current?.learner === learner ? current.today : undefined,
    }));
    if (desk && learner) await load();
    return body.subject;
  }, [desk, learner, load]);

  const update = useCallback(async (id: string, patch: Record<string, unknown>) => {
    const body = await readJson<{ subject: ShelfSubject }>(await fetch(`/api/subjects/${id}${query(learner)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }), "Chưa lưu được thay đổi.");
    setSnapshot((current) => current?.learner === learner
      ? { ...current, subjects: current.subjects.map(item => item.id === id ? body.subject : item) }
      : current);
    return body.subject;
  }, [learner]);

  const self = learners.find((item) => item.relation === "self") ?? null;
  return { offline, learner, learners, self, subjects: current?.subjects ?? null, today: desk ? current?.today : undefined, error, load, create, update };
}

export type ShelfApi = ReturnType<typeof useShelf>;
