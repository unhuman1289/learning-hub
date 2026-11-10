"use client";
import { useEffect, useState } from "react";
import type { LessonSummaryData } from "../../../lib/lesson-v2/summary";
import { apiJson, learnerQuery } from "../api";
import { buttonClass } from "../ui";
import { useLiveRefresh } from "../use-live-refresh";
import { NewLessonRequest } from "../new-lesson-request";
import { LessonReflection } from "./reflection";

export function LessonSummary({ lessonId, subjectId, learner, reflectionId, waiting, onReview, onHome, onOpen }: {
  lessonId: string; subjectId: string; learner: string | null; reflectionId?: string; waiting: boolean;
  onReview: () => void; onHome: () => void; onOpen: (id: string) => void;
}) {
  const [data, setData] = useState<LessonSummaryData | null>(null), [error, setError] = useState("");
  const url = `/api/lessons/${lessonId}/summary${learnerQuery(learner)}`;
  useEffect(() => {
    let live = true;
    apiJson<{summary: LessonSummaryData}>(url).then(({summary}) => { if (live) setData(summary); })
      .catch((e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [url, waiting]);
  useLiveRefresh(async () => {
    const {summary} = await apiJson<{summary: LessonSummaryData}>(url);
    setData(summary); setError("");
  }, waiting || !!data?.pending, 5000);
  return (
    <section className="space-y-5 bg-paper py-4" aria-label="Tổng kết bài">
      <h2 className="font-hand text-3xl">Tổng kết bài</h2>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Đang đọc tổng kết…</p>}
      {data && <>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          {([[data.correctFirst,"Đúng ngay"],[data.correctAfterRetry,"Đúng sau khi sửa"],[data.needsCorrection,"Còn cần sửa"],
            [data.unanswered,"Chưa làm"],[data.pending,"Chờ chấm"],[data.hintsUsed,"Gợi ý đã dùng"]] as const).map(([n,label]) =>
            <div key={label}><dt className="text-sm text-muted">{label}</dt><dd className="text-xl font-semibold tabular-nums">{n}</dd></div>
          )}
        </dl>
        <p className="text-sm text-muted">{data.minutes} phút học sổ này hôm nay.</p>
        {data.needsPractice.length > 0 && <p><strong>Nên luyện thêm:</strong> {data.needsPractice.join(", ")}.</p>}
        {data.comments.length > 0 && <div className="space-y-2 border-t border-line pt-3"><h3 className="font-hand text-xl">Nhận xét chung</h3>{data.comments.map(comment => <p key={comment} className="whitespace-pre-wrap break-words">{comment}</p>)}</div>}
        {!learner && reflectionId && <LessonReflection key={reflectionId} submissionId={reflectionId} minutes={data.minutes} />}
      </>}
      {!learner && <NewLessonRequest subjectId={subjectId} onOpen={onOpen} />}
      <div className="flex flex-wrap gap-3">
        <button onClick={onReview} className={buttonClass("secondary")}>Xem lại bài</button>
        <button onClick={onHome} className={buttonClass("ghost")}>Về bàn học</button>
      </div>
    </section>
  );
}
