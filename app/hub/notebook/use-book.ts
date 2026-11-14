"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NotebookOverview } from "../../../lib/learner-model/overview";
import type { NotebookLessonRow } from "../../../lib/lesson-v2/notebook-list";
import type { NotebookReport } from "../../../lib/notebook-report";
import type { SubjectView } from "../../../lib/subjects/service";
import type { listRequests } from "../../../lib/requests/service";
import { apiJson } from "../api";
import { useLiveRefresh } from "../use-live-refresh";

export type BookLessons = {
  lessons: NotebookLessonRow[]; nextOffset: number | null; adaptive: boolean; day: string;
  nightly: { status: string } | null; initial: { status: string } | null; setup: boolean;
};
type Overview = NotebookOverview & { report: NotebookReport };

type BookData = { subject: SubjectView; child: boolean; overview: Overview; book: BookLessons; history: Pick<BookLessons, "lessons" | "nextOffset">; requests: Awaited<ReturnType<typeof listRequests>> };

export function useBook(subjectId: string, learner: string | null, enabled: boolean) {
  const [data, setData] = useState<BookData | null>(null);
  const book = data?.book;
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
      const next = await apiJson<BookData>(subjectUrl + "?view=book" + params, { signal: request.signal });
      if (request.signal.aborted) return;
      setData(next);
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
  useLiveRefresh(async () => {
    const status = await apiJson<Pick<BookLessons, "initial" | "nightly" | "setup">>(subjectUrl + "/lessons?view=status" + params);
    if (status.setup !== book?.setup || status.initial?.status !== book?.initial?.status ||
        status.nightly?.status !== book?.nightly?.status) await refresh();
  }, enabled && pending, 5000);
  const nextOffset = older ? older.nextOffset : data?.history.nextOffset;
  const rows = [...new Map([...(older?.lessons ?? []), ...(data?.history.lessons ?? [])].map(row => [row.id, row])).values()];
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
  return { subject: data?.subject, child: data?.child, requests: data?.requests ?? [], book, overview: data?.overview, rows, error, refresh, loadMore, hasMore: nextOffset != null, loadingOlder };
}
