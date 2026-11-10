"use client";

import { useState } from "react";
import { PaperDialog, fieldClass, labelClass } from "../paper-dialog";
import { buttonClass } from "../ui";

export type DisputeState = { id: string; status: string; note: string | null } | null;

const reasons = [
  ["answer_correct", "Câu trả lời của mình đúng"],
  ["feedback_wrong", "Nhận xét không đúng"],
  ["item_wrong", "Đề hoặc đáp án sai"],
  ["other", "Khác"],
] as const;

/** What the learner sees about a dispute, in plain words; nothing claims a result before the server has it. */
const statusText: Record<string, string> = {
  open: "Đã gửi phản hồi. Điểm này tạm không tính vào tiến độ.",
  rechecking: "Đang chấm lại. Điểm này tạm không tính vào tiến độ.",
  needs_human: "Đang chờ phụ huynh xem.",
  upheld: "Đã chấm lại: giữ điểm cũ.",
  overturned: "Đã chấm lại: điểm đã được sửa.",
  item_void: "Câu này đã được huỷ, không tính điểm.",
  closed: "Đã xem: giữ điểm cũ.",
};

async function post(url: string, body?: unknown) {
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new Error("Mất kết nối. Chưa gửi được; thử lại khi có mạng.");
  }
  const value = (await response.json().catch(() => ({}))) as { error?: string; dispute?: { id: string; status: string } };
  if (!response.ok || !value.dispute) throw new Error(value.error || "Chưa gửi được.");
  return value.dispute;
}

/** "Chấm sai?" under a graded answer: dispute it, follow its status, and ask a parent when still unsure. */
export function DisputeControl({ attemptId, dispute, readOnly, onChanged }: { attemptId: string; dispute: DisputeState; readOnly: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState<(typeof reasons)[number][0]>("answer_correct"),
    [message, setMessage] = useState(""),
    [recheck, setRecheck] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const finished = dispute && ["upheld", "overturned", "item_void", "closed"].includes(dispute.status);

  async function send() {
    setBusy(true);
    setError("");
    try {
      await post(`/api/attempts/${attemptId}/disputes`, { reason, message, recheck });
      setOpen(false);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function escalate() {
    if (!dispute) return;
    setBusy(true);
    setError("");
    try {
      await post(`/api/disputes/${dispute.id}/escalate`);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 space-y-1 text-sm">
      {dispute && (
        <p role="status" className="text-muted">
          {statusText[dispute.status] ?? "Đang xem lại."}
          {dispute.note ? ` ${dispute.note}` : ""}
        </p>
      )}
      {!readOnly && (!dispute || finished) && (
        <button type="button" className={buttonClass("ghost")} onClick={() => setOpen(true)}>
          Chấm sai?
        </button>
      )}
      {!readOnly && dispute && (dispute.status === "upheld" || dispute.status === "open") && (
        <button type="button" className={buttonClass("ghost")} disabled={busy} onClick={() => void escalate()}>
          Nhờ phụ huynh xem
        </button>
      )}
      {error && !open && <p role="alert">{error}</p>}
      {open && (
        <PaperDialog title="Chấm sai?" labelId={"dispute-" + attemptId} onClose={() => setOpen(false)}>
          <form
            className="space-y-3 pb-4"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <fieldset>
              <legend className={labelClass}>Lý do</legend>
              {reasons.map(([value, label]) => (
                <label key={value} className="flex min-h-11 items-center gap-3">
                  <input type="radio" name={"reason-" + attemptId} value={value} checked={reason === value} onChange={() => setReason(value)} />
                  {label}
                </label>
              ))}
            </fieldset>
            <label className={labelClass}>
              Lời nhắn (không bắt buộc)
              <textarea className={fieldClass} rows={3} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />
            </label>
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" checked={recheck} onChange={(e) => setRecheck(e.target.checked)} />
              Yêu cầu chấm lại
            </label>
            {error && <p role="alert">{error}</p>}
            <button type="submit" className={buttonClass("primary")} disabled={busy}>
              {busy ? "Đang gửi…" : "Gửi"}
            </button>
          </form>
        </PaperDialog>
      )}
    </div>
  );
}
