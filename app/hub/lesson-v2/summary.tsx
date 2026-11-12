"use client";
import { Stamp } from "../../../components/notebook/paper";
import { words } from "../words";
import { useEffect, useState } from "react";
import type { LessonSummaryData } from "../../../lib/lesson-v2/summary";
import { apiJson, learnerQuery } from "../api";
import { useLiveRefresh } from "../use-live-refresh";
import { NewLessonRequest } from "../new-lesson-request";
import { AdaptiveRequests } from "../adaptive-requests";
import { pencil, pencilLink, RedPen, skillLabel } from "../paper-bits";
import type { Route } from "../use-route";
import { LessonReflection } from "./reflection";

export function LessonSummary({ lessonId, subjectId, learner, reflectionId, waiting, progressKey, onQuestion, onReview, onHome, onOpen, go, completed = true, justCompleted = false }: {
  lessonId: string; subjectId: string; learner: string | null; reflectionId?: string; waiting: boolean; progressKey?: string; onQuestion?: (id: string) => void;
  completed?: boolean; justCompleted?: boolean; onReview: () => void; onHome: () => void; onOpen: (id: string) => void; go: (route: Route) => void;
}) {
  const [data, setData] = useState<LessonSummaryData | null>(null), [error, setError] = useState("");
  const [adaptive, setAdaptive] = useState<boolean | null>(null);
  const url = `/api/lessons/${lessonId}/summary${learnerQuery(learner)}`;
  useEffect(() => {
    let live = true;
    apiJson<{summary: LessonSummaryData; adaptive: boolean}>(url).then(({summary, adaptive}) => { if (live) { setData(summary); setAdaptive(adaptive); } })
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
      <h2 tabIndex={-1} className="font-hand text-[28px] leading-[3.5rem] text-accent">Tổng kết bài</h2>
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
        {!learner && reflectionId && <LessonReflection key={reflectionId} submissionId={reflectionId} minutes={data.minutes} />}
      </>}
      <div className="mt-7">
        {!learner && adaptive === false && <NewLessonRequest subjectId={subjectId} onOpen={onOpen} />}
        {!learner && adaptive && <AdaptiveRequests subjectId={subjectId} learner={learner} go={go} onSaved={() => undefined} />}
      </div>
      <div className="flex min-h-14 flex-wrap items-center gap-x-5">
        <button onClick={onReview} className={pencilLink}>{words.action.review}</button>
        <button onClick={onHome} className={pencilLink}>{words.action.close}</button>
      </div>
    </section>
  );
}
