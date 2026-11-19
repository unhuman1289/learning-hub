"use client";
import {useEffect,useState} from "react";
import {SketchIcon} from "../sketch-icons";
import {apiJson} from "../api";
import type {LessonSummaryData} from "../../../lib/lesson-v2/summary";
import {fieldClass,labelClass} from "../paper-dialog";
import { reflectionSaveButton, type ReflectionFields } from "../../../lib/lesson-v2/reflection-form";

type SavedReflection = ReflectionFields & { revision: number };

export function LessonReflection({ submissionId, lessonId }: { submissionId: string; lessonId: string }) {
 const [value, setValue] = useState<ReflectionFields>({ difficulty: "fit", usefulness: "useful", note: "" });
 const [saved, setSaved] = useState<SavedReflection | null>(null);
 const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
 const url = `/api/submissions/${submissionId}/reflection`;
 useEffect(() => {
   let alive = true;
   apiJson<{ reflection: SavedReflection | null }>(url, { cache: "no-store" }).then(({ reflection }) => {
     if (!alive) return;
     if (reflection) setValue(reflection);
     setSaved(reflection);
     setReady(true);
   }).catch(e => { if (alive) setError((e as Error).message); });
   return () => { alive = false; };
 }, [url]);
 const button = reflectionSaveButton(value, saved, ready, busy);
 async function save(event: React.FormEvent<HTMLFormElement>) {
   event.preventDefault();
   if (button.disabled) return;
   setBusy(true);
   setError("");
   const submitted = { difficulty: value.difficulty, usefulness: value.usefulness, note: value.note.trim() };
   try {
     const { summary } = await apiJson<{ summary: LessonSummaryData }>(`/api/lessons/${lessonId}/summary`);
     const minutes = Math.max(1, Math.min(720, summary.minutes));
     const { revision } = await apiJson<{ revision: number }>(url, { method: "PUT", json: { ...submitted, minutes, revision: saved?.revision ?? 0 } });
     setSaved({ ...submitted, revision });
     setValue(current => current.note === value.note ? { ...current, note: submitted.note } : current);
   } catch (cause) {
     setError((cause as Error).message);
   } finally {
     setBusy(false);
   }
 }
 const difficulty = [["easy", "Dễ"], ["fit", "Vừa"], ["hard", "Khó"]] as const;
 const usefulness = [["useful", "Có ích"], ["mixed", "Bình thường"], ["not_useful", "Chưa có ích"]] as const;
 return <section aria-label="Góp ý cho bài sau">
   <h2 tabIndex={-1} className="font-hand text-[28px] leading-[3.5rem] text-accent">Góp ý cho bài sau</h2>
   <form onSubmit={save} className="mt-3 grid gap-3">
     <fieldset disabled={!ready}><legend className={labelClass}>Độ khó</legend><div className="flex flex-wrap gap-2">
       {difficulty.map(([id, label]) => <label key={id} className="flex min-h-11 cursor-pointer items-center gap-2 px-1">
         <input className="peer sr-only" type="radio" name="difficulty" value={id} checked={value.difficulty === id} onChange={() => setValue(v => ({ ...v, difficulty: id }))} />
         <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-muted/50 font-hand text-lg leading-none text-transparent peer-checked:border-brick peer-checked:text-brick peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">✓</span>
         <span className="decoration-brick decoration-2 underline-offset-4 peer-checked:underline">{label}</span>
       </label>)}
     </div></fieldset>
     <fieldset disabled={!ready}><legend className={labelClass}>Mức hữu ích</legend><div className="flex flex-wrap gap-2">
       {usefulness.map(([id, label]) => <label key={id} className="flex min-h-11 cursor-pointer items-center gap-2 px-1">
         <input className="peer sr-only" type="radio" name="usefulness" value={id} checked={value.usefulness === id} onChange={() => setValue(v => ({ ...v, usefulness: id }))} />
         <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-muted/50 font-hand text-lg leading-none text-transparent peer-checked:border-brick peer-checked:text-brick peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">✓</span>
         <span className="decoration-brick decoration-2 underline-offset-4 peer-checked:underline">{label}</span>
       </label>)}
     </div></fieldset>
     <label className={labelClass}>Bạn muốn bài sau đổi gì?
       <input className={fieldClass + " min-h-11"} disabled={!ready} maxLength={1500} value={value.note} onChange={e => setValue(v => ({ ...v, note: e.target.value }))} />
     </label>
     <button type="submit" className="notebook-button notebook-secondary justify-self-start" disabled={button.disabled}>
       <SketchIcon name="check" size={23} className="rounded-full border border-current p-0.5" />
       {button.label}
     </button>
     {error && <p role="alert" className="text-brick">{error}</p>}
   </form>
 </section>;
}
