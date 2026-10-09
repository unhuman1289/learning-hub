"use client";

import { useCallback, useEffect, useState } from "react";
import type { DailyLesson, DailyView } from "../../lib/daily-types";

/** Assigned lessons from D1. Each save is confirmed by the server before the page shows it. */
export function useDaily() {
  const [data, setData] = useState<DailyView | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/daily", { cache: "no-store" });
      const result = await response.json() as DailyView & { error?: string };
      if (!response.ok) throw Error(result.error || "Chưa tải được bài học.");
      setData(result);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const save = useCallback(async (lesson: DailyLesson, response: string, completed: boolean) => {
    setBusyId(lesson.id);
    setError("");
    try {
      const result = await fetch("/api/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lesson.id, expectedUpdated: lesson.updated, response, completed }),
      });
      const body = await result.json() as DailyView & { error?: string };
      if (!result.ok) throw Error(body.error || "Chưa lưu được bài làm.");
      setData(body);
      return true;
    } catch (cause) {
      setError((cause as Error).message);
      return false;
    } finally {
      setBusyId("");
    }
  }, []);

  const setBackup = useCallback((createdAt: string) => {
    setData((current) => current ? { ...current, backup: { lastCreatedAt: createdAt, due: false } } : current);
  }, []);

  return { data, error, busyId, load, save, setBackup };
}

export type DailyApi = ReturnType<typeof useDaily>;
