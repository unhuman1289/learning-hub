"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { feedbackForItems } from "../../../lib/feedback-history";
import type { StudyDay } from "../../../lib/study-sql";
import type { DraftAnswers } from "../../../lib/lesson-v2/actions";
import type { readLessonV2 } from "../../../lib/lesson-v2/store";
import type { Drafts } from "../lesson-page";
import { useLiveRefresh } from "../use-live-refresh";
import { useRunnerStatus, type RunnerStatus } from "../runner-status";
import type { SubmissionView } from "../lesson-v2/feedback";
import { readOfflineDraft, writeOfflineDraft } from "../lesson-v2/offline-draft";

export function waitingForFeedback(submission?: SubmissionView) {
  return !!submission && submission.attempts.some(attempt =>
    (!attempt.result && !["cancelled", "failed", "expired"].includes(submission.job_status ?? "")) ||
    attempt.dispute?.status === "rechecking",
  );
}

type PendingSubmission = {
  clientSubmissionId: string;
  draftRevision: number;
  stage: string | null;
  itemIds: string[];
  answers?: DraftAnswers;
};
export type Lesson = Awaited<ReturnType<typeof readLessonV2>>;
class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function json<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", ...init });
  } catch {
    throw new RequestError("Mất kết nối. Bài làm vẫn còn trên trang.", 0);
  }
  const value = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !value) throw new RequestError(value?.error || "Chưa xác nhận thao tác.", response.status);
  return value;
}
export function useLessonSession({ id, ownerId, learner, drafts, onLoaded, onCompleted }: {
  id: string;
  ownerId: string;
  learner: string | null;
  drafts: Drafts;
  onLoaded?: (id: string, subject: string, study: StudyDay) => void;
  onCompleted?: () => Promise<void>;
}) {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [answers, setAnswers] = useState<DraftAnswers>({}),
    [error, setError] = useState(""),
    [state, setState] = useState(""),
    [busy, setBusy] = useState(false),
    [history,setHistory]=useState<SubmissionView[]>([]),
    [feedbackError,setFeedbackError]=useState(""),
    [pending, setPending] = useState<string | null>(null);
  const revision = useRef(0),
    latest = useRef<DraftAnswers>({}),
    saved = useRef("{}"),
    saveInFlight = useRef<Promise<boolean> | null>(null),
    ready = useRef(false),
    generation = useRef(0);
  const pendingSubmission = useRef<PendingSubmission | null>(null);
  const cacheKey = "v2:" + ownerId + ":" + id,
    readonly = learner !== null,
    url = `/api/lessons/${id}`,
    suffix = learner ? "?learner=" + encodeURIComponent(learner) : "";
  const [child, setChild] = useState(false);
  const [pageEdgeHint, setPageEdgeHint] = useState(false);
  const [initialRunner, setInitialRunner] = useState<RunnerStatus | null>(null);
  const submissionKey = cacheKey + ":submission";
  const cache = useRef(drafts);
  useEffect(() => {
    cache.current = drafts;
  }, [drafts]);
  useEffect(() => {
    const version = ++generation.current;
    ready.current = false;
    const query = new URLSearchParams(suffix.slice(1));
    query.set("view", "reader");
    json<{ lesson: Lesson; submissions: SubmissionView[]; child: boolean; runner: RunnerStatus | null; study: StudyDay; pageEdgeHint?: boolean }>(url + "?" + query)
      .then(({ lesson: result, submissions, child, runner, study, pageEdgeHint }) => {
        if (generation.current !== version) return;
        setChild(child);
        setPageEdgeHint(!readonly && !!pageEdgeHint);
        setInitialRunner(runner);
        const storedSubmission = readonly ? undefined : readOfflineDraft(submissionKey);
        if (storedSubmission) {
          try {
            const queued = JSON.parse(storedSubmission) as PendingSubmission;
            if (queued.itemIds?.length === 1 && result.items.some(item => item.id === queued.itemIds[0]) &&
                typeof queued.clientSubmissionId === "string" && Number.isInteger(queued.draftRevision)) {
              pendingSubmission.current = queued;
              setPending(queued.itemIds[0]);
            }
          } catch {
            writeOfflineDraft(submissionKey, undefined);
          }
        }
        const cached = readonly ? undefined : cache.current.values[cacheKey] ?? readOfflineDraft(cacheKey);
        let next = result.draft;
        if (cached && !readonly) {
          try {
            const x = JSON.parse(cached);
            next = x.answers;
            revision.current = x.revision;
            if (x.revision !== result.draftRevision && !pendingSubmission.current) {
              setError("Bài trên máy này khác bản đã lưu. Chép bài làm ra trước, rồi tải lại trang.");
              ready.current = false;
            } else ready.current = true;
          } catch {
            next = result.draft;
            revision.current = result.draftRevision;
            ready.current = true;
          }
        } else {
          revision.current = result.draftRevision;
          ready.current = true;
        }
        if (pendingSubmission.current?.answers) next = pendingSubmission.current.answers;
        latest.current = next;
        saved.current = JSON.stringify(result.draft);
        setAnswers(next);
        setHistory(submissions);
        setLesson(result);
        onLoaded?.(result.id, result.subjectId, study);
        setState(JSON.stringify(next) === saved.current ? "" : "Chưa lưu");
      })
      .catch((e) => {
        if (generation.current === version) setError(e.message);
      });
    return () => {
      generation.current = version + 1;
      ready.current = false;
    };
  }, [url, suffix, cacheKey, readonly, onLoaded, submissionKey]);
  const refreshFeedback=useCallback(async()=>{
    const version=generation.current;
    try{
      const value=await json<{submissions:SubmissionView[];lesson:Pick<Lesson,"items"|"stages">}>(url+"/feedback"+suffix);
      if(generation.current!==version)return;
      setHistory(value.submissions);setFeedbackError("");
      // Add server-authored check questions without touching draft revision, answers or current page.
      setLesson(current=>current?{...current,items:value.lesson.items,stages:value.lesson.stages}:current);
    }catch(e){if(generation.current===version)setFeedbackError((e as Error).message);}
  },[url,suffix]);
  const waitingForGrade = lesson?.items.some(item => waitingForFeedback(feedbackForItems(history, [item.id])[0])) ?? false;
  useLiveRefresh(async () => {
    const active = lesson?.items.flatMap(item => {
      const submission = feedbackForItems(history, [item.id])[0];
      return waitingForFeedback(submission) ? submission.attempts.filter(attempt => attempt.item_id === item.id) : [];
    }) ?? [];
    const query = new URLSearchParams(suffix.slice(1));
    query.set("watch", active.map(attempt => attempt.id).join(","));
    query.set("rechecks", active.filter(attempt => attempt.dispute?.status === "rechecking").map(attempt => attempt.id).join(","));
    const value = await json<{ changed: boolean }>(url + "/feedback?" + query);
    if (value.changed) await refreshFeedback();
  }, !!lesson && !busy && waitingForGrade, 5000);
  const storeDraft = useCallback((value: string | undefined) => {
    cache.current.set(cacheKey, value);
    writeOfflineDraft(cacheKey, value);
  }, [cacheKey]);
  const save = useCallback(async (): Promise<boolean> => {
    if (readonly || !ready.current) return false;
    if (saveInFlight.current) {
      await saveInFlight.current;
      if (JSON.stringify(latest.current) === saved.current) return true;
    }
    const snapshot = JSON.stringify(latest.current);
    if (snapshot === saved.current) return true;
    const version = generation.current;
    setState("Đang lưu…");
    setError("");
    const promise = json<{ revision: number }>(url + "/draft", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision: revision.current, answers: JSON.parse(snapshot) }),
    })
      .then((result) => {
        if (generation.current !== version) return false;
        revision.current = result.revision;
        saved.current = snapshot;
        if (JSON.stringify(latest.current) === snapshot) {
          storeDraft(undefined);
          setState("Đã lưu");
        } else {
          storeDraft(JSON.stringify({ revision: revision.current, answers: latest.current }));
          setState("Chưa lưu");
        }
        return true;
      })
      .catch((e) => {
        if (generation.current === version) {
          setError(e.message);
          setState("Chưa lưu");
        }
        return false;
      })
      .finally(() => {
        saveInFlight.current = null;
      });
    saveInFlight.current = promise;
    return promise;
  }, [readonly, url, storeDraft]);
  useEffect(() => {
    if (!lesson || readonly || busy || pending || JSON.stringify(answers) === saved.current) return;
    const timer = setTimeout(() => {
      void save();
    }, 800);
    return () => clearTimeout(timer);
  }, [answers, lesson, readonly, busy, pending, save]);
  useEffect(() => {
    if (!lesson || readonly || busy || pending) return;
    function reconnect() {
      if (JSON.stringify(latest.current) !== saved.current) void save();
    }
    window.addEventListener("online", reconnect);
    return () => window.removeEventListener("online", reconnect);
  }, [lesson, readonly, busy, pending, save]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (JSON.stringify(latest.current) !== saved.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, []);
  function change(itemId: string, value: DraftAnswers[string]) {
    const next = { ...latest.current, [itemId]: value };
    latest.current = next;
    setAnswers(next);
    storeDraft(JSON.stringify({ revision: revision.current, answers: next }));
    setState("Chưa lưu");
  }
  async function reveal(itemId: string, level: "hint1" | "hint2" | "solution") {
    setBusy(true);
    setError("");
    try {
      const { support, submissions, ...revealed } = await json<Omit<Lesson["items"][number]["revealed"], "solutionSeen"> & { support: string; submissions?: SubmissionView[] }>(url + `/items/${itemId}/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level }),
      });
      setLesson(current => current && { ...current, items: current.items.map(item => item.id === itemId
        ? { ...item, revealed: { ...revealed, solutionSeen: support === "solution" } } : item) });
      if (submissions) setHistory(submissions);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(itemId: string) {
    if (!lesson || busy || (pending && pending !== itemId) || (!pendingSubmission.current && !ready.current)) return;
    setBusy(true);
    setError("");
    try {
      if (!pendingSubmission.current) {
        if (saveInFlight.current && !(await saveInFlight.current)) return;
        const item = lesson.items.find(i => i.id === itemId);
        if (!item) return;
        pendingSubmission.current = {
          clientSubmissionId: crypto.randomUUID(),
          draftRevision: revision.current,
          stage: item.stage,
          itemIds: [itemId],
          ...(JSON.stringify(latest.current) !== saved.current ? { answers: latest.current } : {}),
        };
        writeOfflineDraft(submissionKey, JSON.stringify(pendingSubmission.current));
        setPending(itemId);
      }
      const input = pendingSubmission.current;
      const request = () => json<{ submission: SubmissionView; draftRevision: number }>(url + "/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const response = await request().catch(error => {
        if (error instanceof RequestError && error.status >= 400 && error.status < 500) throw error;
        // Uncertain response: the same immutable submission key lets the server return the saved attempt.
        return request();
      });
      setHistory(current=>[response.submission,...current.filter(s=>s.id!==response.submission.id)]);
      if (input.answers) {
        revision.current = response.draftRevision;
        saved.current = JSON.stringify(input.answers);
        ready.current = true;
        storeDraft(JSON.stringify(latest.current) === saved.current ? undefined :
          JSON.stringify({ revision: revision.current, answers: latest.current }));
      }
      pendingSubmission.current = null;
      writeOfflineDraft(submissionKey, undefined);
      setPending(null);
      setState(JSON.stringify(latest.current) === saved.current ? "Đã lưu" : "Chưa lưu");
      window.dispatchEvent(new CustomEvent("lh:lesson-changed", { detail: { subjectId: lesson.subjectId } }));
    } catch (e) {
      if (e instanceof RequestError && e.status >= 400 && e.status < 500) {
        pendingSubmission.current = null;
        writeOfflineDraft(submissionKey, undefined);
        setPending(null);
        void refreshFeedback();
      }
      setError((e as Error).message + (pendingSubmission.current ? " Bấm lại ở câu này khi có mạng để kiểm tra kết quả." : ""));
    } finally {
      setBusy(false);
    }
  }
  async function complete(confirmed = false) {
    if (!lesson || busy || pending) return;
    if (!lesson.completedAt && unanswered > 0 && !confirmed) {
      setConfirmFinish(true);
      return;
    }
    setConfirmFinish(false);
    setBusy(true);
    setError("");
    try {
      if (!(await save())) return;
      const fresh = await json<{ lesson: Lesson }>(url);
      const result = await json<{ updated: string; completed: boolean; completedAt: string | null }>(url + "/completion", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !fresh.lesson.completedAt, expectedUpdated: fresh.lesson.updated }),
      });
      setLesson({ ...fresh.lesson, updated: result.updated, completedAt: result.completedAt });
      setJustCompleted(result.completed);
      window.dispatchEvent(new CustomEvent("lh:lesson-changed", { detail: { subjectId: lesson.subjectId } }));
      await onCompleted?.();
      return result.completed;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const runner = useRunnerStatus(waitingForGrade, initialRunner);
  const [justCompleted, setJustCompleted] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  /** The learner turned a page: hide the hint now and remember it in the profile. */
  const pageEdgeHintSeen = useCallback(() => {
    setPageEdgeHint(false);
    void fetch("/api/learners/me/hints", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ hint: "pageEdge" }),
    }).catch(() => {});
  }, []);
  const unanswered = lesson?.items.filter(i => !i.revealed.solutionSeen && !history.some(s => s.attempts.some(a => a.item_id === i.id))).length ?? 0;

  return {
    lesson, child, pageEdgeHint, pageEdgeHintSeen, answers, history, readonly, busy, pending, error, feedbackError, state,
    waitingForGrade, gradeLater: runner?.online === false, unanswered, confirmFinish,
    justCompleted, setJustCompleted, setConfirmFinish, change, reveal, submit, complete, refreshFeedback,
  };
}
