"use client";
import { useEffect, useState } from "react";
import { buttonClass } from "./ui";
type ApiBody = { error?: string; jobs: Job[]; learners: { id: string; name: string }[]; job: unknown; alerts: { code: string; message: string }[] };
type Job = {
  id: string;
  learner_id: string;
  learner_name: string;
  kind: string;
  purpose: string;
  status: string;
  created_at: string;
  usage: string | null;
  cost_usd: number | null;
  error: string | null;
};
export function AiJobsPanel() {
  const [jobs, setJobs] = useState<Job[]>([]),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [kind, setKind] = useState(""),
    [learner, setLearner] = useState(""),
    [learners, setLearners] = useState<{ id: string; name: string }[]>([]),
    [detail, setDetail] = useState<unknown>(null),
    [busy, setBusy] = useState(false);
  const url =
    "/api/admin/ai-jobs?" +
    new URLSearchParams({ ...(status ? { status } : {}), ...(kind ? { kind } : {}), ...(learner ? { learnerFilter: learner } : {}) });
  async function refresh() {
    const r = await fetch(url, { cache: "no-store" }),
      x = (await r.json()) as ApiBody;
    if (!r.ok) throw Error(x.error || "Chưa tải được nhật ký.");
    setJobs(x.jobs);
  }
  useEffect(() => {
    let alive = true;
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        const x = (await r.json()) as ApiBody;
        if (!r.ok) throw Error(x.error || "Chưa tải được nhật ký.");
        if (alive) setJobs(x.jobs);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [url]);
  useEffect(() => {
    fetch("/api/learners", { cache: "no-store" })
      .then(async (r) => (await r.json()) as ApiBody)
      .then((x) => setLearners(x.learners ?? []))
      .catch(() => {});
  }, []);
  async function action(id?: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(id ? "/api/admin/ai-jobs/" + id + "/cancel" : "/api/admin/ai-jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(id ? {} : { learnerId: learner, purpose: "daily" }),
        }),
        x = (await r.json()) as ApiBody;
      if (!r.ok) throw Error(x.error || "Chưa xác nhận thao tác.");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function inspect(id: string) {
    try {
      const r = await fetch("/api/admin/ai-jobs?id=" + id, { cache: "no-store" }),
        x = (await r.json()) as ApiBody;
      if (!r.ok) throw Error(x.error || "Chưa tải được lượt.");
      setDetail(x.job);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section aria-label="Lượt soạn và chấm" className="grid gap-4">
      <h2 className="font-print text-2xl">Lượt soạn và chấm</h2>
      <p className="text-sm text-muted">
        Hàng đợi và kết quả đã lưu. Lượt thành công có thể giữ bài cũ; chỉ có bài mới khi kết quả ghi ID bài. Soạn bài qua ChatGPT và chấm câu mở là hai kết nối riêng.
      </p>
      <div className="flex flex-wrap gap-3">
        <label>
          Người học
          <select value={learner} onChange={(e) => setLearner(e.target.value)} className="ml-2 max-w-full rounded border border-line bg-paper p-2">
            <option value="">Tất cả</option>
            {learners.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Trạng thái
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="ml-2 rounded border border-line bg-paper p-2">
            <option value="">Tất cả</option>
            {["queued", "leased", "succeeded", "failed", "expired", "cancelled"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Loại
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="ml-2 rounded border border-line bg-paper p-2">
            <option value="">Tất cả</option>
            <option value="plan">Soạn</option>
            <option value="assess">Chấm</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className={buttonClass("secondary")} onClick={() => void refresh().catch((e) => setError(e.message))}>
          Tải lại
        </button>
        <button disabled={!learner || busy} className={buttonClass("primary")} onClick={() => void action()}>
          Tạo lượt soạn hôm nay
        </button>
      </div>
      {error && (
        <p role="alert" className="text-accent">
          {error}
        </p>
      )}
      <ul className="grid gap-3">
        {jobs.map((j) => (
          <li key={j.id} className="rounded border border-line p-3">
            <p>
              {j.learner_name} · {j.kind === "plan" ? "Soạn" : "Chấm"} · {j.status}
            </p>
            <p className="break-all text-xs text-muted">
              {j.id} · {j.created_at}
            </p>
            <p className="text-sm">Chi phí ước tính: {j.cost_usd === null ? "chưa có bảng giá" : j.cost_usd + " USD"}</p>
            {j.error && <p>{j.error}</p>}
            <button className={buttonClass("secondary", "mt-2")} onClick={() => void inspect(j.id)}>
              Xem ngữ cảnh và kết quả
            </button>
            {["queued", "leased"].includes(j.status) && (
              <button disabled={busy} className={buttonClass("secondary", "ml-2 mt-2")} onClick={() => void action(j.id)}>
                Huỷ lượt
              </button>
            )}
          </li>
        ))}
      </ul>
      {detail !== null && (
        <div>
          <button className={buttonClass("secondary")} onClick={() => setDetail(null)}>
            Đóng chi tiết
          </button>
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded border border-line p-3 text-xs">
            {JSON.stringify(detail, null, 2)}
          </pre>
        </div>
      )}
    </section>
  );
}
export function AdminAlertBanner() {
  const [alerts, setAlerts] = useState<{ code: string; message: string }[]>([]);
  useEffect(() => {
    fetch("/api/admin/alerts", { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as ApiBody) : null))
      .then((x) => setAlerts(x?.alerts ?? []))
      .catch(() => {});
  }, []);
  return alerts.length ? (
    <aside role="alert" className="mb-4 rounded border border-accent bg-paper p-3 text-accent">
      {alerts.map((a) => (
        <p key={a.code}>{a.message}</p>
      ))}
    </aside>
  ) : null;
}
