import type {Db} from '../subjects/service.ts';
import type {PlanContext} from '../contracts/ai-common.ts';
import type {RoadmapStep} from './types.ts';
import {EXTRA_LESSON_MINUTES} from '../ai-jobs/adaptive.ts';
import {transferActivities} from './progress.ts';

export function checkRoadmapLesson(lesson:{gradingMode?: string;items:{skills:string[];activity:string;difficulty:number;hints:string[];key?:unknown}[]},adaptive:PlanContext['adaptive'],
 steps:RoadmapStep[]|undefined,initial:boolean,limit:number,issue:(message:string)=>void){
 if(initial){
   const plan=(steps??[]).slice(0,8);
   let unassigned=[...lesson.items];
   const uncovered=plan.some(step=>{
    const questions=unassigned.filter(item=>item.skills.length>0&&item.skills.every(skill=>step.skills.includes(skill)));
    if(!questions.length||!step.skills.every(skill=>questions.some(item=>item.skills.includes(skill))))return true;
    unassigned=unassigned.filter(item=>!questions.includes(item));
    return false;
   });
   if(plan.length<5||uncovered)
     issue('Bài xếp chỗ cần câu hỏi cho từng kỹ năng của các bước đầu.');
 }
 if(adaptive?.mode!=='challenge')return;
 const {items}=lesson;
 const band=Math.min(adaptive.difficulty?.max??limit,limit);
 const [minItems,maxItems] = lesson.gradingMode !== 'whole-lesson' ? [5,6]
   : adaptive.minutes === EXTRA_LESSON_MINUTES ? [6,8] : [15,20];
 if(items.length<minItems||items.length>maxItems||items.some(item=>item.hints.length)||
   items.filter(item=>transferActivities.has(item.activity)).length<2||
   (lesson.gradingMode !== 'whole-lesson' && items.filter(item=>item.key!=null).length*2<items.length)||!items.some(item=>item.difficulty===band)||
   !adaptive.targetSkills.every(skill=>items.some(item=>item.skills.includes(skill))))
  issue(`Bài thử cần ${minItems}–${maxItems} câu, ít nhất hai câu vận dụng, có câu ở mức khó cao nhất và không có gợi ý.` +
    (lesson.gradingMode === 'whole-lesson' ? '' : ' Ít nhất nửa số câu cần chấm ngay.'));
}

export function openRoadmapStep(db:Db,learnerId:string,subjectId:string,stepId:string,lessonId:string,stamp:string){
 return db.prepare(`UPDATE roadmap_steps SET status='open',opened_at=?,updated_at=?,revision=revision+1
 WHERE id=? AND learner_id=? AND subject_id=? AND status='planned'
 AND EXISTS(SELECT 1 FROM learning_lessons WHERE id=? AND user_id=? AND subject_id=? AND roadmap_step_id=? AND step_role='intro')`)
 .bind(stamp,stamp,stepId,learnerId,subjectId,lessonId,learnerId,subjectId,stepId);
}


export function guardRoadmapIntroduction(db:Db,learnerId:string,subjectId:string,stepId:string,jobId:string,token:string){
 return db.prepare(`INSERT INTO ai_apply_guards(token,valid) SELECT ?,EXISTS(
   SELECT 1 FROM roadmap_steps WHERE id=? AND learner_id=? AND subject_id=? AND status='planned'
 ) WHERE EXISTS(SELECT 1 FROM ai_jobs WHERE id=? AND apply_token=?)`)
 .bind(token+':intro:'+stepId,stepId,learnerId,subjectId,jobId,token);
}
