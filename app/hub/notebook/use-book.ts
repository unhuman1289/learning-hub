"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NotebookOverview } from "../../../lib/learner-model/overview";
import type { NotebookLessonRow } from "../../../lib/lesson-v2/notebook-list";
import type { NotebookReport } from "../../../lib/notebook-report";
import { apiJson } from "../api";
import { useLiveRefresh } from "../use-live-refresh";

export type BookLessons = {
  lessons: NotebookLessonRow[]; nextOffset: number | null; adaptive: boolean; day: string;
  nightly: { status: string } | null; initial: { status: string } | null; setup: boolean;
};
type Overview = NotebookOverview & { report: NotebookReport };

export function useBook(subjectId: string, learner: string | null, enabled: boolean) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [book, setBook] = useState<BookLessons | null>(null);
  const [older, setOlder] = useState<BookLessons | null>(null);
  const [error, setError] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const inFlight = useRef<AbortController | null>(null);
  const subjectUrl = "/api/subjects/" + subjectId;
  const params = learner ? "&learner=" + encodeURIComponent(learner) : "";
  const refresh = useCallback(async () => {
    if (!enabled) return;
    inFlight.current?.abort();
    const request = new AbortController();
    inFlight.current = request;
    try {
      const [data, lessons] = await Promise.all([
        apiJson<Overview>(subjectUrl + "?view=overview" + params, { signal: request.signal }),
        apiJson<BookLessons>(subjectUrl + "/lessons?all=1" + params, { signal: request.signal }),
      ]);
      if (request.signal.aborted) return;
      setOverview(data);
      setBook(lessons);
      setError(false);
    } catch {
      if (!request.signal.aborted) setError(true);
    }
  }, [enabled, params, subjectUrl]);

  useEffect(() => {
    const visible = () => { if (!document.hidden) void refresh(); };
    const lessonChanged = (event: Event) => {
      if ((event as CustomEvent<{ subjectId: string }>).detail?.subjectId === subjectId) void refresh();
    };
    const initial = requestAnimationFrame(() => void refresh());
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("lh:lesson-changed", lessonChanged);
    return () => {
      cancelAnimationFrame(initial);
      inFlight.current?.abort();
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("lh:lesson-changed", lessonChanged);
    };
  }, [refresh, subjectId]);

  const pending = [book?.initial?.status, book?.nightly?.status].some(status => status === "queued" || status === "leased");
  useLiveRefresh(refresh, enabled && pending, 5000);
  const nextOffset = older ? older.nextOffset : book?.nextOffset;
  const rows = [...new Map([...(older?.lessons ?? []), ...(book?.lessons ?? [])].map(row => [row.id, row])).values()];
  async function loadMore() {
    if (nextOffset == null || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const next = await apiJson<BookLessons>(subjectUrl + "/lessons?all=1" + params + "&offset=" + nextOffset);
      setOlder(current => ({ ...next, lessons: [...(current?.lessons ?? []), ...next.lessons] }));
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoadingOlder(false);
    }
  }
  return { book, overview, rows, error, refresh, loadMore, hasMore: nextOffset != null, loadingOlder };
}
