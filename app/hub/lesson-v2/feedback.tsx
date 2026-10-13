"use client";
import type { ItemView } from "../../../lib/lesson-v2/store";
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
    attempt_no: number;
    support: string;
  }[];
};
export function Feedback({ submission, items = [] }: { submission: SubmissionView | null; items?: ItemView[] }) {
  if (!submission) return null;
  return (
    <section aria-label="Lời phê" className="space-y-3">
      <h2 className="font-hand text-2xl">Lời phê</h2>
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
          {!a.result && <p className="text-sm text-muted">Câu trả lời đã lưu, đang chờ nhận lời phê.</p>}
        </div>
      ))}
    </section>
  );
}
