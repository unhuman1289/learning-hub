"use client";
import type { ItemView } from "../../../lib/lesson-v2/store";
import { pencil, RedPen, ResultStamp } from "../paper-bits";
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
const stopped = (status?: string | null) => ["cancelled", "expired", "failed"].includes(status ?? "");

/**
 * The teacher's marks under an answer: a stamp, a remark in red pen and, when it may be shown, the correction.
 * `earlier` renders an older try, with the answer that was handed in.
 */
export function Feedback({
  submission,
  items = [],
  readOnly = false,
  onRefresh,
  formatText = (text:string)=>text,
  earlier = false,
  child = false,
}: {
  formatText?:(text:string)=>string;
  submission: SubmissionView | null;
  items?: ItemView[];
  readOnly?: boolean;
  onRefresh?: () => void;
  earlier?: boolean;
  child?: boolean;
}) {
  if (!submission) return null;
  return (
    <section aria-label={earlier ? "Lần làm trước" : "Lời phê"}>
      {submission.attempts.map((a) => (
        <div key={a.id}>
          {earlier && <p className={pencil}>Lần {a.attempt_no}: {formatText(answerLabel(a.answer, items.find((i) => i.id === a.item_id)))}</p>}
          <div className="flex flex-wrap items-baseline gap-x-3">
            <ResultStamp result={a.result} />
            {a.feedback && <RedPen className="min-w-0 flex-1 basis-60">{formatText(a.feedback)}</RedPen>}
          </div>
          {a.correction && <RedPen>✎ {formatText(a.correction)}</RedPen>}
          {a.correctionHidden && <p className={pencil}>Thử sửa lại trước; bản sửa sẽ hiện nếu lần sau vẫn chưa đúng.</p>}
          {!a.result && <p className={pencil}>{stopped(submission.job_status) ? "Bài đã lưu, sẽ có lời phê sau." : "Đang chấm…"}</p>}
          {!earlier && a.result && onRefresh && <DisputeControl attemptId={a.id} dispute={a.dispute ?? null} readOnly={readOnly} child={child} onChanged={onRefresh} />}
        </div>
      ))}
      {!earlier && submission.summary && <RedPen className="mt-7">{formatText(submission.summary)}</RedPen>}
    </section>
  );
}
