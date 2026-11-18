"use client";
import type { TutorTurn } from "../../../lib/contracts/tutor";
import { Stamp } from "../../../components/notebook/paper";
import { useEffect, useState, type ReactNode } from "react";
import type { LessonSummaryData } from "../../../lib/lesson-v2/summary";
import { apiJson, learnerQuery } from "../api";
import { useLiveRefresh } from "../use-live-refresh";
import { pencil, RedPen, skillLabel } from "../paper-bits";
import { buttonClass, RouteLink } from "../ui";
import type { Route } from "../use-route";
import type { SubmissionView } from "../lesson-v2/feedback";
import type { ItemView } from "../../../lib/lesson-v2/store";
import type { DraftAnswers } from "../../../lib/lesson-v2/actions";
import { hasLessonAnswer } from "../../../lib/lesson-v2/answer";
import { feedbackForItems } from "../../../lib/feedback-history";
import type { TodayItem } from "../../../lib/today";

export function LessonSummary({ lessonId, subjectId, learner, waiting, progressKey, onQuestion, completed = true, justCompleted = false, go, children, items, answers, history }: {
  lessonId: string; learner: string | null; waiting: boolean; progressKey?: string; onQuestion?: (id: string) => void;
  items: ItemView[]; answers: DraftAnswers; history: SubmissionView[];
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
  const needsWork = data && (data.needsCorrection > 0 || data.unanswered > 0);
  return (
    <section aria-label="Tổng kết bài">
      <h1 tabIndex={-1} data-lesson-heading className="mb-3 font-print text-4xl leading-tight">Tổng kết bài</h1>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status" className={pencil}>Đang đọc tổng kết…</p>}
      {data && <>
        {completed && <Stamp label={needsWork ? "Cố lên!" : data.pending || data.solutionsSeen ? "Đã học" : "Giỏi lắm!"}
          className={needsWork ? "border-warn! text-warn!" : undefined} pressed={justCompleted} />}
        <ul aria-label="Từng câu" className="divide-y divide-rule">
          {items.map((item, index) => {
            const submission = feedbackForItems(history, [item.id])[0];
            const attempt = submission?.attempts[0];
            const answered = hasLessonAnswer(item.input, answers[item.id]?.answer ?? "") || !!answers[item.id]?.attachmentIds?.length;
            const mark = attempt?.result === "correct" ? "ĐÚNG" : attempt?.result === "incorrect" || attempt?.result === "partial" ? "SỬA LẠI" : attempt ? "· · ·" : answered ? "✓" : "–";
            const comment = attempt?.feedback || (attempt ? (attempt.result ? "Đã chấm" : "Chờ lời phê") : answered ? "Đã làm" : "Chưa làm");
            return <li key={item.id}><button type="button" onClick={() => onQuestion?.(item.id)} className="flex min-h-11 w-full items-baseline gap-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-accent-paper">
              <span className="shrink-0 font-hand text-xl">Câu {index + 1}</span>
              <span className="shrink-0 font-hand text-lg text-brick">{mark}</span>
              <span className="min-w-0 truncate text-sm">{comment}</span>
            </button></li>;
          })}
        </ul>
        <p className={pencil}>{data.minutes} phút học sổ này hôm nay{data.hintsUsed ? ` · ${data.hintsUsed} lần xem gợi ý` : ""}.</p>
        {data.needsPractice.length > 0 && <p>Nên luyện thêm: {data.needsPractice.map(skillLabel).join(", ")}.</p>}
        {data.comments.map(comment => <RedPen key={comment} className="mt-7">{comment}</RedPen>)}
        {!!data.tutorTurns?.length && <section aria-label="Nhận xét của gia sư" className="mt-7">
          <h2 className="font-hand text-xl">Nhận xét của gia sư</h2>
          <ul className="space-y-3">
            {data.tutorTurns.map(turn => <li key={turn.id} className="break-words">
              <p className="whitespace-pre-wrap">{turn.question}</p>
              <RedPen>{turn.answer ?? tutorStatus[turn.status]}</RedPen>
            </li>)}
          </ul>
        </section>}
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

const tutorStatus: Record<TutorTurn["status"], string> = {
  queued: "Đang chờ gia sư.",
  streaming: "Gia sư đang trả lời.",
  answered: "Đã trả lời.",
  failed: "Chưa trả lời được câu hỏi.",
  blocked: "Không hiển thị gợi ý cho lượt này.",
};
