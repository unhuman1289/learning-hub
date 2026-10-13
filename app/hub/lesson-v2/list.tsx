"use client";
import {useEffect,useState} from 'react';
import {RouteLink} from '../ui';
import type {Route} from '../use-route';
function LoadedLessonList({subjectId,learner,go}:{subjectId:string|null;learner?:string|null;go:(route:Route)=>void}){
 const [rows,setRows]=useState<{id:string;title:string;completedAt:string|null}[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{if(!subjectId)return;let alive=true;fetch(`/api/subjects/${subjectId}/lessons${learner?'?learner='+encodeURIComponent(learner):''}`,{cache:'no-store'}).then(async r=>{const x=await r.json() as {error?:string;lessons:{id:string;title:string;completedAt:string|null}[]};if(!r.ok)throw Error(x.error||'Chưa tải được bài');if(alive){setRows(x.lessons);setLoading(false);}}).catch(e=>{if(alive){setError(e.message);setLoading(false);}});return()=>{alive=false;};},[subjectId,learner]);
 if(!subjectId)return null;return <section aria-label="Bài đã giao" className="my-5 rounded border border-line bg-paper p-4"><h2 className="font-hand text-xl">Bài đã giao</h2>{error&&<p role="alert">{error}</p>}{loading&&<p role="status">Đang đọc bài đã giao…</p>}{rows.length===0&&!error&&!loading&&<p className="text-muted">Chưa có bài mới được giao vào sổ.</p>}<ul className="space-y-2">{rows.map(row=><li key={row.id}><RouteLink route={{view:'lesson',id:row.id}} go={go} className="inline-flex min-h-11 items-center gap-2 text-accent underline">{row.completedAt?'✓ ':''}{row.title}</RouteLink></li>)}</ul></section>;
}

export function LessonList(props:Parameters<typeof LoadedLessonList>[0]){return <LoadedLessonList key={String(props.subjectId)+String(props.learner)} {...props}/>;}
