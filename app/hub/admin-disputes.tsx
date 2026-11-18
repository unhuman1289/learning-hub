"use client";

import { useCallback, useEffect, useState } from "react";
import { apiJson } from "./api";
import { DisputeResolver, type DisputeItem } from "./dispute-resolver";
import { QualityTable, type QualityRow } from "./quality-table";
import { useLiveRefresh } from "./use-live-refresh";
import { buttonClass } from "./ui";

type Review = DisputeItem & { learnerId: string };
type Alert = { code: string; message: string };
type Names = Map<string, string>;
export type ReadLearnerNames = () => Promise<Names>;

export function AdminAttention({ onSystem, readNames }: { onSystem: () => void; readNames: ReadLearnerNames }) {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [names, setNames] = useState<Names>(new Map());
  const [alertError, setAlertError] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [version, setVersion] = useState(0);
  const reload = () => setVersion(value => value + 1);

  const loadAlerts = useCallback(async (signal?: AbortSignal) => {
    try {
      const { alerts: pending } = await apiJson<{ alerts: Alert[] }>("/api/admin/alerts", { signal });
      if (!signal?.aborted) { setAlerts(pending); setAlertError(""); }
    } catch {
      if (!signal?.aborted) setAlertError("Chưa tải được cảnh báo.");
    }
  }, []);

  useEffect(() => {
    const request = new AbortController();
    const options = { signal: request.signal };
    void Promise.resolve().then(() => loadAlerts(request.signal));
    void apiJson<{ disputes: Review[] }>("/api/disputes?scope=needs_human", options)
      .then(({ disputes }) => {
        if (request.signal.aborted) return;
        setReviews(disputes);
        setReviewError("");
        if (!disputes.length) return;
        return readNames()
          .then(data => { if (!request.signal.aborted) setNames(data); })
          .catch(() => { /* The source notebook and request remain available. */ });
      })
      .catch(() => { if (!request.signal.aborted) setReviewError("Chưa tải được yêu cầu xem lại điểm."); });
    return () => request.abort();
  }, [version, loadAlerts, readNames]);

  useLiveRefresh(() => loadAlerts(), true, 30_000);

  const empty = alerts?.length === 0 && reviews?.length === 0 && !alertError && !reviewError;
  const loading = (alerts === null && !alertError) || (reviews === null && !reviewError);
  return <div className="grid gap-3">
    {loading && <p role="status" className="text-muted">Đang kiểm tra việc cần xem…</p>}
    {empty && <p role="status" className="text-muted">Hiện không có việc cần xử lý.</p>}
    {(alertError || reviewError) && <div role="alert" className="flex flex-wrap items-center gap-3 text-brick">
      <p>{[alertError, reviewError].filter(Boolean).join(" ")}</p>
      <button type="button" className={buttonClass("ghost")} onClick={reload}>Thử lại</button>
    </div>}
    {!!alerts?.length && <div>
      <ul className="divide-y divide-rule">{alerts.map(alert => <li key={alert.code} className="py-3 text-sm leading-6">{alert.message}</li>)}</ul>
      <button type="button" className={buttonClass("secondary", "mt-2")} onClick={onSystem}>Mở Hệ thống</button>
    </div>}
    {!!reviews?.length && <section>
      <h3 className="mb-1 font-print text-xl">Yêu cầu xem lại điểm</h3>
      {reviews.map(review => <details key={review.id} className="border-b border-rule py-1">
        <summary className="min-h-11 cursor-pointer content-center break-words text-accent-paper">
          {[names.get(review.learnerId), review.subjectTitle, review.lessonTitle].filter(Boolean).join(" · ") || "Xem yêu cầu"}
        </summary>
        <div className="pb-3"><DisputeResolver dispute={review} learner={review.learnerId} onDone={reload} /></div>
      </details>)}
    </section>}
  </div>;
}

export function AdminGradingQuality({ readNames }: { readNames: ReadLearnerNames }) {
  const [data, setData] = useState<{ quality: QualityRow[]; names: Names } | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const request = new AbortController();
    const options = { signal: request.signal };
    Promise.all([
      apiJson<{ quality: QualityRow[] }>("/api/admin/quality", options),
      readNames(),
    ]).then(([{ quality }, names]) => {
      if (!request.signal.aborted) { setData({ quality, names }); setError(false); }
    }).catch(() => { if (!request.signal.aborted) setError(true); });
    return () => request.abort();
  }, [retry, readNames]);

  if (error) return <p role="alert">Chưa tải được chất lượng chấm. <button type="button" className={buttonClass("ghost")} onClick={() => {
    setError(false);
    setRetry(value => value + 1);
  }}>Thử lại</button></p>;
  if (!data) return <p role="status">Đang tải chất lượng chấm…</p>;
  return <><CalibrationPanel /><QualityTable rows={data.quality} names={data.names} /></>;
}


type CalibrationJob = {id:string; status:string; calls:number; error:string | null};
type CalibrationRow = {id:string; created_at:string; model:string; n:number; invalid:number | null; agreement:number; evidence_not_verbatim:number; injection_shifted:number; input_tokens:number; output_tokens:number};
function CalibrationPanel() {
  const [data,setData] = useState<{job:CalibrationJob | null; calibrations:CalibrationRow[]} | null>(null);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const load = useCallback(async () => {
    try {setData(await apiJson('/api/admin/calibration'));setError('');}
    catch {setError('Chưa tải được trạng thái hiệu chuẩn.');}
  },[]);
  useEffect(() => {void Promise.resolve().then(load);},[load]);
  useLiveRefresh(load,true,5000);
  const start = async () => {
    setBusy(true);setError('');
    try {await apiJson('/api/admin/calibration',{method:'POST'});await load();}
    catch {await load();setError('Chưa xác nhận được lượt hiệu chuẩn. Vui lòng kiểm tra trạng thái trước khi thử lại.');}
    finally {setBusy(false);}
  };
  const active = data?.job && ['queued','leased'].includes(data.job.status);
  return <section className="mb-6 grid gap-3">
    <h3 className="font-print text-xl">Hiệu chuẩn</h3>
    <button type="button" className={buttonClass('secondary')} disabled={busy || !data || !!active} onClick={start}>Chạy hiệu chuẩn</button>
    {!data && !error && <p role="status">Đang tải…</p>}
    {active && <p role="status">Đang hiệu chuẩn ({data.job!.calls}/8 lượt gọi).</p>}
    {data?.job?.status === 'succeeded' && <p role="status">Đã hoàn tất hiệu chuẩn.</p>}
    {data?.job?.status === 'failed' && <p role="alert">Hiệu chuẩn chưa hoàn tất. {data.job.error}</p>}
    {error && <p role="alert">{error}</p>}
    {data && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Thời gian</th><th>Model</th><th>Đồng thuận</th><th>Lượt không hợp lệ</th><th>Bằng chứng sai</th><th>Injection lệch</th><th>Token vào / ra</th></tr></thead>
      <tbody>{data.calibrations.map(row => <tr key={row.id}><td>{new Intl.DateTimeFormat('vi-VN',{timeZone:'Europe/Berlin',dateStyle:'short',timeStyle:'short'}).format(new Date(row.created_at))}</td><td>{row.model}</td><td>{(row.agreement*100).toFixed(1)}% ({row.n} câu)</td><td>{row.invalid ?? "—"}</td><td>{row.evidence_not_verbatim}</td><td>{row.injection_shifted}</td><td>{row.input_tokens} / {row.output_tokens}</td></tr>)}</tbody></table>
      {!data.calibrations.length && <p>Chưa có lượt hiệu chuẩn hoàn tất.</p>}</div>}
  </section>;
}
