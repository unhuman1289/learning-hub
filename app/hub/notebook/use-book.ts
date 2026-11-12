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

export function useBook(subjectId: string, learner: string | null, enabled: boolean, history: boolean) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [current, setCurrent] = useState<BookLessons | null>(null);
  const [archive, setArchive] = useState<BookLessons | null>(null);
  const book = history ? archive : current;
  const [older, setOlder] = useState<BookLessons | null>(null);
  const [reportError, setReportError] = useState(false);
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
      const options = { signal: request.signal };
      const report = history ? Promise.resolve() :
        apiJson<Overview>(subjectUrl + "?view=overview" + params, options).then(data => {
          if (!request.signal.aborted) { setOverview(data); setReportError(false); }
        }).catch(() => { if (!request.signal.aborted) setReportError(true); });
      const lessons = await apiJson<BookLessons>(subjectUrl + "/lessons?" + (history ? "all=1" : "view=open") + params, options);
      if (request.signal.aborted) return;
      if (history) setArchive(lessons);
      else setCurrent(lessons);
      setError(false);
      await report;
    } catch {
      if (!request.signal.aborted) setError(true);
    }
  }, [enabled, history, params, subjectUrl]);

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
  useLiveRefresh(async () => {
    const status = await apiJson<Pick<BookLessons, "initial" | "nightly" | "setup">>(subjectUrl + "/lessons?view=status" + params);
    if (status.setup !== book?.setup || status.initial?.status !== book?.initial?.status ||
        status.nightly?.status !== book?.nightly?.status) await refresh();
  }, enabled && pending && !history, 5000);
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
  return { book, overview, rows, error, reportError, refresh, loadMore, hasMore: nextOffset != null, loadingOlder };
}
