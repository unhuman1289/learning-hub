"use client";
import {useLiveRefresh} from "../use-live-refresh";
import {feedbackForItems} from "../../../lib/feedback-history";
import {LessonSummary} from "./summary";
import {GraderOffline} from "../runner-status";
import {RouteLink} from "../ui";
import type {Route} from "../use-route";
import {formatChemicalText,isChemistryNotebook} from "../../../lib/chemistry";
import { useCallback, useEffect, useRef, useState } from "react";
import type { readLessonV2 } from "../../../lib/lesson-v2/store";
import type { DraftAnswers } from "../../../lib/lesson-v2/actions";
import type { Drafts } from "../lesson-page";
import { RuledPage } from "../../../components/notebook/paper";
import { buttonClass } from "../ui";
import { Cover } from "./cover";
import { Sheet } from "./sheet";
import { Stage } from "./stage";
import { Feedback, type SubmissionView } from "./feedback";
type Lesson = Awaited<ReturnType<typeof readLessonV2>> & { lastSubmission?: SubmissionView | null };
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
export function LessonReader({
  id,
  learner,
  drafts,
  onLoaded,
  onCompleted,
  go,
}: {
  id: string;
  learner: string | null;
  drafts: Drafts;
  onLoaded?: (id: string, subject: string) => void;
  go: (route: Route) => void;
  onCompleted?: () => Promise<void>;
}) {
  const [lesson, setLesson] = useState<Lesson | null>(null),
    [view, setView] = useState<"cover" | "work" | "summary" | null>(null);
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
  const pendingSubmission = useRef<{ clientSubmissionId: string; draftRevision: number; stage: string | null; itemIds: string[] } | null>(null);
  const cacheKey = "v2:" + id,
    readonly = learner !== null,
    url = `/api/lessons/${id}`,
    suffix = learner ? "?learner=" + encodeURIComponent(learner) : "";
  const cache = useRef(drafts);
  useEffect(() => {
    cache.current = drafts;
  }, [drafts]);
  useEffect(() => {
    const version = ++generation.current;
    ready.current = false;
    json<{ lesson: Lesson }>(url + suffix)
      .then(({ lesson: result }) => {
        if (generation.current !== version) return;
        const cached = cache.current.values[cacheKey];
        let next = result.draft;
        if (cached && !readonly) {
          try {
            const x = JSON.parse(cached);
            next = x.answers;
            revision.current = x.revision;
            if (x.revision !== result.draftRevision) {
              setError("Nháp trên trang khác phiên bản đã lưu. Sao chép bài làm trước khi tải lại; chưa tự ghi đè.");
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
        latest.current = next;
        saved.current = JSON.stringify(result.draft);
        setAnswers(next);
        setLesson(result);
        onLoaded?.(result.id, result.subjectId);
        setState(JSON.stringify(next) === saved.current ? "" : "Chưa lưu");
      })
      .catch((e) => {
        if (generation.current === version) setError(e.message);
      });
    return () => {
      generation.current = version + 1;
      ready.current = false;
    };
  }, [url, suffix, cacheKey, readonly, onLoaded]);
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
  useEffect(()=>{void Promise.resolve().then(refreshFeedback);},[refreshFeedback]);
  const waiting = (submission?: SubmissionView) => !!submission &&
    submission.attempts.some(a => (!a.result && !["cancelled","failed","expired"].includes(submission.job_status ?? "")) || a.dispute?.status === "rechecking");
  const waitingForGrade = lesson?.items.some(item => waiting(feedbackForItems(history, [item.id])[0])) ?? false;
  useLiveRefresh(refreshFeedback, !!lesson && !busy && waitingForGrade, 5000);
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
          cache.current.set(cacheKey, undefined);
          setState("Đã lưu");
        } else {
          cache.current.set(cacheKey, JSON.stringify({ revision: revision.current, answers: latest.current }));
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
  }, [readonly, url, cacheKey]);
  useEffect(() => {
    if (!lesson || readonly || JSON.stringify(answers) === saved.current) return;
    const timer = setTimeout(() => {
      void save();
    }, 800);
    return () => clearTimeout(timer);
  }, [answers, lesson, readonly, save]);
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
    cache.current.set(cacheKey, JSON.stringify({ revision: revision.current, answers: next }));
    setState("Chưa lưu");
  }
  async function reveal(itemId: string, level: "hint1" | "hint2" | "solution") {
    setBusy(true);
    setError("");
    try {
      await json(url + `/items/${itemId}/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level }),
      });
      const fresh = await json<{ lesson: Lesson }>(url);
      setLesson(fresh.lesson);
      if (level === "solution") await refreshFeedback();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(itemId: string) {
    if (!lesson || busy || (pending && pending !== itemId)) return;
    setBusy(true);
    setError("");
    try {
      if (!pendingSubmission.current) {
        if (!(await save())) return;
        const item = lesson.items.find(i => i.id === itemId);
        if (!item) return;
        pendingSubmission.current = {
          clientSubmissionId: crypto.randomUUID(),
          draftRevision: revision.current,
          stage: item.stage,
          itemIds: [itemId],
        };
        setPending(itemId);
      }
      const request = () => json<{ submission: SubmissionView }>(url + "/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingSubmission.current),
      });
      const response = await request().catch(error => {
        if (error instanceof RequestError && error.status >= 400 && error.status < 500) throw error;
        // Uncertain response: the same immutable submission key lets the server return the saved attempt.
        return request();
      });
      setHistory(current=>[response.submission,...current.filter(s=>s.id!==response.submission.id)]);
      pendingSubmission.current = null;
      setPending(null);
      setState("Đã lưu");
    } catch (e) {
      if (e instanceof RequestError && e.status >= 400 && e.status < 500) {
        pendingSubmission.current = null;
        setPending(null);
        void refreshFeedback();
      }
      setError((e as Error).message + (pendingSubmission.current ? " Bấm lại ở câu này khi có mạng để kiểm tra kết quả." : ""));
    } finally {
      setBusy(false);
    }
  }
  async function complete() {
    if (!lesson || busy || pending) return;
    if (!lesson.completedAt && lesson.items.some(i => !history.some(s => s.attempts.some(a => a.item_id === i.id))) &&
      !window.confirm("Bài còn câu chưa làm. Bạn muốn kết thúc bài này?")) return;
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
      setView(result.completed ? "summary" : "work");
      await onCompleted?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!lesson)
    return (
      <div role={error ? "alert" : "status"} className="mx-auto max-w-4xl p-6">
        {error || "Đang mở bài…"}
      </div>
    );
  const mode = view ?? (lesson.completedAt ? "summary" : "cover");
  const formatText = isChemistryNotebook(lesson.subjectTitle ?? "") ? formatChemicalText : undefined;
  const reflection = history.find(s => s.attempts.length > 0 && s.attempts.every(a => a.result));
  const frozen = readonly || !!lesson.completedAt;
  const openLesson = (next: string) => go({ view: "lesson", id: next });
  return (
    <RuledPage className="mx-auto max-w-4xl space-y-6">
      <RouteLink route={{view:"subject", id:lesson.subjectId}} go={go} className={buttonClass("ghost","-ml-2")}>
        ← {lesson.subjectTitle}
      </RouteLink>
      {readonly && <p className="bg-rose-soft p-3">Đang xem bài của người học — chỉ đọc.</p>}
      {mode === "cover" ? (
        <Cover title={lesson.title} objective={lesson.objective} why={lesson.why} minutes={lesson.estMinutes} onStart={() => setView("work")} />
      ) : (
        <>
          <h1 className="text-balance font-print text-3xl leading-tight sm:text-4xl">{lesson.title}</h1>
          <GraderOffline waiting={waitingForGrade} what="Câu đang chờ" />
          {feedbackError && <p role="alert" className="bg-paper py-2">{feedbackError} <button onClick={() => void refreshFeedback()} className="underline">Tải lại lời phê</button></p>}
          {error && <p role="alert" className="bg-paper py-2 text-accent">{error}</p>}
          {mode === "summary" ? (
            <LessonSummary lessonId={id} subjectId={lesson.subjectId} learner={learner} waiting={waitingForGrade}
              reflectionId={reflection?.id} onOpen={openLesson} onHome={() => go({view:"desk"})} onReview={() => setView("work")} />
          ) : (
            <>
              {(lesson.sheet || lesson.sections.length > 0 || lesson.diagram) && (
                <details className="bg-paper py-3">
                  <summary className="min-h-11 cursor-pointer font-hand text-xl text-accent">Kiến thức và ví dụ</summary>
                  <div className="space-y-4">
                    <Sheet sheet={lesson.sheet} formatText={formatText} />
                    {lesson.sections.map((section, i) => (
                      <section key={i}><h2 className="font-hand text-xl">{section.heading}</h2><p className="whitespace-pre-wrap leading-7">{section.text}</p></section>
                    ))}
                    {lesson.diagram && <pre className="overflow-x-auto whitespace-pre text-sm">{lesson.diagram}</pre>}
                    {lesson.sources.map((source, i) => (
                      <p key={i} className="text-sm text-muted"><a href={source.url} target="_blank" rel="noreferrer" className="text-accent underline">{source.title}</a> · {source.readScope} · truy cập {source.retrievedAt} · xuất bản {source.publishedAt ?? "chưa rõ"}</p>
                    ))}
                  </div>
                </details>
              )}
              {lesson.output && <p className="bg-paper py-2">Đầu ra: {lesson.output}</p>}
              <Stage formatText={formatText} items={lesson.items} answers={answers} disabled={busy || !!pending}
                readOnly={frozen} onChange={change} onReveal={reveal} actions={(item) => {
                  const past = feedbackForItems(history,[item.id]), current = past[0];
                  const previous = past.slice(1);
                  const answer = answers[item.id]?.answer.trim();
                  const hasWork = (answer && (item.input !== "choice" || answer !== "[]")) || !!answers[item.id]?.attachmentIds?.length;
                  const latestAttempt = current?.attempts[0];
                  const changed = !latestAttempt || latestAttempt.answer !== answers[item.id]?.answer || !!answers[item.id]?.attachmentIds?.length;
                  const canSubmit = !busy && (pending === item.id || (!pending && !waiting(current) && !!hasWork && (changed || !latestAttempt?.result)));
                  return {
                    onSubmit: () => void submit(item.id), canSubmit,
                    submitLabel: current ? "Kiểm tra lại" : "Kiểm tra",
                    feedback: current && <>
                      <Feedback compact submission={current} items={[item]} readOnly={frozen} formatText={formatText} onRefresh={() => void refreshFeedback()} />
                      {previous.length > 0 && <details className="border-t border-line pt-2"><summary className="cursor-pointer text-sm text-accent">Lần trước</summary>
                        {previous.map(s => <Feedback compact key={s.id} submission={s} items={[item]} readOnly={frozen} formatText={formatText} onRefresh={() => void refreshFeedback()} />)}
                      </details>}
                    </>,
                  };
                }} />
              <div role="status" className="min-h-6 text-sm text-muted">{state}</div>
              {!readonly && <button className={buttonClass(lesson.completedAt ? "ghost" : "primary")} disabled={busy || !!pending} onClick={() => void complete()}>
                {lesson.completedAt ? "Mở lại để sửa" : "Xong bài"}
              </button>}
              {lesson.completedAt && <button className={buttonClass("secondary")} onClick={() => setView("summary")}>Xem tổng kết</button>}
            </>
          )}
        </>
      )}
    </RuledPage>
  );
}
