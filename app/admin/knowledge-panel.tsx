"use client";

import {useEffect, useState, type FormEvent} from "react";
import {apiJson} from "../hub/api";
import {pencilLink} from "../hub/paper-bits";
import {buttonClass} from "../hub/ui";

type Knowledge = {
  summary:{activeSeq:number|null;openGaps:number;subjects:{id:string;title:string}[];sources:{id:string;title:string;url:string;version_label:string|null}[]};
  log:{
    versions:{seq:number;status:string;reason:string;check_report:string|null;created_at:string}[];
    changes:{version_seq:number;action:string;reason:string;url:string|null;version_label:string|null;created_at:string}[];
  };
  gaps:{id:string;subject_id:string;question:string;priority:string}[];
  weekly:{action:string;count:number}[];
};
const labels:Record<string,string>={
  staged:"Bản nháp",active:"Đang dùng",superseded:"Đã thay",failed:"Kiểm tra chưa đạt",rolled_back:"Đã lùi",
  add_source:"Thêm nguồn",update_source:"Cập nhật nguồn",deprecate:"Thay nguồn",resolve_gap:"Đóng câu hỏi",
  activate:"Kiểm tra phiên bản",rollback:"Khôi phục",add_probe:"Thêm câu kiểm tra",
};

export function KnowledgePanel() {
  const [data,setData]=useState<Knowledge>();
  const [busy,setBusy]=useState(true),[error,setError]=useState("");
  const [target,setTarget]=useState<number>();
  const [reason,setReason]=useState("");
  const url="/api/admin/knowledge";
  useEffect(() => {
    const request = new AbortController();
    apiJson<Knowledge>(url, { signal: request.signal }).then(value => {
      if (!request.signal.aborted) setData(value);
    }).catch(cause => {
      if (!request.signal.aborted) setError(cause.message);
    }).finally(() => {
      if (!request.signal.aborted) setBusy(false);
    });
    return () => request.abort();
  }, [url]);
  async function load() {
    setBusy(true);setError("");
    try{setData(await apiJson<Knowledge>(url));}
    catch(error){setError((error as Error).message);}
    finally{setBusy(false);}
  }
  async function save(input:unknown) {
    setBusy(true);setError("");
    try {
      await apiJson(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)});
      setTarget(undefined);setReason("");
      await load();
    } catch(error){setError((error as Error).message);}
    finally{setBusy(false);}
  }
  function add(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    void save({action:"gap",subjectId:form.get("subjectId"),question:form.get("question"),why:form.get("why"),priority:"normal"});
  }
  return <div className="space-y-3">
    {busy && !data ? <p role="status">Đang tải Knowledge…</p>
      : <button type="button" className={buttonClass("secondary")} disabled={busy} onClick={() => void load()}>{data ? "Tải lại" : "Thử lại"}</button>}
    {error&&<p role="alert">{error}</p>}
    {data&&<>
      <p>{data.summary.activeSeq?("Đang dùng bản "+data.summary.activeSeq):"Chưa có bản đang dùng"} · {data.summary.sources.length} nguồn · {data.summary.openGaps} câu hỏi mở</p>
      <details className="border-t border-rule">
        <summary className="min-h-11 cursor-pointer content-center font-hand text-xl text-accent-paper">Nguồn đang dùng</summary>
        {data.summary.sources.length
          ? <ul className="space-y-2">{data.summary.sources.map(source => <li key={source.id}>
            <a className={pencilLink} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
            {source.version_label && <span className="text-sm text-muted-paper"> · {source.version_label}</span>}
          </li>)}</ul>
          : <p className="text-muted-paper">Chưa có nguồn đang dùng.</p>}
      </details>
      <h3 className="font-hand text-xl">Bảy ngày qua</h3>
      {data.weekly.length?<ul>{data.weekly.map(row=><li key={row.action}>{labels[row.action]??row.action} · {row.count}</li>)}</ul>:<p>Chưa có thay đổi.</p>}
      <details><summary className="min-h-11 cursor-pointer content-center text-accent-paper">Câu hỏi còn mở</summary>
        <ul className="space-y-2">{data.gaps.map(gap=><li key={gap.id}>
          <span>{data.summary.subjects.find(subject=>subject.id===gap.subject_id)?.title} · {gap.question}</span>{" "}
          <button type="button" className={pencilLink} disabled={busy||!data.summary.activeSeq}
            onClick={()=>void save({action:"wont_fix",gapId:gap.id,note:"Quản trị chọn bỏ qua.",clientChangeId:crypto.randomUUID()})}>Bỏ qua</button>
        </li>)}</ul>
        <form onSubmit={add} className="my-3 grid max-w-xl gap-2">
          <label>Sổ <select className="min-h-11 max-w-full border-b border-rule bg-paper" name="subjectId" required>{data.summary.subjects.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
          <label>Câu hỏi <input className="min-h-11 w-full border-b border-rule bg-paper" name="question" required maxLength={300} /></label>
          <label>Vì sao cần <input className="min-h-11 w-full border-b border-rule bg-paper" name="why" required maxLength={300} /></label>
          <button className={buttonClass("secondary")} disabled={busy}>Thêm câu hỏi</button>
        </form>
      </details>
      <details><summary className="min-h-11 cursor-pointer content-center text-accent-paper">Phiên bản</summary>
        <ul className="space-y-2">{data.log.versions.map(v=><li key={v.seq}>
          <p>Bản {v.seq} · {labels[v.status]} · {v.reason}</p>
          {v.status==="failed"&&v.check_report&&<details><summary className="min-h-11 cursor-pointer content-center text-accent-paper">Kết quả kiểm tra</summary><p className="break-all">{v.check_report}</p></details>}
          {["superseded","rolled_back"].includes(v.status)&&<button type="button" className={pencilLink} disabled={busy} onClick={()=>setTarget(v.seq)}>Khôi phục bản {v.seq}</button>}
        </li>)}</ul>
      </details>
      {target!==undefined&&<form className="grid max-w-xl gap-2" onSubmit={event=>{
        event.preventDefault();
        void save({action:"rollback",toSeq:target,reason});
      }}>
        <p>Đưa bản {target} trở lại sử dụng?</p>
        <label>Lý do <input className="min-h-11 w-full border-b border-rule bg-paper" required maxLength={300} value={reason} onChange={event=>setReason(event.target.value)} /></label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClass("secondary")} onClick={()=>setTarget(undefined)}>Hủy</button>
          <button className={buttonClass("primary")} disabled={busy}>Xác nhận khôi phục</button>
        </div>
      </form>}
      <details><summary className="min-h-11 cursor-pointer content-center text-accent-paper">Lịch sử thay đổi</summary><ul className="space-y-2">
        {data.log.changes.map((entry,index)=><li className="break-words" key={entry.created_at+index}>
          <p>{labels[entry.action]??entry.action} · bản {entry.version_seq} · {entry.created_at.slice(0,10)}</p>
          {entry.url&&<a className={pencilLink} href={entry.url} target="_blank" rel="noreferrer">{entry.version_label||entry.url}</a>}
          {entry.reason&&<p>{entry.reason}</p>}
        </li>)}
      </ul></details>
    </>}
  </div>;
}
