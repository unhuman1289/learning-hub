import type {Db} from '../subjects/service.ts';
import type {RoadmapStep} from './types.ts';
import {listSteps} from './store.ts';
import {reasons,type ReasonCode} from './reasons.ts';

export async function readRoadmapProgress(db:Db,learnerId:string,subjectId:string,knownSteps?:RoadmapStep[]){
 const steps=(knownSteps??await listSteps(db,learnerId,subjectId)).filter(step=>step.status!=='retired');
 if(!steps.length)return null;
 const current=steps.find(step=>step.status==='open'||step.status==='practising');
 const done=steps.filter(step=>step.status==='passed'||step.status==='placed');
 const next=steps.filter(step=>step.status==='planned').slice(0,3);
 const recent=await db.prepare(`SELECT l.reason_refs,j.context_snapshot FROM learning_lessons l
  LEFT JOIN ai_jobs j ON j.id=l.origin_job_id AND j.learner_id=l.user_id AND j.subject_id=l.subject_id
  WHERE l.user_id=? AND l.subject_id=? AND l.package_version IN ('2','3')
  ORDER BY (l.completed_at IS NULL AND l.slot='primary') DESC,l.completed_at IS NULL DESC,l.assigned_date DESC,l.updated DESC LIMIT 1`)
  .bind(learnerId,subjectId).first<{reason_refs:string;context_snapshot:string|null}>();
 const reason=(JSON.parse(recent?.reason_refs??'[]') as string[]).find(ref=>Object.hasOwn(reasons,ref)) as ReasonCode|undefined;
 const last=done.at(-1);
 const whyNext=last&&next[0]&&next[0].band>last.band
  ? `Bạn đã qua ${last.title}. Bước tới ${next[0].title} tăng từ mức ${last.band} lên ${next[0].band}.`
  : reason?reasons[reason]:next[0]?'Bước tiếp theo đã có trong sổ.':'';
 const context=JSON.parse(recent?.context_snapshot??'null') as {knowledge?:{notes?:{title:string;publisher:string;url:string}[]}}|null;
 const notes=context?.knowledge?.notes??[];
 return {
  current:current?{stepId:current.id,title:current.title,levelLabel:current.levelLabel,status:current.status}:null,
  done:done.slice(-10).reverse().map(step=>({stepId:step.id,title:step.title,passedVia:step.passedVia,passedAt:step.passedAt})),
  next:next.map(step=>({stepId:step.id,title:step.title,band:step.band})),
  position:{index:current?steps.indexOf(current)+1:done.length,total:steps.length},
  whyNext,sources:[...new Map(notes.filter(note=>note.url.startsWith('https://')).map(note=>[note.url,{title:note.title,publisher:note.publisher,url:note.url}])).values()],
 };
}
export type RoadmapProgress=NonNullable<Awaited<ReturnType<typeof readRoadmapProgress>>>;
