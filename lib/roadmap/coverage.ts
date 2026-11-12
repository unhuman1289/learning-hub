import type {EvidenceDb} from '../evidence/submit.ts';
import {recordGap,scoreNotes} from '../knowledge/service.ts';
import {requirePublicText} from '../knowledge/policy.ts';
import {ApiError} from '../api-error.ts';
import {listSteps,nextSteps} from './store.ts';
import type {RoadmapStep} from './types.ts';

export function stepQuery(step:RoadmapStep, skills:{skillId:string;name:string}[]=[]){
 return [step.title,step.objective,step.levelLabel,...skills.filter(skill=>step.skills.includes(skill.skillId)).map(skill=>skill.name)].filter(Boolean).join(' ');
}

export async function coverageState(db:EvidenceDb,learnerId:string,subjectId:string,steps?:RoadmapStep[]){
 const list=steps??await listSteps(db,learnerId,subjectId);
 const target=[...list.filter(step=>step.status==='open'||step.status==='practising').slice(0,1),...nextSteps(list,3)];
 if(!target.length)return {target,missing:[] as RoadmapStep[]};
 const active=await db.prepare("SELECT seq FROM knowledge_versions WHERE status='active'").bind().first<{seq:number}>();
 if(!active)return {target,missing:target};
 const hits=await Promise.all(target.map(step=>scoreNotes(db,stepQuery(step),subjectId,active.seq,1)));
 return {target,missing:target.filter((_step,i)=>hits[i].length===0)};
}

export async function checkCoverage(db:EvidenceDb,learnerId:string,subjectId:string){
 const {missing}=await coverageState(db,learnerId,subjectId);
 for(const step of missing) {
   const question=('Nguồn công khai cho bước '+step.title).slice(0,300);
   const why=('Cần căn cứ để hướng dẫn: '+step.objective).slice(0,300);
   try{
    requirePublicText([question,why]);
    await recordGap(db,{subjectId,question,why,stepId:step.id,origin:'plan',priority:step.status==='planned'?'normal':'high'});
   }catch(error){
    if(!(error instanceof ApiError)||error.status!==422)throw error;
    console.info('Roadmap source request omitted after privacy check.');
   }
 }
 return missing.map(step=>step.id);
}

export async function checkNightlyCoverage(db:EvidenceDb,day:string){
 // A bounded rotation preserves the D1 subrequest budget on the Free Worker.
 const {results=[]}=await db.prepare(`SELECT DISTINCT s.id,s.learner_id FROM subjects s JOIN roadmap_steps r ON r.subject_id=s.id AND r.learner_id=s.learner_id
  WHERE s.status='active' AND s.ai_enabled=1 AND r.status IN ('planned','open','practising')
  ORDER BY s.id`).bind().all<{id:string;learner_id:string}>();
 if(!results.length)return;
 const start=(Math.floor(Date.parse(day)/86400000)*3)%results.length;
 for(let i=0;i<Math.min(results.length,3);i++){
  const row=results[(start+i)%results.length];
  await checkCoverage(db,row.learner_id,row.id);
 }
}
