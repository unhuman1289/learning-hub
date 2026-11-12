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

export function LessonSummary({ lessonId, subjectId, learner, reflectionId, waiting, onReview, onHome, onOpen, go, completed = true }: {
  lessonId: string; subjectId: string; learner: string | null; reflectionId?: string; waiting: boolean;
  completed?: boolean; onReview: () => void; onHome: () => void; onOpen: (id: string) => void; go: (route: Route) => void;
}) {
  const [data, setData] = useState<LessonSummaryData | null>(null), [error, setError] = useState("");
  const [adaptive, setAdaptive] = useState<boolean | null>(null);
  const url = `/api/lessons/${lessonId}/summary${learnerQuery(learner)}`;
  useEffect(() => {
    let live = true;
    apiJson<{summary: LessonSummaryData; adaptive: boolean}>(url).then(({summary, adaptive}) => { if (live) { setData(summary); setAdaptive(adaptive); } })
      .catch((e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [url, waiting]);
  useLiveRefresh(async () => {
    const {summary} = await apiJson<{summary: LessonSummaryData}>(url);
    setData(summary); setError("");
  }, waiting || !!data?.pending, 5000);
  const tally: [number, string][] = data ? [[data.correctFirst, "đúng ngay"], [data.correctAfterRetry, "đúng sau khi sửa"], [data.needsCorrection, "cần sửa lại"], [data.unanswered, "chưa làm"], [data.pending, "chờ chấm"]] : [];
  return (
    <section aria-label="Tổng kết bài">
      <h2 tabIndex={-1} className="font-hand text-[28px] leading-[3.5rem] text-accent">Tổng kết bài</h2>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status" className={pencil}>Đang đọc tổng kết…</p>}
      {data && <>
        {completed && <Stamp label={data.needsCorrection || data.unanswered ? "Cố lên!" : data.pending ? "Đã học" : "Giỏi lắm!"} pressed />}
        <ul>
          {tally.filter(([n]) => n > 0).map(([n, label]) => <li key={label} className="flex items-baseline gap-3">
            <span className="w-8 text-right font-hand text-2xl leading-7 tabular-nums text-accent">{n}</span><span>câu {label}</span>
          </li>)}
        </ul>
        <p className={pencil}>{data.minutes} phút học sổ này hôm nay{data.hintsUsed ? ` · ${data.hintsUsed} lần xem gợi ý` : ""}.</p>
        {data.needsPractice.length > 0 && <p>Nên luyện thêm: {data.needsPractice.map(skillLabel).join(", ")}.</p>}
        {data.comments.map(comment => <RedPen key={comment} className="mt-7">{comment}</RedPen>)}
        {!learner && reflectionId && <LessonReflection key={reflectionId} submissionId={reflectionId} minutes={data.minutes} />}
      </>}
      <div className="mt-7">
        {completed && !learner && adaptive === false && <NewLessonRequest subjectId={subjectId} onOpen={onOpen} />}
        {completed && !learner && adaptive && <AdaptiveRequests subjectId={subjectId} learner={learner} go={go} onSaved={() => undefined} />}
      </div>
      <div className="flex h-14 flex-wrap items-center gap-x-5">
        <button onClick={onReview} className={pencilLink}>{words.action.review}</button>
        <button onClick={onHome} className={pencilLink}>{words.action.close}</button>
      </div>
    </section>
  );
}
