import { z } from 'zod/v4';
import type { Db } from '../subjects/service.ts';
import type { RoadmapStep } from './types.ts';
import { listSteps } from './store.ts';

const id=z.string().min(1).max(160);
export const newStep=z.strictObject({
 ref:id.optional(),title:z.string().trim().min(1).max(160),objective:z.string().trim().min(1).max(500),
 situation:z.string().max(300),skills:z.array(id).min(1).max(3),
 requires:z.array(id).max(8).default([]),band:z.number().int().min(1).max(5),levelLabel:z.string().max(80).optional(),
 kind:z.enum(['new','review','mixed']).default('new'),
});
const stepFields=newStep.omit({ref:true}).partial();
export const roadmapChanges=z.array(z.discriminatedUnion('op',[
 z.strictObject({op:z.literal('append'),step:newStep}),
 z.strictObject({op:z.literal('insert_before'),beforeStepId:id,step:newStep}),
 z.strictObject({op:z.literal('revise'),stepId:id,fields:stepFields}),
 z.strictObject({op:z.literal('retire'),stepId:id,reason:z.string().trim().min(1).max(300)}),
])).max(6);
type Changes=z.infer<typeof roadmapChanges>;

export async function applyRoadmapChanges(db:Db,input:{
 learnerId:string;subjectId:string;changes:Changes;jobId:string;stamp:string;gate:string;bind:unknown[];
 resolveSkill:(id:string)=>string|undefined;replan?:boolean;mastered?:Set<string>;initialize?:boolean;requireListening?:boolean;
}){
 const {learnerId,subjectId,changes,jobId,stamp,gate,bind}=input;
 const listening = input.requireListening ? 1 : 0;
 const secure = new Set(input.replan && listening ? (await db.prepare(
  "SELECT skill_id FROM skill_states WHERE learner_id=? AND subject_id=? AND json_extract(listening,'$.level')='secure'",
 ).bind(learnerId,subjectId).all<{skill_id:string}>()).results?.map(row=>row.skill_id) : []);
 const prior=await listSteps(db,learnerId,subjectId);
 const current=prior.map(step=>({...step}));
 const ids=new Map<string,string>();
 const invalid=(message:string):never=>{throw new Error(message);};
 const touched=new Set<string>(), inserted=new Set<string>(), retired=new Map<string,string>();
 if(input.replan)for(const step of current)if(step.status==='planned'){
  step.status='retired';touched.add(step.id);retired.set(step.id,'Cập nhật chuẩn hoặc lộ trình.');
 }
 const normalize=(title:string)=>title.trim().normalize('NFC').toLocaleLowerCase('vi');
 for(const c of changes)if('step' in c&&c.step.ref){
  if(ids.has(c.step.ref)||current.some(step=>step.id===c.step.ref))invalid('Mã bước mới bị trùng.');
  ids.set(c.step.ref,'rs_'+crypto.randomUUID().replaceAll('-','').slice(0,20));
 }
 for(const c of changes){
  if(c.op==='append'||c.op==='insert_before'){
   const at=c.op==='append'?current.length:current.findIndex(step=>step.id===c.beforeStepId&&step.status==='planned');
   if(at<0)invalid('Chỉ chèn trước bước chưa mở.');
   const before=current[at],previous=current.slice(0,at).findLast(step=>step.status!=='retired');
   const {title,objective,situation,band,kind,levelLabel}=c.step;
   const nextId=(c.step.ref?ids.get(c.step.ref):undefined)??'rs_'+crypto.randomUUID().replaceAll('-','').slice(0,20);
   const skills=c.step.skills.map(skill=>input.resolveSkill(skill)??invalid('Kỹ năng ngoài sổ.'));
   const ord=before?(before.ord+(current[at-1]?.ord??before.ord-2))/2:(current.at(-1)?.ord??0)+1;
   const requires=c.step.requires.length?c.step.requires.map(req=>ids.get(req)??req):previous?[previous.id]:[];
   if(before&&ord===before.ord)invalid('Không còn khoảng để chèn bước.');
   if(previous&&band<previous.band-1)invalid('Độ khó giảm quá một mức.');
   const done=input.replan&&skills.every(skill=>input.mastered?.has(skill)&&(!listening||secure.has(skill)));
   current.splice(at,0,{id:nextId,learnerId,subjectId,ord,title,objective,situation,skills,requires,band,
    levelLabel:levelLabel??null,mode:kind,status:done?'passed':'planned',passedVia:done?'mastery':null,passedAt:done?stamp:null,revision:0,listening});
   inserted.add(nextId);
  } else {
   const step=current.find(step=>step.id===c.stepId&&step.status==='planned')??invalid('Chỉ sửa hoặc bỏ bước chưa mở.');
   if(touched.has(step.id))invalid('Mỗi bước chỉ nhận một thao tác.');
   touched.add(step.id);
   if(c.op==='retire'){step.status='retired';retired.set(step.id,c.reason);continue;}
   const f=c.fields;
   for(const field of ['title','objective','situation','band','levelLabel'] as const)
    if(f[field]!==undefined) Object.assign(step,{[field]:f[field]});
   if(f.skills)step.skills=f.skills.map(skill=>input.resolveSkill(skill)??invalid('Kỹ năng ngoài sổ.'));
   if(f.requires)step.requires=f.requires.map(req=>ids.get(req)??req);
   if(f.kind)step.mode=f.kind;
  }
 }
 const live=current.filter(step=>step.status!=='retired');
 if(live.filter(step=>step.status==='planned').length>12)invalid('Tối đa 12 bước chưa mở.');
 if(input.initialize&&(inserted.size<5||inserted.size>10))invalid('Lộ trình đầu cần 5–10 bước.');
 if(new Set(live.map(step=>normalize(step.title))).size!==live.length)invalid('Tiêu đề bước bị trùng.');
 if(!input.replan&&inserted.size){
  const since=new Date(Date.parse(stamp)-90*86400000).toISOString();
  const {results=[]}=await db.prepare("SELECT title FROM roadmap_steps WHERE learner_id=? AND subject_id=? AND status='retired' AND updated_at>=?")
   .bind(learnerId,subjectId,since).all<{title:string}>();
  const recent=new Set(results.map(row=>normalize(row.title)));
  if(live.some(step=>inserted.has(step.id)&&recent.has(normalize(step.title))))invalid('Tiêu đề đã dùng trong 90 ngày.');
 }
 const byId=new Map(live.map(step=>[step.id,step]));
 const visiting=new Set<string>(),visited=new Set<string>();
 function visit(step:RoadmapStep){
  if(visiting.has(step.id))invalid('Có vòng trong bước học trước.');
  if(visited.has(step.id))return;
  visiting.add(step.id);
  for(const req of step.requires){
   const prerequisite=byId.get(req)??invalid('Bước học trước không tồn tại.');
   if(prerequisite.ord>=step.ord)invalid('Điều kiện phải là bước đứng trước.');
   visit(prerequisite);
  }
  visiting.delete(step.id);visited.add(step.id);
 }
 live.forEach(visit);
 for(const [i,step] of live.entries()){
  if(i>0&&step.band<live[i-1].band-1&&(inserted.has(step.id)||touched.has(step.id)))invalid('Độ khó giảm quá một mức.');
 }
 const statements=[];
 for(const step of current){
  if(inserted.has(step.id)){
   statements.push(db.prepare(`INSERT INTO roadmap_steps(id,learner_id,subject_id,ord,title,objective,situation,skill_ids,requires,band,level_label,kind,status,passed_via,passed_at,origin,origin_job_id,created_at,updated_at,listening)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ai',?,?,?,? WHERE ${gate}`)
    .bind(step.id,learnerId,subjectId,step.ord,step.title,step.objective,step.situation,JSON.stringify(step.skills),JSON.stringify(step.requires),
     step.band,step.levelLabel,step.mode,step.status,step.passedVia,step.passedAt,jobId,stamp,stamp,step.listening,...bind));
  } else if(touched.has(step.id)){
   statements.push(db.prepare(`UPDATE roadmap_steps SET title=?,objective=?,situation=?,skill_ids=?,requires=?,band=?,level_label=?,kind=?,status=?,retired_reason=?,revision=revision+1,updated_at=?
    WHERE id=? AND learner_id=? AND subject_id=? AND status='planned' AND revision=? AND ${gate}`)
    .bind(step.title,step.objective,step.situation,JSON.stringify(step.skills),JSON.stringify(step.requires),step.band,step.levelLabel,step.mode,step.status,
     retired.get(step.id)??null,stamp,step.id,learnerId,subjectId,step.revision,...bind));
  }
 }
 return {statements,steps:live,guards:prior.filter(step=>touched.has(step.id))};
}
