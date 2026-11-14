"use client";
import { useState } from "react";
import { apiJson } from "./api";
import { paperAction } from "./paper-bits";
import { fieldClass, labelClass } from "./paper-dialog";
import { useLiveRefresh } from "./use-live-refresh";
import type { RequestView } from "./requests-panel";

type Work = RequestView & { deferred?: boolean; jobStatus?: string | null };
const waiting = (r?: Work | null) => !!r && ["queued", "in_job"].includes(r.status) && !["failed","expired","cancelled"].includes(r.jobStatus ?? "");

export function NewLessonRequest({ initial, subjectId, onOpen }: { initial: Work[]; subjectId: string; onOpen: (id: string) => void }) {
  const [request, setRequest] = useState<Work | null>(() => initial.find(r => r.subjectId === subjectId && r.kind === "extra_practice" && waiting(r)) ?? null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useLiveRefresh(async () => {
    if (!request) return;
    const { requests } = await apiJson<{requests: Work[]}>("/api/requests");
    const saved = requests.find(r => r.id === request.id);
    if (!saved) return;
    setRequest(saved);
    if (saved.status === "done" && saved.resultLessonId) onOpen(saved.resultLessonId);
  }, waiting(request), 5000);
  async function send() {
    setBusy(true); setError("");
    try {
      const { request: saved } = await apiJson<{request: Work}>("/api/requests", {
        method: "POST", json: { subjectId, kind: "extra_practice", urgency: "now", text: note.trim() || "Bài tiếp theo" },
      });
      setRequest(saved);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); void send(); }}>
      {!waiting(request) && !request?.resultLessonId && <>
        <label className={labelClass}>Ghi chú cho bài mới (tuỳ chọn)
          <input className={fieldClass} value={note} onChange={e => setNote(e.target.value)} maxLength={2000} placeholder="Ví dụ: muốn ôn cách hẹn lịch" />
        </label>
        <button type="submit" disabled={busy} className={paperAction}>Xin bài mới</button>
      </>}
      {waiting(request) && <p role="status" className="text-muted">
        {request?.deferred ? "Bài sẽ được soạn vào sáng mai." : request?.status === "queued" ? "Đã nhận yêu cầu, đang chờ xếp lượt." : "Đang soạn bài… thường mất khoảng 1–2 phút khi máy đang bật."}
      </p>}
      {request?.resultLessonId && <button type="button" onClick={() => onOpen(request.resultLessonId!)} className={paperAction}>Mở bài mới</button>}
      {request && !waiting(request) && !request.resultLessonId && <p role="status">{request.responseNote || "Chưa soạn được bài. Bạn có thể xin lại."}</p>}
      {error && <p role="alert" className="text-accent">{error}</p>}
    </form>
  );
}
