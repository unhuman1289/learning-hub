"use client";
import type { ItemView } from "../../../lib/lesson-v2/store";
import { pencil, pencilLink, RedPen, ResultStamp } from "../paper-bits";
import { parseStructuredAnswer } from "../../../lib/lesson-v2/answer";
import { DisputeControl, type DisputeState } from "./dispute-dialog";
function answerLabel(answer: string, item?: ItemView) {
  if (!item || item.input === "short" || item.input === "long" || item.input === "code") return answer;
  const value = parseStructuredAnswer(answer);
  if (item.input === "match" && value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value).map(([left, right]) =>
      `${item.left.find(option => option.id === left)?.text ?? left} → ${item.right.find(option => option.id === right)?.text ?? right}`).join(" · ");
  }
  if (!Array.isArray(value)) return answer;
  if (item.input === "choice" || item.input === "order") {
    const options = "steps" in item ? item.steps : item.choices;
    return value.map(id => options?.find(option => option.id === id)?.text ?? id).join(" · ");
  }
  return value.map((cell, index) => `${index + 1}. ${cell || "—"}`).join(" · ");
}

function linkedLines(text: string, onLine?: (line: number) => void) {
  if (!onLine) return text;
  return text.split(/(dòng\s+[1-9]\d{0,3}\b)/gi).map((part, index) => index % 2 === 0 ? part
    : <button key={index} type="button" className={pencilLink} onClick={() => onLine(Number(part.match(/\d+/)?.[0]))}>{part}</button>);
}

export type SubmissionView = {
  id: string;
  status: string;
  stage?:string|null; created_at?:string;job_status?:string|null;summary?:string|null;
  attempts: {
    id: string;
    item_id: string;
    answer: string;
    attachmentIds?: string[];
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
  onCodeLine,
}: {
  formatText?:(text:string)=>string;
  submission: SubmissionView | null;
  items?: ItemView[];
  readOnly?: boolean;
  onRefresh?: () => void;
  earlier?: boolean;
  child?: boolean;
  onCodeLine?: (line: number) => void;
}) {
  if (!submission) return null;
  return (
    <section aria-label={earlier ? "Lần làm trước" : "Lời phê"}>
      {submission.attempts.map((a) => {
        const item = items.find(i => i.id === a.item_id);
        const unrun = a.result && item?.input === "code" && !/chưa chạy thử/i.test(a.feedback ?? "");
        return <div key={a.id}>
          {earlier && <p className={pencil}>Lần {a.attempt_no}: {formatText(answerLabel(a.answer, item))}</p>}
          <div className="flex flex-wrap items-baseline gap-x-3">
            <ResultStamp result={a.result} className={a.support === "solution" ? "opacity-60" : undefined} />
            {a.support === "solution" && a.result === "correct" && <p className={pencil}>Đã xem lời giải, không tính điểm.</p>}
            {(a.feedback || unrun) && <RedPen className="min-w-0 flex-1 basis-60">
              {a.feedback && linkedLines(formatText(a.feedback), onCodeLine)}
              {unrun && " Chưa chạy thử."}
            </RedPen>}
          </div>
          {a.correction && <RedPen>✎ {linkedLines(formatText(a.correction), onCodeLine)}</RedPen>}
          {a.correctionHidden && <p className={pencil}>Thử sửa lại trước; bản sửa sẽ hiện nếu lần sau vẫn chưa đúng.</p>}
          {!a.result && <p className={pencil}>{stopped(submission.job_status) ? "Bài đã lưu, sẽ có lời phê sau." : "Đang chấm…"}</p>}
          {!earlier && a.result && onRefresh && <DisputeControl attemptId={a.id} dispute={a.dispute ?? null} readOnly={readOnly} child={child} onChanged={onRefresh} />}
        </div>;
      })}
      {!earlier && submission.summary && <RedPen className="mt-7">{formatText(submission.summary)}</RedPen>}
    </section>
  );
}
