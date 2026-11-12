"use client";
import {useEffect,useState} from "react";
import {buttonClass} from "../ui";
import {fieldClass,labelClass} from "../paper-dialog";
type Reflection={revision:number;difficulty:"easy"|"fit"|"hard";usefulness:"useful"|"mixed"|"not_useful";minutes:number;note:string};
export function LessonReflection({submissionId, minutes}:{submissionId:string; minutes:number}){
 const [value,setValue]=useState<Reflection>({revision:0,difficulty:"fit",usefulness:"useful",minutes:45,note:""});
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const url=`/api/submissions/${submissionId}/reflection`;
 useEffect(()=>{let alive=true;fetch(url,{cache:"no-store"}).then(async r=>{const x=await r.json() as {error?:string;reflection?:Reflection};if(!r.ok)throw Error(x.error || "Chưa xác nhận góp ý.");if(alive){if(x.reflection)setValue(x.reflection);setReady(true);}}).catch(e=>{if(alive)setMessage(e.message);});return()=>{alive=false;};},[url]);
 async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setMessage("");try{const r=await fetch(url,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({...value,minutes:Math.max(1,Math.min(720,minutes))})}),x=await r.json() as {error?:string;revision:number};if(!r.ok)throw Error(x.error || "Chưa xác nhận góp ý.");setValue(v=>({...v,revision:x.revision}));setMessage("Đã lưu.");}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 const difficulty = [["easy", "Dễ"], ["fit", "Vừa"], ["hard", "Khó"]] as const;
 const usefulness = [["useful", "Có ích"], ["mixed", "Bình thường"], ["not_useful", "Chưa có ích"]] as const;
 return <section className="mt-8 border-t border-line pt-4">
   <h3 className="font-hand text-xl text-accent">Góp ý cho bài sau</h3>
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
     <button className={buttonClass("secondary", "justify-self-start")} disabled={!ready || busy}>{busy ? "Đang lưu…" : "Lưu"}</button>
     {message && <p role="status">{message}</p>}
   </form>
 </section>;
}
