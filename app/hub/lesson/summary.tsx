"use client";
import { Stamp } from "../../../components/notebook/paper";
import { useEffect, useState, type ReactNode } from "react";
import type { LessonSummaryData } from "../../../lib/lesson-v2/summary";
import { apiJson, learnerQuery } from "../api";
import { useLiveRefresh } from "../use-live-refresh";
import { pencil, RedPen, skillLabel } from "../paper-bits";
import { buttonClass, RouteLink } from "../ui";
import type { Route } from "../use-route";
import type { TodayItem } from "../../../lib/today";

export function LessonSummary({ lessonId, subjectId, learner, waiting, progressKey, onQuestion, completed = true, justCompleted = false, go, children }: {
  lessonId: string; learner: string | null; waiting: boolean; progressKey?: string; onQuestion?: (id: string) => void;
  completed?: boolean; justCompleted?: boolean; subjectId: string; go: (route: Route) => void; children: ReactNode;
}) {
  const [data, setData] = useState<LessonSummaryData | null>(null), [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  const [nextError, setNextError] = useState("");
  async function openNext() {
    setOpening(true);
    setNextError("");
    try {
      const { items } = await apiJson<{ items: TodayItem[] }>("/api/today" + learnerQuery(learner));
      const next = items.find(item => item.subjectId === subjectId && item.lessonId && item.lessonId !== lessonId);
      go(next?.lessonId
        ? { view: "lesson", id: next.lessonId, correction: next.category === "correction" ? true : undefined }
        : { view: "book", id: subjectId, page: "hom-nay" });
    } catch (cause) {
      setNextError((cause as Error).message);
    } finally {
      setOpening(false);
    }
  }
  const url = `/api/lessons/${lessonId}/summary${learnerQuery(learner)}`;
  useEffect(() => {
    let live = true;
    apiJson<{summary: LessonSummaryData}>(url).then(({summary}) => { if (live) { setData(summary); setError(""); } })
      .catch((e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [url, waiting, progressKey]);
  useLiveRefresh(async () => {
    const {summary} = await apiJson<{summary: LessonSummaryData}>(url);
    setData(summary); setError("");
  }, waiting || !!data?.pending, 5000);
  const tally = [
    ["correctFirst", "đúng ngay"], ["correctAfterRetry", "đúng sau khi sửa"], ["needsCorrection", "cần sửa lại"],
    ["solutionsSeen", "đã xem lời giải"], ["unanswered", "chưa làm"], ["pending", "chờ chấm"],
  ] as const;
  const needsWork = data && (data.needsCorrection > 0 || data.unanswered > 0);
  return (
    <section aria-label="Tổng kết bài">
      <h1 tabIndex={-1} data-lesson-heading className="mb-3 font-print text-4xl leading-tight">Tổng kết bài</h1>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status" className={pencil}>Đang đọc tổng kết…</p>}
      {data && <>
        {completed && <Stamp label={needsWork ? "Cố lên!" : data.pending || data.solutionsSeen ? "Đã học" : "Giỏi lắm!"}
          className={needsWork ? "border-warn! text-warn!" : undefined} pressed={justCompleted} />}
        <ul>
          {tally.filter(([key]) => data[key] > 0).map(([key, label]) => {
            const id = data.firstByResult?.[key];
            const content = <><span className="w-8 text-right font-hand text-2xl leading-7 tabular-nums text-accent">{data[key]}</span><span>câu {label}</span></>;
            return <li key={key}>{id && onQuestion
              ? <button type="button" className="flex min-h-11 items-baseline gap-3 hover:underline" onClick={() => onQuestion(id)}>{content}</button>
              : <span className="flex items-baseline gap-3">{content}</span>}</li>;
          })}
        </ul>
        <p className={pencil}>{data.minutes} phút học sổ này hôm nay{data.hintsUsed ? ` · ${data.hintsUsed} lần xem gợi ý` : ""}.</p>
        {data.needsPractice.length > 0 && <p>Nên luyện thêm: {data.needsPractice.map(skillLabel).join(", ")}.</p>}
        {data.comments.map(comment => <RedPen key={comment} className="mt-7">{comment}</RedPen>)}
      </>}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {completed && <button type="button" disabled={opening} className={buttonClass("primary")} onClick={() => void openNext()}>
          {opening ? "Đang tìm bài…" : "Bài tiếp theo"}
        </button>}
        <RouteLink route={{ view: "desk" }} go={go} className={buttonClass("secondary")}>Về bàn</RouteLink>
        {children}
      </div>
      {nextError && <p role="alert" className="mt-2 text-brick">{nextError}</p>}
    </section>
  );
}
