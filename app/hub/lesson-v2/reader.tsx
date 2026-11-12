"use client";
import {useLiveRefresh} from "../use-live-refresh";
import {feedbackForItems} from "../../../lib/feedback-history";
import {LessonSummary} from "./summary";
import {useRunnerStatus} from "../runner-status";
import {pencil, pencilLink} from "../paper-bits";
import type {Route} from "../use-route";
import {formatChemicalText,isChemistryNotebook} from "../../../lib/chemistry";
import { useCallback, useEffect, useRef, useState } from "react";
import type { readLessonV2 } from "../../../lib/lesson-v2/store";
import type { DraftAnswers } from "../../../lib/lesson-v2/actions";
import type { Drafts } from "../lesson-page";
import { buttonClass } from "../ui";
import { sheetBlocks, splitPaperText } from "./sheet";
import { PaperConfirm } from "../paper-confirm";
import { words } from "../words";
import { ItemCard } from "./item-card";
import { initialLessonBlock } from "../notebook/page-blocks";
import { Book } from "../notebook/book";
import { Spread, type SpreadBlock } from "../notebook/spread";
import { shortDay } from "../paper-bits";
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
  child = false,
  correction: openCorrection = false,
  learner,
  drafts,
  onLoaded,
  onCompleted,
  go,
}: {
  id: string;
  learner: string | null;
  drafts: Drafts;
  child?: boolean;
  correction?: boolean;
  onLoaded?: (id: string, subject: string) => void;
  go: (route: Route) => void;
  onCompleted?: () => Promise<void>;
}) {
  const [lesson, setLesson] = useState<Lesson | null>(null),
    [pageJump, setPageJump] = useState<{ id: string; key: number } | null>(null);
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
      window.dispatchEvent(new CustomEvent("lh:lesson-changed", { detail: { subjectId: lesson.subjectId } }));
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
      jump(result.completed ? "summary" : "head");
      window.dispatchEvent(new CustomEvent("lh:lesson-changed", { detail: { subjectId: lesson.subjectId } }));
      await onCompleted?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const runner = useRunnerStatus(waitingForGrade);
  const [justCompleted, setJustCompleted] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const unanswered = lesson?.items.filter(i => !i.revealed.solutionSeen && !history.some(s => s.attempts.some(a => a.item_id === i.id))).length ?? 0;
  if (!lesson)
    return (
      <div role={error ? "alert" : "status"} className="mx-auto max-w-4xl p-6">
        {error || "Đang mở bài…"}
      </div>
    );
  const formatText = isChemistryNotebook(lesson.subjectTitle ?? "") ? formatChemicalText : undefined;
  const reflection = history.find(s => s.attempts.length > 0 && s.attempts.every(a => a.result));
  const frozen = readonly || !!lesson.completedAt;
  const openLesson = (next: string) => go({ view: "lesson", id: next });
  const doneIds = new Set(history.flatMap(submission => submission.attempts.map(attempt => attempt.item_id)));
  const firstUnanswered = lesson.items.findIndex(item => !item.revealed.solutionSeen && !doneIds.has(item.id));
  const correction = openCorrection ? lesson.items.findIndex(item => ["incorrect", "partial"].includes(feedbackForItems(history, [item.id])[0]?.attempts[0]?.result ?? "")) : -1;
  const startAt = initialLessonBlock({ completed: !!lesson.completedAt, correction, firstUnanswered,
    hasWork: doneIds.size > 0 || lesson.items.some(item => item.revealed.solutionSeen) || Object.values(answers).some(answer => {
      const value = answer.answer.trim();
      return (value && value !== "[]") || !!answer.attachmentIds?.length;
    }) });
  const blocks: SpreadBlock[] = [{ id: "head", kind: "head", reservedLines: 3,
    text: [{ value: lesson.title }, { value: lesson.objective }, { value: lesson.why, handwriting: true }], node: <>
      <h1 tabIndex={-1} className="text-balance font-print text-[1.75rem] leading-tight sm:text-[2rem]">{lesson.title}</h1>
      <p className="mt-3">{lesson.objective}</p>
      <p className={pencil}>{lesson.estMinutes ? `${lesson.estMinutes} phút · ` : ""}{lesson.why}</p>
    </> }];
  if (lesson.sheet) blocks.push(...sheetBlocks(lesson.sheet, formatText ?? (text => text)));
  for (const [i, section] of lesson.sections.entries()) {
    for (const [j, value] of splitPaperText(section.text).entries()) {
      blocks.push({
        id: `remember-section-${i}-${j}`, kind: "remember", reservedLines: j === 0 ? 1 : 0,
        text: [{ value }],
        node: <>{j === 0 && <h2 tabIndex={-1} className="font-hand text-xl">{section.heading}</h2>}<p>{value}</p></>,
      });
    }
  }
  if (lesson.diagram) blocks.push({ id: "diagram", kind: "remember", text: [{ value: lesson.diagram }],
    node: <pre className="overflow-x-auto whitespace-pre text-sm">{lesson.diagram}</pre> });
  for (const [i, source] of lesson.sources.entries()) {
    blocks.push({
      id: `source-${i}`, kind: "remember", reservedLines: 2,
      text: [{ value: source.title }, { value: source.readScope }],
      node: <p className="text-sm text-muted">
        <a href={source.url} target="_blank" rel="noreferrer" className={pencilLink}>{source.title}</a> · Đã đọc · {shortDay(source.retrievedAt)}
        <span className="block">{source.readScope}</span>
      </p>,
    });
  }
  for (const [index, item] of lesson.items.entries()) {
    const [current, ...previous] = feedbackForItems(history, [item.id]);
    const answer = answers[item.id]?.answer.trim();
    const hasWork = (answer && (item.input !== "choice" || answer !== "[]")) || !!answers[item.id]?.attachmentIds?.length;
    const latest = current?.attempts[0];
    const changed = !latest || latest.answer !== answers[item.id]?.answer || !!answers[item.id]?.attachmentIds?.length;
    const canSubmit = !busy && (pending === item.id || (!pending && !waiting(current) && !!hasWork && (changed || !latest?.result)));
    blocks.push({ id: `cau-${index + 1}`, kind: "item", label: `Câu ${index + 1}`, long: item.input === "long",
      reservedLines: 4 + (item.input === "long" ? 5 : item.input === "short" && item.attachment !== "none" ? 1 : 0)
        + (item.attachment !== "none" ? 2 : 0),
      extraLine: item.prompt.length > 60,
      text: [item.prompt, item.instructions, ...(item.choices ?? []).map(choice => choice.text)].filter((value): value is string => !!value).map(value => ({ value })),
      node: <ItemCard formatText={formatText} item={item} number={index + 1}
        value={answers[item.id] ?? { answer: "" }} disabled={busy || !!pending} readOnly={frozen}
        onChange={value => change(item.id, value)} onReveal={level => reveal(item.id, level)}
        onSubmit={() => void submit(item.id)} canSubmit={canSubmit}
        submitLabel={current ? words.action.recheck : words.action.check}
        feedbackResult={latest?.result} feedbackSupported={latest?.support === "solution"}
        feedbackPreview={latest?.feedback ? (formatText?.(latest.feedback) ?? latest.feedback)
          : current && waiting(current) ? runner?.online === false ? words.status.gradeLater : words.status.grading
          : latest?.result ? words.result[latest.result as keyof typeof words.result] : undefined}
        feedback={current && <>
          <Feedback submission={current} items={[item]} readOnly={frozen} child={child} formatText={formatText} onRefresh={() => void refreshFeedback()} />
          <PreviousFeedback items={previous} item={item} readOnly={frozen} formatText={formatText} />
        </>} />,
    });
  }
  if (lesson.output) blocks.push({ id: "product", kind: "product", text: [{ value: lesson.output }], node: <p>{words.place.product} · {lesson.output}</p> });
  blocks.push({ id: "summary", kind: "summary", node: <>
    {!readonly && !lesson.completedAt && <button className={buttonClass("primary")} disabled={busy || !!pending} onClick={() => void complete()}>{words.action.finish}</button>}
    {!readonly && lesson.completedAt && <button className={pencilLink} disabled={busy || !!pending} onClick={() => void complete()}>{words.action.reopen}</button>}
    <PaperConfirm open={confirmFinish && !busy && !pending}
      message="Bạn vẫn muốn đánh dấu xong bài này?" confirmLabel={words.action.finish}
      onCancel={() => setConfirmFinish(false)} onConfirm={() => void complete(true)} />
    <LessonSummary lessonId={id} subjectId={lesson.subjectId} learner={learner} waiting={waitingForGrade}
      onQuestion={itemId => {
        const index = lesson.items.findIndex(item => item.id === itemId);
        if (index >= 0) jump(`cau-${index + 1}`);
      }}
      progressKey={history.map(entry => entry.id).join(",") + "|" + lesson.items.filter(item => item.revealed.solutionSeen).map(item => item.id).join(",")}
      reflectionId={lesson.completedAt ? reflection?.id : undefined} onOpen={openLesson} go={go}
      onHome={() => go({ view: "book", id: lesson.subjectId })} onReview={() => jump("head")} completed={!!lesson.completedAt} justCompleted={justCompleted} />
  </> });
  return <Book id={lesson.subjectId} title={lesson.subjectTitle ?? lesson.title} page="lesson" go={go}>
    {readonly && <p className={pencil}>Bạn đang xem bài của người học.</p>}
    {feedbackError && <p role="alert">{words.error.unknown} <button onClick={() => void refreshFeedback()} className={pencilLink}>{words.action.retry}</button></p>}
    {error && <p role="alert" className="text-brick">{error}</p>}
    <Spread blocks={blocks} startAt={startAt} jump={pageJump} child={child} status={state} />
  </Book>;

  function jump(block: string) {
    setPageJump(previous => ({ id: block, key: (previous?.key ?? 0) + 1 }));
  }
}

function PreviousFeedback({ items, item, readOnly, formatText }: {
  items: SubmissionView[]; item: Lesson["items"][number]; readOnly: boolean; formatText?: (text: string) => string;
}) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return <div>
    <button type="button" className={pencilLink} aria-expanded={open} onClick={() => setOpen(!open)}>Lần trước</button>
    {open && items.map(submission => <Feedback earlier key={submission.id} submission={submission} items={[item]} readOnly={readOnly} formatText={formatText} />)}
  </div>;
}
