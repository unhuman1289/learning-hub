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
  stage?:string|null; created_at?:string;job_status?:string|null;
  attempts: {
    id: string;
    item_id: string;
    answer: string;
    status: string;
    result: string | null;
    score: number | null;
    feedback: string | null;
    correction: string | null;
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
}: {
  formatText?:(text:string)=>string;
  submission: SubmissionView | null;
  items?: ItemView[];
  readOnly?: boolean;
  onRefresh?: () => void;
}) {
  if (!submission) return null;
  return (
    <section aria-label="Lời phê" className="space-y-6 py-4">
      <h2 className="font-hand text-2xl">Lời phê</h2>
      {submission.attempts.map((a) => (
        <div key={a.id} className="space-y-3 border-l border-accent pl-4">
          <h3 className="font-semibold">
            {a.item_id} · Lần {a.attempt_no} ·{" "}
            {a.result === "correct" ? "Đúng" : a.result === "partial" ? "Đúng một phần" : a.result === "incorrect" ? "Cần sửa" : submission.job_status==="cancelled"?"Chưa chấm · lượt đã hủy":"Đang chờ chấm"}
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
          {!a.result && <p className="text-sm text-muted">{submission.job_status==="cancelled"?"Câu trả lời đã lưu; lượt chấm này đã hủy.":"Câu trả lời đã lưu, đang chờ nhận lời phê."}</p>}
          {a.result && onRefresh && <DisputeControl attemptId={a.id} dispute={a.dispute ?? null} readOnly={readOnly} onChanged={onRefresh} />}
        </div>
      ))}
    </section>
  );
}
