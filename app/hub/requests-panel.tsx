"use client";

import { useCallback, useEffect, useState } from "react";
import { PaperDialog, fieldClass, labelClass } from "./paper-dialog";
import { buttonClass, PageLabel } from "./ui";
import { apiJson, learnerQuery } from "./api";
import { GraderOffline } from "./runner-status";

export type RequestKind = "explore" | "extra_practice" | "school_topic" | "note";
export type RequestView = {
  id: string; subjectId: string | null; kind: RequestKind; text: string; urgency: "tonight" | "now"; byLearner: boolean;
  status: string; activeUntil: string | null; resultLessonId: string | null; responseNote: string | null; createdAt: string;
};

export const requestLabels: Record<RequestKind, { button: string; title: string; placeholder: string }> = {
  explore: { button: "Hỏi thêm", title: "Hỏi thêm", placeholder: "Bạn muốn tìm hiểu điều gì?" },
  extra_practice: { button: "Xin thêm bài", title: "Xin thêm bài", placeholder: "Muốn luyện thêm phần nào?" },
  school_topic: { button: "Tuần này ở trường", title: "Tuần này ở trường", placeholder: "Tuần này trên lớp học gì?" },
  note: { button: "Dặn planner", title: "Dặn planner", placeholder: "Lời dặn cho người soạn bài (14 ngày)" },
};

const statusText: Record<string, string> = {
  queued: "Đã nhận, chờ xếp lượt",
  in_job: "Đang chờ soạn",
  done: "Đã có bài",
  declined: "Chưa soạn",
  expired: "Hết hạn",
};

/** Requests to the planner. Nothing appears as answered until the server has saved a lesson or a reason. */
export function useRequests(learner: string | null) {
  const [requests, setRequests] = useState<RequestView[] | null>(null),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    apiJson<{ requests: RequestView[] }>(`/api/requests${learnerQuery(learner)}`)
      .then((value) => { if (live) { setRequests(value.requests); setError(""); } })
      .catch((e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [learner, version]);
  const load = useCallback(() => setVersion((v) => v + 1), []);
  return { requests, error, load };
}

export function RequestDialog({ kind, subjectId, learner, onClose, onSent }: { kind: RequestKind; subjectId: string | null; learner: string | null; onClose: () => void; onSent: () => void }) {
  const [text, setText] = useState(""),
    [urgency, setUrgency] = useState<"tonight" | "now">("tonight"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const label = requestLabels[kind];
  async function send() {
    setBusy(true);
    setError("");
    try {
      await apiJson(`/api/requests${learnerQuery(learner)}`, { method: "POST", json: { kind, subjectId, text, urgency } });
      onSent();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <PaperDialog title={label.title} labelId={"request-" + kind} onClose={onClose}>
      <form className="space-y-3 pb-4" onSubmit={(event) => { event.preventDefault(); void send(); }}>
        <label className={labelClass}>
          Nội dung
          <textarea className={fieldClass} rows={4} minLength={3} maxLength={2000} required placeholder={label.placeholder} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        {(kind === "explore" || kind === "extra_practice") && (
          <fieldset>
            <legend className={labelClass}>Khi nào</legend>
            <label className="flex min-h-11 items-center gap-3"><input type="radio" name={"urgency-" + kind} checked={urgency === "tonight"} onChange={() => setUrgency("tonight")} /> Soạn đêm nay</label>
            <label className="flex min-h-11 items-center gap-3"><input type="radio" name={"urgency-" + kind} checked={urgency === "now"} onChange={() => setUrgency("now")} /> Soạn ngay nếu còn lượt</label>
          </fieldset>
        )}
        {error && <p role="alert">{error}</p>}
        <button type="submit" className={buttonClass("primary")} disabled={busy}>{busy ? "Đang gửi…" : "Gửi"}</button>
      </form>
    </PaperDialog>
  );
}

export function RequestList({ requests, subjectId }: { requests: RequestView[]; subjectId?: string }) {
  const shown = requests.filter((r) => subjectId === undefined || r.subjectId === subjectId).slice(0, 8);
  if (!shown.length) return null;
  const waiting = shown.some((r) => r.urgency === "now" && (r.status === "queued" || r.status === "in_job"));
  return (
    <>
    <GraderOffline waiting={waiting} what="Yêu cầu" />
    <ul className="mt-2 grid gap-2">
      {shown.map((r) => (
        <li key={r.id} className="leading-7">
          <span className="text-sm text-muted">{requestLabels[r.kind].title} · {statusText[r.status] ?? r.status}</span>
          <p className="whitespace-pre-wrap">{r.text}</p>
          {r.responseNote && <p className="text-sm text-accent">{r.responseNote}</p>}
        </li>
      ))}
    </ul>
    </>
  );
}

/** In the notebook margin: ask a question or ask for more practice. Learners and parents both can. */
export function NotebookRequests({ subjectId, learner }: { subjectId: string; learner: string | null }) {
  const { requests, error, load } = useRequests(learner);
  const [open, setOpen] = useState<RequestKind | null>(null);
  return (
    <div className="mt-7">
      <PageLabel>Hỏi và xin thêm bài</PageLabel>
      <div className="flex flex-wrap gap-2">
        {(["explore", "extra_practice"] as const).map((kind) => (
          <button key={kind} type="button" className={buttonClass("secondary")} onClick={() => setOpen(kind)}>{requestLabels[kind].button}</button>
        ))}
      </div>
      {error && <p role="alert" className="text-sm">{error}</p>}
      {requests && <RequestList requests={requests} subjectId={subjectId} />}
      {open && <RequestDialog kind={open} subjectId={subjectId} learner={learner} onClose={() => setOpen(null)} onSent={load} />}
    </div>
  );
}
