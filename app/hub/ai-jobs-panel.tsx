"use client";
import {useLiveRefresh} from "./use-live-refresh";
import { useEffect, useRef, useState } from "react";
import { buttonClass } from "./ui";
import { apiJson } from "./api";
type ApiBody = { error?: string; jobs: Job[]; learners: { id: string; name: string }[]; job: unknown; alerts: { code: string; message: string }[] };
type PlanNotebook = { id: string; title: string; aiEnabled: boolean; status: string };
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
    [notice,setNotice]=useState(""),
    [pending,setPending]=useState<{learner:string;requestId:string;subjectId:string}|null>(null),
    [status, setStatus] = useState(""),
    [kind, setKind] = useState(""),
    [learner, setLearner] = useState(""),
    [learners, setLearners] = useState<{ id: string; name: string }[]>([]),
    [planShelf, setPlanShelf] = useState<{ learner: string; notebooks: PlanNotebook[] } | null>(null),
    [planSubjectId, setPlanSubjectId] = useState(""),
    [detail, setDetail] = useState<unknown>(null),
    [busy, setBusy] = useState(false);
  const creating=useRef(false);
  const notebooks = planShelf?.learner === learner ? planShelf.notebooks : [];
  const subjectId = notebooks.length === 1 ? notebooks[0].id : planSubjectId;
  async function createPlan(){
    if(creating.current||(!subjectId&&!pending))return;
    creating.current=true;setBusy(true);setError("");setNotice("");
    const request=pending??{learner,subjectId,requestId:crypto.randomUUID()};
    let uncertain=true;
    setPending(request);
    try{
      const r=pending
        ? await fetch('/api/admin/ai-jobs?'+new URLSearchParams({learnerFilter:request.learner,requestId:request.requestId}),{cache:'no-store'})
        : await fetch('/api/admin/ai-jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({learnerId:request.learner,subjectId:request.subjectId,purpose:'daily',requestId:request.requestId})});
      const x=await r.json() as {error?:string;job?:{id?:string}};
      if(!r.ok){if(r.status>=400&&r.status<500){setPending(null);uncertain=false;}throw Error(x.error||'Chưa xác nhận lượt soạn.');}
      if(!x.job?.id)throw Error('Chưa tìm thấy lượt đã lưu. Chỉ kiểm tra lại, không gửi thêm yêu cầu tạo.');
      uncertain=false;setPending(null);setNotice('Đã xếp lượt soạn. Bài mới chỉ hiện sau khi xử lý và lưu thành công.');
      await refresh();
    }catch(e){setError((e as Error).message+(uncertain?' Bấm “Kiểm tra lượt vừa tạo”; không tạo lại.':''));}
    finally{creating.current=false;setBusy(false);}
  }
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
        if (alive) {
          setJobs(x.jobs);
        }
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
  useEffect(() => {
    if (!learner) return;
    let alive = true;
    apiJson<{ subjects: PlanNotebook[] }>("/api/subjects?" + new URLSearchParams({ learner }))
      .then(({ subjects }) => {
        if (alive) setPlanShelf({ learner, notebooks: subjects.filter(subject => subject.status === "active" && subject.aiEnabled) });
      })
      .catch((cause: Error) => { if (alive) setError(cause.message); });
    return () => { alive = false; };
  }, [learner]);
  useLiveRefresh(async()=>{await refresh();const selected=detail as {id?:string}|null;if(selected?.id)await inspect(selected.id);},!busy);
  async function action(id: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/admin/ai-jobs/" + id + "/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
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
        Hàng đợi và kết quả đã lưu. Lượt thành công có thể giữ bài cũ; chỉ có bài mới khi kết quả ghi ID bài. Máy ở nhà tự nhận lượt soạn và chấm.
      </p>
      <div className="flex flex-wrap gap-3">
        <label>
          Người học
          <select value={learner} onChange={(e) => { setLearner(e.target.value); setPlanSubjectId(""); setPlanShelf(null); }} className="ml-2 max-w-full rounded border border-line bg-paper p-2">
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
      <div className="flex flex-wrap items-center gap-2">
        {notebooks.length > 1 && <label>
          Sổ cần soạn
          <select value={planSubjectId} onChange={e => setPlanSubjectId(e.target.value)} className="ml-2 max-w-full rounded border border-line bg-paper p-2">
            <option value="">Chọn sổ</option>
            {notebooks.map(notebook => <option key={notebook.id} value={notebook.id}>{notebook.title}</option>)}
          </select>
        </label>}
        <button className={buttonClass("secondary")} onClick={() => void refresh().catch((e) => setError(e.message))}>
          Tải lại
        </button>
        <button disabled={busy||(!subjectId&&!pending)} className={buttonClass("primary")} onClick={()=>void createPlan()}>
          {pending?'Kiểm tra lượt vừa tạo':'Tạo lượt soạn'}
        </button>
      </div>
      <p className="text-sm text-muted">Tự chuẩn bị lúc 00:00 giờ Đức. Bạn có thể chọn sổ và tạo thêm lượt khi cần.</p>
      {notice&&<p role="status" className="text-sm text-muted">{notice}</p>}
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
