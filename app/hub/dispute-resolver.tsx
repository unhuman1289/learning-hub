"use client";

import { useState } from "react";
import { fieldClass, labelClass } from "./paper-dialog";
import { buttonClass } from "./ui";
import { apiJson } from "./api";

export type DisputeItem = {
  id: string; learnerId?: string; status: string; resolvedBy?: string | null; reason: string; message: string; createdAt: string;
  lessonTitle?: string; subjectTitle?: string; prompt?: string; answer?: string;
  grade?: Grade; recheckGrade?: Grade | null;
};

type Grade = { result: string; score: number; feedback: string; errors: { evidence: string }[] };

const reasonText: Record<string, string> = {
  answer_correct: "Cho rằng câu trả lời đúng",
  feedback_wrong: "Cho rằng nhận xét sai",
  item_wrong: "Cho rằng đề hoặc đáp án sai",
  other: "Lý do khác",
};
const resultText: Record<string, string> = { correct: "Đúng", partial: "Đúng một phần", incorrect: "Sai", ungradable: "Không chấm được" };

/** A parent's or admin's final decision on one dispute: keep, set a grade, or void the item. */
export function DisputeResolver({ dispute, learner, onDone }: { dispute: DisputeItem; learner: string; onDone: () => void }) {
  const [mode, setMode] = useState<"idle" | "set">("idle"),
    [result, setResult] = useState<"correct" | "partial" | "incorrect">("correct"),
    [feedback, setFeedback] = useState(""),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function decide(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      await apiJson(`/api/disputes/${dispute.id}/resolve?learner=${encodeURIComponent(learner)}`, { method: "POST", json: { ...body, note } });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const score = result === "correct" ? 1 : result === "partial" ? 0.5 : 0;
  return (
    <article className="border-l-2 border-accent py-1 pl-4 leading-7">
      <p className="text-sm text-muted">{[dispute.subjectTitle, dispute.lessonTitle].filter(Boolean).join(" · ")}</p>
      {dispute.prompt && <p className="whitespace-pre-wrap font-semibold">{dispute.prompt}</p>}
      {dispute.answer !== undefined && <p className="whitespace-pre-wrap">Bài làm: {dispute.answer || "(chỉ có ảnh)"}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {([['Lần chấm đầu', dispute.grade], ['Lần chấm lại · đã có hiệu lực', dispute.recheckGrade]] as const).map(([label, grade]) => grade && <section key={label}>
          <p className="font-semibold">{label}: {resultText[grade.result] ?? grade.result} ({grade.score})</p>
          <p>{grade.feedback}</p>
          {grade.errors?.map((error, index) => <p key={index}>Trích dẫn: “{error.evidence}”</p>)}
        </section>)}
      </div>
      <p className="text-sm">{reasonText[dispute.reason] ?? dispute.reason}{dispute.message ? `: “${dispute.message}”` : ""}</p>
      {(dispute.status === "open" || dispute.status === "needs_human" || dispute.resolvedBy === "ai") && <><label className={labelClass}>Ghi chú (không bắt buộc)
        <input className={fieldClass} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {mode === "set" && (
        <div className="mt-2 grid gap-2">
          <label className={labelClass}>Kết quả
            <select className={fieldClass} value={result} onChange={(e) => setResult(e.target.value as typeof result)}>
              <option value="correct">Đúng</option>
              <option value="partial">Đúng một phần</option>
              <option value="incorrect">Sai</option>
            </select>
          </label>
          <label className={labelClass}>Lời phê
            <textarea className={fieldClass} rows={2} maxLength={1500} required value={feedback} onChange={(e) => setFeedback(e.target.value)} />
          </label>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {mode === "set" ? (
          <>
            <button type="button" className={buttonClass("primary")} disabled={busy || !feedback.trim()} onClick={() => void decide({ decision: "set", result, score, feedback })}>Lưu điểm</button>
            <button type="button" className={buttonClass("ghost")} onClick={() => setMode("idle")}>Thôi</button>
          </>
        ) : (
          <>
            <button type="button" className={buttonClass("secondary")} disabled={busy} onClick={() => void decide({ decision: "keep" })}>Giữ điểm</button>
            <button type="button" className={buttonClass("secondary")} disabled={busy} onClick={() => setMode("set")}>Đặt điểm</button>
            <button type="button" className={buttonClass("ghost")} disabled={busy} onClick={() => void decide({ decision: "void" })}>Huỷ câu</button>
          </>
        )}
      </div></>}
    </article>
  );
}
