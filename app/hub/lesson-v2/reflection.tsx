"use client";
import {useEffect,useState} from "react";
import {SketchIcon} from "../sketch-icons";
import {apiJson} from "../api";
import type {LessonSummaryData} from "../../../lib/lesson-v2/summary";
import {fieldClass,labelClass} from "../paper-dialog";
type Reflection={revision:number;difficulty:"easy"|"fit"|"hard";usefulness:"useful"|"mixed"|"not_useful";minutes:number;note:string};
export function LessonReflection({submissionId, lessonId}:{submissionId:string; lessonId:string}){
 const [value,setValue]=useState<Reflection>({revision:0,difficulty:"fit",usefulness:"useful",minutes:45,note:""});
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const url=`/api/submissions/${submissionId}/reflection`;
 useEffect(()=>{let alive=true;fetch(url,{cache:"no-store"}).then(async r=>{const x=await r.json() as {error?:string;reflection?:Reflection};if(!r.ok)throw Error(x.error || "Chưa xác nhận góp ý.");if(alive){if(x.reflection)setValue(x.reflection);setReady(true);}}).catch(e=>{if(alive)setMessage(e.message);});return()=>{alive=false;};},[url]);
 async function save(event: React.FormEvent<HTMLFormElement>) {
   event.preventDefault();
   setBusy(true);
   setMessage("");
   try {
     const {summary} = await apiJson<{summary: LessonSummaryData}>(`/api/lessons/${lessonId}/summary`);
     const minutes = Math.max(1, Math.min(720, summary.minutes));
     const saved = await apiJson<{revision: number}>(url, {method: "PUT", json: {...value, minutes}});
     setValue(current => ({...current, revision: saved.revision}));
     setMessage("Đã lưu.");
   } catch (error) {
     setMessage((error as Error).message);
   } finally {
     setBusy(false);
   }
 }
 const difficulty = [["easy", "Dễ"], ["fit", "Vừa"], ["hard", "Khó"]] as const;
 const usefulness = [["useful", "Có ích"], ["mixed", "Bình thường"], ["not_useful", "Chưa có ích"]] as const;
 return <section aria-label="Góp ý cho bài sau">
   <h2 tabIndex={-1} className="font-hand text-[28px] leading-[3.5rem] text-accent">Góp ý cho bài sau</h2>
   <form onSubmit={save} className="mt-3 grid gap-3">
     <fieldset><legend className={labelClass}>Độ khó</legend><div className="flex flex-wrap gap-2">
       {difficulty.map(([id, label]) => <label key={id} className="flex min-h-11 cursor-pointer items-center gap-2 px-1">
         <input className="peer sr-only" type="radio" name="difficulty" value={id} checked={value.difficulty === id} onChange={() => setValue(v => ({ ...v, difficulty: id }))} />
         <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-muted/50 font-hand text-lg leading-none text-transparent peer-checked:border-brick peer-checked:text-brick peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">✓</span>
         <span className="decoration-brick decoration-2 underline-offset-4 peer-checked:underline">{label}</span>
       </label>)}
     </div></fieldset>
     <fieldset><legend className={labelClass}>Mức hữu ích</legend><div className="flex flex-wrap gap-2">
       {usefulness.map(([id, label]) => <label key={id} className="flex min-h-11 cursor-pointer items-center gap-2 px-1">
         <input className="peer sr-only" type="radio" name="usefulness" value={id} checked={value.usefulness === id} onChange={() => setValue(v => ({ ...v, usefulness: id }))} />
         <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-muted/50 font-hand text-lg leading-none text-transparent peer-checked:border-brick peer-checked:text-brick peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">✓</span>
         <span className="decoration-brick decoration-2 underline-offset-4 peer-checked:underline">{label}</span>
       </label>)}
     </div></fieldset>
     <label className={labelClass}>Bạn muốn bài sau đổi gì?
       <input className={fieldClass + " min-h-11"} maxLength={1500} value={value.note} onChange={e => setValue(v => ({ ...v, note: e.target.value }))} />
     </label>
     <button type="submit" className="notebook-button notebook-secondary justify-self-start" disabled={!ready || busy}>
       <SketchIcon name="check" size={23} className="rounded-full border border-current p-0.5" />
       {busy ? "Đang lưu…" : "Lưu"}
     </button>
     {message && <p role="status">{message}</p>}
   </form>
 </section>;
}
