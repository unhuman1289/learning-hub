"use client";
import { useEffect, useState } from 'react';
type Row={id:string;title:string;learner_name:string;openai_enabled:number;tts_enabled:number};
export function AiControls() {
  const [rows,setRows]=useState<Row[]|null>(null), [error,setError]=useState(''), [busy,setBusy]=useState(false);
  useEffect(()=>{ fetch('/api/admin/ai-controls',{cache:'no-store'}).then(async r=>{if(!r.ok) throw Error(); return r.json() as Promise<{controls:Row[]}>;}).then(x=>setRows(x.controls)).catch(()=>setError('Chưa tải được cài đặt.')); },[]);
  async function save(row:Row, field:'openai_enabled'|'tts_enabled', value:boolean) {
    setBusy(true); setError('');
    try {
      const response=await fetch('/api/admin/ai-controls',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({subjectId:row.id,openaiEnabled:field==='openai_enabled'?value:!!row.openai_enabled,ttsEnabled:field==='tts_enabled'?value:!!row.tts_enabled})});
      const body=await response.json() as {controls:Row[];error?:string}; if (!response.ok) throw Error(body.error); setRows(body.controls);
    } catch {setError('Chưa lưu được. Hãy thử lại.');} finally {setBusy(false);}
  }
  return <div className="grid gap-3">{error && <p role="alert">{error}</p>}{!rows && !error && <p>Đang tải…</p>}{rows?.map(row=><div key={row.id} className="rounded-md border border-line bg-paper p-3">
    <p className="font-semibold">{row.title} · {row.learner_name}</p>
    {(['openai_enabled','tts_enabled'] as const).map(field=><label key={field} className="mr-5 inline-flex min-h-11 items-center gap-2"><input type="checkbox" checked={!!row[field]} disabled={busy} onChange={e=>void save(row,field,e.target.checked)}/>{field==='openai_enabled'?'OpenAI':'Giọng đọc TTS'}</label>)}
  </div>)}</div>;
}
