"use client";
import {useLiveRefresh} from "../use-live-refresh";
import {feedbackForItems} from "../../../lib/feedback-history";
import {LessonReflection} from "./reflection";
import {formatChemicalText,isChemistryNotebook} from "../../../lib/chemistry";
import { useCallback, useEffect, useId, useRef, useState } from "react";
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
    throw new RequestError("Mất kết nối. Nháp còn trên trang; có mạng lại thì bấm Lưu nháp. Nếu đang nộp, bấm Kiểm tra lượt nộp.", 0);
  }
  const value = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new RequestError(value.error || "Chưa xác nhận thao tác.", response.status);
  return value;
}
export function LessonReader({
  id,
  learner,
  drafts,
  onLoaded,
  onCompleted,
}: {
  id: string;
  learner: string | null;
  drafts: Drafts;
  onLoaded?: (id: string, subject: string) => void;
  onCompleted?: () => Promise<void>;
}) {
  const [lesson, setLesson] = useState<Lesson | null>(null),
    [opened, setOpened] = useState(false),
    [stageIndex, setStageIndex] = useState(0);
  const [answers, setAnswers] = useState<DraftAnswers>({}),
    [error, setError] = useState(""),
    [state, setState] = useState(""),
    [busy, setBusy] = useState(false),
    [history,setHistory]=useState<SubmissionView[]>([]),
    [feedbackError,setFeedbackError]=useState(""),
    [pending, setPending] = useState(false);
  const feedbackId = useId();
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
  useLiveRefresh(refreshFeedback,!!lesson&&!busy&&!pending);
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
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!lesson) return;
    setBusy(true);
    setError("");
    try {
      if (!pendingSubmission.current) {
        if (!(await save())) return;
        const stage = lesson.stages[stageIndex];
        pendingSubmission.current = {
          clientSubmissionId: crypto.randomUUID(),
          draftRevision: revision.current,
          stage: stage.stage,
          itemIds: stage.itemIds,
        };
        setPending(true);
      }
      const response = await json<{ submission: SubmissionView }>(url + "/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingSubmission.current),
      });
      setHistory(current=>[response.submission,...current.filter(s=>s.id!==response.submission.id)]);
      pendingSubmission.current = null;
      setPending(false);
      setState("Đã nộp");
    } catch (e) {
      if (e instanceof RequestError && e.status >= 400 && e.status < 500) {
        pendingSubmission.current = null;
        setPending(false);
      }
      setError((e as Error).message + (pendingSubmission.current ? " Nếu kết quả chưa rõ, dùng “Kiểm tra lượt nộp” với cùng mã." : ""));
    } finally {
      setBusy(false);
    }
  }
  async function complete() {
    if (!lesson) return;
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
  const stage = lesson.stages[stageIndex],
    items = lesson.items.filter((item) => stage.itemIds.includes(item.id)),
    stageHistory=feedbackForItems(history,stage.itemIds),
    latestGraded=stageHistory.find(s=>s.attempts.some(a=>a.result)),
    reflectionSubmission=history.find(s=>stageHistory.some(entry=>entry.id===s.id)&&s.attempts.length>0&&s.attempts.every(a=>a.result));
  return (
    <RuledPage className="mx-auto max-w-4xl space-y-8">
      {readonly && <p className="bg-rose-soft p-3">Đang xem bài của người học — chỉ đọc.</p>}
      {!opened ? (
        <><Cover title={lesson.title} objective={lesson.objective} why={lesson.why} minutes={lesson.estMinutes} onStart={() => setOpened(true)} />
        {history.some(s=>s.attempts.some(a=>a.result))&&<button className={buttonClass("secondary")} onClick={()=>{const index=lesson.stages.findIndex(st=>feedbackForItems(history,st.itemIds).some(s=>s.attempts.some(a=>a.result)));if(index>=0)setStageIndex(index);setOpened(true);}}>Mở bài và xem lời phê đã lưu</button>}</>
      ) : (
        <>
          <header className="space-y-3">
            <h1 className="text-balance font-print text-3xl leading-tight sm:text-4xl">{lesson.title}</h1>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
              <p className="text-muted">Phần {stageIndex + 1}/{lesson.stages.length} · {lesson.estMinutes} phút dự kiến cho cả bài</p>
              {stageHistory.length > 0 && <a href={"#" + feedbackId} className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-4">{latestGraded ? "Xem lời phê phần này" : "Xem bài đã nộp"}</a>}
            </div>
          </header>
          <nav aria-label="Các phần của bài" className="flex flex-wrap gap-2">
            {lesson.stages.map((s, i) => (
              <button
                key={s.stage}
                aria-current={i === stageIndex ? "step" : undefined}
                className={"min-h-11 rounded-md border px-3 py-2 text-left text-sm transition-colors " + (i === stageIndex ? "border-accent bg-rose-soft font-semibold text-accent-hover" : "border-line bg-paper text-muted hover:text-ink")}
                onClick={() => {
                  setStageIndex(i);
                }}
              >
                {s.title ||
                  (
                    {
                      retrieval: "Nhớ lại",
                      sheet: "Tờ kiến thức",
                      guided: "Luyện có hướng dẫn",
                      independent: "Tự làm",
                      read: "Đọc",
                      analyze: "Phân tích",
                      output: "Đầu ra",
                      check: "Kiểm tra",
                    } as Record<string, string>
                  )[s.stage]}
              </button>
            ))}
          </nav>
          {stage.stage === "sheet" && (
            <>
              <Sheet sheet={lesson.sheet} formatText={isChemistryNotebook(lesson.subjectTitle??"")?formatChemicalText:undefined} />
              {lesson.diagram && <pre className="overflow-x-auto whitespace-pre text-sm">{lesson.diagram}</pre>}
            </>
          )}
          {stage.stage === "read" && (
            <section className="space-y-4">
              {lesson.sections.map((section, i) => (
                <div key={i}>
                  <h2 className="font-hand text-2xl">{section.heading}</h2>
                  <p className="whitespace-pre-wrap leading-7">{section.text}</p>
                </div>
              ))}
              {lesson.diagram && <pre className="overflow-x-auto whitespace-pre text-sm">{lesson.diagram}</pre>}
              <ul>
                {lesson.sources.map((source, i) => (
                  <li key={i} className="my-3">
                    <a href={source.url} target="_blank" rel="noreferrer" className="text-accent underline">
                      {source.title}
                    </a>
                    <p className="text-sm text-muted">
                      Đã đọc: {source.readScope} · Truy cập: {source.retrievedAt} · Xuất bản: {source.publishedAt ?? "Chưa rõ"}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {(stage.stage === "output" || stage.stage === "independent") && lesson.output && (
            <p className="border-l border-accent p-3">Đầu ra: {lesson.output}</p>
          )}
          <Stage
            key={stage.stage}
            formatText={isChemistryNotebook(lesson.subjectTitle??"")?formatChemicalText:undefined}
            items={items}
            answers={answers}
            disabled={busy || pending}
            readOnly={readonly}
            onChange={change}
            onReveal={reveal}
          />
          <div aria-live="polite" role="status" className="min-h-6 text-sm text-muted">
            {state}
          </div>
          {error && (
            <p role="alert" className="rounded border border-red-700 p-3">
              {error}
            </p>
          )}
          {!readonly && (
            <div className="flex flex-wrap items-center gap-3 border-y border-line bg-paper py-4">
              <button className={buttonClass("ghost")} disabled={busy || pending} onClick={() => void save()}>
                Lưu nháp
              </button>
              {items.length > 0 && (
                <button className={buttonClass("primary", "order-first w-full sm:w-auto")} disabled={busy || !!lesson.completedAt} onClick={() => void submit()}>
                  {pending ? "Kiểm tra lượt nộp" : "Nộp phần này"}
                </button>
              )}
              <button
                className={buttonClass("ghost")}
                disabled={busy || pending}
                onClick={() => {
                  pendingSubmission.current = null;
                  setState("Sửa bài rồi nộp lại — lần cũ vẫn được giữ.");
                }}
              >
                Sửa lại
              </button>
              <button className={buttonClass("ghost")} disabled={busy || pending} onClick={() => void complete()}>
                {lesson.completedAt ? "Bỏ dấu đã học" : "Đã học xong"}
              </button>
            </div>
          )}
          <section id={feedbackId} aria-label="Lịch sử lời phê phần này" className="scroll-mt-28 space-y-4 bg-paper py-4">
            <h2 className="font-hand text-2xl">Bài đã nộp và lời phê · {stage.title || "phần này"}</h2>
            {feedbackError&&<p role="alert">{feedbackError} <button className="text-accent underline" onClick={()=>void refreshFeedback()}>Đọc lại lời phê</button></p>}
            {!stageHistory.length&&<p className="text-sm text-muted">Phần này chưa có lượt nộp đã lưu. Chọn phần khác để xem lời phê của phần đó.</p>}
            {stageHistory.map((saved,i)=><details key={saved.id} open={i===0||saved.id===latestGraded?.id} className="border-t border-line pt-3">
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-accent">{saved.created_at?new Intl.DateTimeFormat("vi-VN",{dateStyle:"short",timeStyle:"short",timeZone:"Europe/Berlin"}).format(new Date(saved.created_at)):"Lượt nộp"} · {saved.job_status==="cancelled"?"Đã hủy lượt chấm":saved.attempts.every(a=>a.result)?"Đã có lời phê":"Đang chờ lời phê"}</summary>
              {saved.job_status==="cancelled"&&<p className="mt-2 text-sm">Lượt chấm này đã hủy. Các lời phê ở lượt trước vẫn được giữ bên dưới.</p>}
              <Feedback formatText={isChemistryNotebook(lesson.subjectTitle??"")?formatChemicalText:undefined} submission={saved} items={lesson.items} readOnly={readonly} onRefresh={()=>void refreshFeedback()}/>
            </details>)}
            {history.length>=30&&<p className="text-sm text-muted">Hiển thị 30 lượt nộp gần nhất của bài.</p>}
          </section>
          {!readonly&&reflectionSubmission&&<LessonReflection key={reflectionSubmission.id} submissionId={reflectionSubmission.id}/>}
          <p className="leading-7">Tiếp theo: {lesson.nextTopic}</p>
          <p className="text-sm text-muted">Hoàn thành do bạn đánh dấu, không phụ thuộc điểm. Bài tiếp chỉ được giao theo mốc 00:00 Berlin.</p>
        </>
      )}
    </RuledPage>
  );
}
