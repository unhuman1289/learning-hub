"use client";
import type { ItemView } from "../../../lib/lesson-v2/store";
import { DisputeControl, type DisputeState } from "./dispute-dialog";
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
  stage?:string|null; created_at?:string;job_status?:string|null;summary?:string|null;
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
  formatText = (text:string)=>text,
  onRevealSolution,
  compact = false,
}: {
  formatText?:(text:string)=>string;
  submission: SubmissionView | null;
  items?: ItemView[];
  readOnly?: boolean;
  onRefresh?: () => void;
  compact?: boolean;
  onRevealSolution?: (itemId: string) => void;
}) {
  if (!submission) return null;
  return (
    <section aria-label="Lời phê" className="space-y-6 py-4">
      {!compact && <h2 className="font-hand text-2xl">Lời phê</h2>}
      {submission.summary && (
        <div className="border-l-4 border-accent pl-4">
          <h3 className="font-semibold">Nhận xét chung</h3>
          <p className="whitespace-pre-wrap break-words leading-7">{formatText(submission.summary)}</p>
        </div>
      )}
      {submission.attempts.map((a) => (
        <div key={a.id} className="space-y-3 border-l border-accent pl-4">
          <h3 className="font-semibold">
            Lần {a.attempt_no} ·{" "}
            {a.result === "correct" ? "Đúng" : a.result === "partial" ? "Đúng một phần" : a.result === "incorrect" ? "Cần sửa" : ['cancelled','expired','failed'].includes(submission.job_status ?? '')?"Chưa chấm":"Đang chờ chấm"}
          </h3>
          <p className="whitespace-pre-wrap break-words leading-7">
            Bài đã nộp:{" "}
            {formatText(answerLabel(
              a.answer,
              items.find((i) => i.id === a.item_id),
            ))}
          </p>
          {a.feedback && <p className="whitespace-pre-wrap break-words leading-7 text-accent">{formatText(a.feedback)}</p>}
          {a.correction && <p className="whitespace-pre-wrap break-words leading-7">Lời giải: {formatText(a.correction)}</p>}
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
          {!a.result && <p className="text-sm text-muted">{['cancelled','expired','failed'].includes(submission.job_status ?? '')?"Câu trả lời đã lưu nhưng lượt chấm đã dừng.":"Câu trả lời đã lưu, đang chờ nhận lời phê."}</p>}
          {a.result && onRefresh && <DisputeControl attemptId={a.id} dispute={a.dispute ?? null} readOnly={readOnly} onChanged={onRefresh} />}
        </div>
      ))}
    </section>
  );
}
