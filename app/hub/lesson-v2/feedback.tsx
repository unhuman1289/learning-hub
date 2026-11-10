"use client";
import type { ItemView } from "../../../lib/lesson-v2/store";
import { DisputeControl, type DisputeState } from "./dispute-dialog";
import { GraderOffline } from "../runner-status";
function answerLabel(answer: string, item?: ItemView) {
  if (item?.input !== "choice") return answer;
  try {
    const selected = JSON.parse(answer) as string[];
    return selected.map((id) => item.choices?.find((c) => c.id === id)?.text ?? id).join("; ");
  } catch {
    return answer;
  }
}
export type SubmissionView = {
  id: string;
  status: string;
  attempts: {
    id: string;
    item_id: string;
    answer: string;
    status: string;
    result: string | null;
    score: number | null;
    feedback: string | null;
    correction: string | null;
    /** First wrong answer: the fix stays hidden until a retry or "Xem lời giải" (D21). */
    correctionHidden?: boolean;
    attempt_no: number;
    support: string;
    dispute?: DisputeState;
  }[];
};
export function Feedback({
  submission,
  items = [],
  readOnly = false,
  onRefresh,
  onRevealSolution,
}: {
  submission: SubmissionView | null;
  items?: ItemView[];
  readOnly?: boolean;
  onRefresh?: () => void;
  onRevealSolution?: (itemId: string) => void;
}) {
  if (!submission) return null;
  return (
    <section aria-label="Lời phê" className="space-y-3">
      <h2 className="font-hand text-2xl">Lời phê</h2>
      <GraderOffline waiting={submission.attempts.some((a) => !a.result || a.dispute?.status === "rechecking")} what="Câu đang chờ" />
      {submission.attempts.map((a) => (
        <div key={a.id} className="border-l border-red-700 pl-4">
          <h3 className="font-semibold">
            {a.item_id} · Lần {a.attempt_no} ·{" "}
            {a.result === "correct" ? "✓" : a.result === "partial" ? "½" : a.result === "incorrect" ? "✗" : "Đang chờ chấm"}
          </h3>
          <p className="whitespace-pre-wrap">
            Bài đã nộp:{" "}
            {answerLabel(
              a.answer,
              items.find((i) => i.id === a.item_id),
            )}
          </p>
          {a.feedback && <p className="text-red-800 dark:text-red-300">{a.feedback}</p>}
          {a.correction && <p className="whitespace-pre-wrap">Lời giải: {a.correction}</p>}
          {a.correctionHidden && (
            <p className="text-sm text-muted">
              Thử sửa lại câu này trước; bản sửa sẽ hiện nếu lần sau vẫn chưa đúng.{" "}
              {!readOnly && onRevealSolution && (
                <button
                  type="button"
                  className="underline underline-offset-2"
                  onClick={() => {
                    if (window.confirm("Xem lời giải sẽ được ghi nhận là đã dùng hỗ trợ. Vẫn mở lời giải?")) onRevealSolution(a.item_id);
                  }}
                >
                  Xem lời giải
                </button>
              )}
            </p>
          )}
          {!a.result && <p className="text-sm text-muted">Câu trả lời đã lưu, đang chờ nhận lời phê.</p>}
          {a.result && onRefresh && <DisputeControl attemptId={a.id} dispute={a.dispute ?? null} readOnly={readOnly} onChanged={onRefresh} />}
        </div>
      ))}
    </section>
  );
}
