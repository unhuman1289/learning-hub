import type {EvidenceDb} from '../../evidence/submit.ts';
import {addDays} from '../../learner-model/rules.ts';
import {assessContext,type AssessContext} from '../../contracts/ai-common.ts';
import {contextHash,learnerContext,skillContext,safeText,canonical,type Job} from './common.ts';
export async function buildAssessContext(db:EvidenceDb,job:Job,environment:string,now=new Date()):Promise<AssessContext>{
 const learner=await learnerContext(db,job.learner_id,environment);
 const dispute=job.purpose==='recheck'?await db.prepare('SELECT * FROM disputes WHERE id=? AND learner_id=?').bind(job.ref_id,job.learner_id).first<Record<string,unknown>>():null;
 const sub=await db.prepare(`SELECT s.*,l.payload,l.template,l.subject_id FROM submissions s JOIN learning_lessons l ON l.id=s.lesson_id WHERE s.learner_id=? AND s.id=${dispute?'(SELECT submission_id FROM attempts WHERE id=?)':'?'}`).bind(job.learner_id,dispute?.attempt_id??job.ref_id).first<Record<string,unknown>>();
 if(!sub)throw new Error('Assessment reference not found.');
 const subject=await db.prepare('SELECT * FROM subjects WHERE id=? AND learner_id=?').bind(sub.subject_id,job.learner_id).first<Record<string,unknown>>();if(!subject)throw new Error('Assessment notebook not found.');
 const sensitivity=subject.sensitivity as 'normal'|'clinical'|'child_dev';
 const lesson=JSON.parse(String(sub.payload));
 const {results:attempts=[]}=await db.prepare(`SELECT a.*,i.stage,i.payload,g.result,g.grader,g.feedback FROM attempts a JOIN lesson_items i ON i.lesson_id=a.lesson_id AND i.item_id=a.item_id LEFT JOIN grades g ON g.id=a.current_grade_id WHERE a.submission_id=? AND a.learner_id=? ORDER BY a.item_id`).bind(sub.id,job.learner_id).all<Record<string,unknown>>();
 const items=[];let imageCount=0;
 for(const a of attempts){
  const item=JSON.parse(String(a.payload));const photos=[];
  for(const id of JSON.parse(String(a.attachment_ids)) as string[]){
   const img=await db.prepare('SELECT id,mime,expires_at,deleted_at FROM attachments WHERE id=? AND learner_id=?').bind(id,job.learner_id).first<{id:string;mime:string;expires_at:string;deleted_at:string|null}>();
   if(img&&imageCount<12){photos.push({attachmentId:img.id,url:`/api/automation/v2/jobs/${job.id}/attachments/${img.id}`,mime:img.mime,expired:!!img.deleted_at||img.expires_at<=now.toISOString()});imageCount++;}
  }
  const {results:previous=[]}=await db.prepare('SELECT a.answer,g.result,g.feedback FROM attempts a LEFT JOIN grades g ON g.id=a.current_grade_id WHERE a.learner_id=? AND a.lesson_id=? AND a.item_id=? AND a.attempt_no<? ORDER BY a.attempt_no DESC LIMIT 3').bind(job.learner_id,a.lesson_id,a.item_id,a.attempt_no).all<{answer:string;result:string|null;feedback:string|null}>();
  items.push({attemptId:a.id,itemId:a.item_id,stage:a.stage,activity:a.activity,input:item.input,skills:JSON.parse(String(a.skill_ids)),prompt:safeText(item.prompt,sensitivity),rubric:item.rubric??null,solution:safeText(item.solution,sensitivity),key:item.key??null,answer:safeText(a.answer,sensitivity),attachments:photos,support:a.support,attemptNo:a.attempt_no,previousAttempts:previous.map(p=>({answer:safeText(p.answer,sensitivity),result:p.result,feedback:safeText(p.feedback,sensitivity)})),autoGrade:a.grader==='auto'?{result:String(a.result),expected:safeText(item.solution,sensitivity),chosenErrorLabel:null}:null});
 }
 const data=await skillContext(db,job.learner_id,String(sub.subject_id));const skillIds=new Set(items.flatMap(a=>a.skills as string[]));
 const {results:evidence=[]}=await db.prepare(`SELECT a.id,a.day,a.activity,a.support,a.skill_ids,g.result FROM attempts a JOIN grades g ON g.id=a.current_grade_id WHERE a.learner_id=? AND a.subject_id=? AND a.day>=? AND a.status='graded' ORDER BY a.created_at DESC LIMIT 40`).bind(job.learner_id,sub.subject_id,addDays(job.learning_day,-13)).all<Record<string,unknown>>();
 const {results:calibration=[]}=await db.prepare(`SELECT g.result AS originalResult,r.result AS finalResult,d.resolution_note AS note FROM disputes d JOIN attempts a ON a.id=d.attempt_id JOIN grades g ON g.id=d.grade_id JOIN grades r ON r.id=d.resolution_grade_id WHERE d.learner_id=? AND a.subject_id=? AND d.status='overturned' AND d.created_at>=? ORDER BY d.created_at DESC LIMIT 5`).bind(job.learner_id,sub.subject_id,addDays(job.learning_day,-13)).all<Record<string,unknown>>();
 const context:Record<string,unknown>={contract:'assess-context/1',jobId:job.id,purpose:job.purpose,contextHash:'sha256:'+'0'.repeat(64),learner:learner.public,subject:{subjectId:subject.id,title:safeText(subject.title,sensitivity),goal:safeText(subject.goal,sensitivity),level:safeText(subject.level,sensitivity),sensitivity},lesson:{lessonId:sub.lesson_id,title:safeText(lesson.title,sensitivity),objective:safeText(lesson.objective,sensitivity),template:sub.template,sheetRules:lesson.sheet?.rules??[]},attempts:items,skills:data.skills.filter(s=>skillIds.has(s.skillId)),openErrorPatterns:data.errors.filter(e=>e.status!=='resolved'&&skillIds.has(e.skillId)).slice(0,10),recentEvidence:evidence.flatMap(e=>(JSON.parse(String(e.skill_ids)) as string[]).filter(id=>skillIds.has(id)).map(id=>({attemptId:e.id,skillId:id,day:e.day,activity:e.activity,result:e.result,support:e.support}))).slice(0,40),recheck:dispute?{disputeId:dispute.id,attemptId:dispute.attempt_id,originalGradeId:dispute.grade_id,reason:dispute.reason,message:safeText(dispute.message,sensitivity)}:null,calibration:calibration.map(x=>({...x,note:safeText(x.note,sensitivity)})),truncated:[]};
 const clean=(v:unknown):unknown=>Array.isArray(v)?v.map(clean):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clean(x)])):typeof v==='string'?v.replaceAll(job.learner_id,'[id riêng]'):v;
 const safe=clean(context) as Record<string,unknown>,truncated=safe.truncated as string[];
 const bytes=()=>new TextEncoder().encode(canonical(safe)).length;
 for(const a of safe.attempts as typeof items)if(bytes()>96*1024){a.previousAttempts=[];truncated.push('previousAttempts:'+a.attemptId);}
 if(bytes()>96*1024){safe.recentEvidence=[];truncated.push('recentEvidence');}
 if(bytes()>96*1024){safe.calibration=[];truncated.push('calibration');}
 if(bytes()>96*1024)throw new Error('Assess context exceeds safe size; split the submission.');
 safe.contextHash=await contextHash({...safe,contextHash:undefined});return assessContext.parse(safe);
}
