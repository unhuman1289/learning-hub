"use client";
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
    [submission, setSubmission] = useState<SubmissionView | null>(null),
    [pending, setPending] = useState(false);
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
        setSubmission(result.lastSubmission ?? null);
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
      setSubmission(response.submission);
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
    items = lesson.items.filter((item) => stage.itemIds.includes(item.id));
  return (
    <RuledPage className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
      {readonly && <p className="bg-rose-soft p-3">Đang xem bài của người học — chỉ đọc.</p>}
      {!opened ? (
        <Cover title={lesson.title} objective={lesson.objective} why={lesson.why} minutes={lesson.estMinutes} onStart={() => setOpened(true)} />
      ) : (
        <>
          <h1 className="font-print text-3xl">{lesson.title}</h1>
          <nav aria-label="Các phần của bài" className="flex flex-wrap gap-2">
            {lesson.stages.map((s, i) => (
              <button
                key={s.stage}
                aria-current={i === stageIndex ? "step" : undefined}
                className={buttonClass(i === stageIndex ? "primary" : "secondary")}
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
              <Sheet sheet={lesson.sheet} />
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
            items={items}
            answers={answers}
            disabled={busy || pending}
            readOnly={readonly}
            onChange={change}
            onReveal={reveal}
          />
          <div aria-live="polite" role="status">
            {state}
          </div>
          {error && (
            <p role="alert" className="rounded border border-red-700 p-3">
              {error}
            </p>
          )}
          {!readonly && (
            <div className="flex flex-wrap gap-3">
              <button className={buttonClass("secondary")} disabled={busy || pending} onClick={() => void save()}>
                Lưu nháp
              </button>
              {items.length > 0 && (
                <button className={buttonClass("primary")} disabled={busy || !!lesson.completedAt} onClick={() => void submit()}>
                  {pending ? "Kiểm tra lượt nộp" : "Nộp phần này"}
                </button>
              )}
              <button
                className={buttonClass("secondary")}
                disabled={busy || pending}
                onClick={() => {
                  pendingSubmission.current = null;
                  setSubmission(null);
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
          <Feedback
            submission={submission}
            items={lesson.items}
            readOnly={readonly}
            onRevealSolution={async (itemId) => {
              await reveal(itemId, "solution");
              if (!submission) return;
              const fresh = await json<{ submission: SubmissionView }>(`/api/submissions/${submission.id}${suffix}`).catch(() => null);
              if (fresh) setSubmission(fresh.submission);
            }}
            onRefresh={() => {
              if (!submission) return;
              void json<{ submission: SubmissionView }>(`/api/submissions/${submission.id}${suffix}`)
                .then((value) => setSubmission(value.submission))
                .catch((e: Error) => setError(e.message));
            }}
          />
          <p className="leading-7">Tiếp theo: {lesson.nextTopic}</p>
          <p className="text-sm text-muted">Hoàn thành do bạn đánh dấu, không phụ thuộc điểm. Bài tiếp chỉ được giao theo mốc 03:00 Berlin.</p>
        </>
      )}
    </RuledPage>
  );
}
