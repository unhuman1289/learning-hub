import type { EvidenceDb } from '../evidence/submit.ts';
import type { Db } from '../subjects/service.ts';
import { addDays } from '../learner-model/rules.ts';
import { nextSteps } from './store.ts';
import { reasons, type ReasonCode } from './reasons.ts';
import type { RoadmapStep, StepRole } from './types.ts';

export const transferActivities=new Set(['apply','transform','create','investigate']);
export type RoadmapEvidence={skills:string[];correct:boolean;attemptNo:number;support:string;stage:string;activity:string};
export type RoadmapSkill={skillId:string;mastery:string;nextReviewDay:string|null;status:string;prerequisites?:string[]};
const independent=(row:RoadmapEvidence)=>row.correct&&row.attemptNo===1&&row.support==='none';
const covers=(rows:RoadmapEvidence[],skills:string[])=>skills.every(skill=>rows.some(row=>row.skills.includes(skill)));
const isDone=(step:RoadmapStep)=>step.status==='passed'||step.status==='placed';

const listeningReady = (step: RoadmapStep, secure: ReadonlySet<string>) =>
 !step.listening || step.skills.every(skill => secure.has(skill));

export function passesChallenge(step:RoadmapStep, rows:RoadmapEvidence[], secure: ReadonlySet<string> = new Set()){
 const correct=rows.filter(independent);
 return listeningReady(step,secure)&&rows.length>=5&&rows.length<=6&&correct.length*5>=rows.length*4&&covers(correct,step.skills);
}

export function placeSteps(steps:RoadmapStep[],rows:RoadmapEvidence[],secure: ReadonlySet<string> = new Set()){
 const placed:string[]=[];
 for(const step of steps.filter(s=>s.status==='planned').slice(0,8)){
  const questions=rows.filter(row=>row.skills.length>0&&row.skills.every(skill=>step.skills.includes(skill)));
  if(!listeningReady(step,secure)||!questions.length||!covers(questions,step.skills)||!questions.every(independent))break;
  rows=rows.filter(row=>!questions.includes(row));
  placed.push(step.id);
 }
 return placed;
}

export function stepStatus(step:RoadmapStep,mastered:Set<string>,evidence:RoadmapEvidence[],introComplete:boolean,secure: ReadonlySet<string> = new Set()){
 if(step.status==='open'&&introComplete)return 'practising';
 if(step.status==='practising'&&listeningReady(step,secure)&&step.skills.every(skill=>mastered.has(skill))&&
    evidence.some(row=>independent(row)&&row.stage==='independent'&&transferActivities.has(row.activity)&&row.skills.some(skill=>step.skills.includes(skill))))return 'passed';
 return step.status;
}

type NextInput={
 steps:RoadmapStep[];skills:RoadmapSkill[];errors:{skillId:string;confidence:string;status:string}[];
 independentSkills:Set<string>;challenged:Set<string>;day:string;daily:boolean;requestMode:'learn'|'practice'|'personal';
 maxDifficulty:number;recentPractice:number;replan?:boolean;requestedStepId?:string;
};
export function decideNext(state:NextInput) {
 const live=state.skills.filter(skill=>skill.status!=='retired'), valid=new Set(live.map(s=>s.skillId));
 const steps=state.steps.filter(step=>step.status!=='retired'&&step.skills.every(skill=>valid.has(skill)));
 const done=new Set(steps.filter(isDone).map(step=>step.id));
 const next=steps.find(step=>step.status==='planned'&&step.requires.every(req=>done.has(req)));
 const current=steps.find(step=>step.status==='open'||step.status==='practising');
 const confirmed=new Set(state.errors.filter(e=>e.confidence==='confirmed'&&e.status!=='resolved').map(e=>e.skillId));
 const knownSkills=new Set(steps.filter(step=>step.status!=='planned').flatMap(step=>step.skills));
 const errors=[...confirmed].filter(id=>knownSkills.has(id));
 const due=live.filter(skill=>skill.nextReviewDay&&skill.nextReviewDay<=state.day);
 const urgent=due.length>=3||due.some(skill=>skill.nextReviewDay!<=addDays(state.day,-7));
 const challenge=current?.status==='practising'&&!state.challenged.has(current.id)&&current.band<state.maxDifficulty&&
   current.skills.every(skill=>state.independentSkills.has(skill)&&!confirmed.has(skill));
 const roadmapTask=state.replan||!steps.length?'replan':nextSteps(steps,4).length<=3?'extend':'none';
 const decision=(mode:'learn'|'practice'|'review'|'challenge'|'personal'|'none',step:RoadmapStep|undefined,skills:string[],reasonCode:ReasonCode,needsScaffold=false)=>{
  const band=Math.min(step?.band??2,state.maxDifficulty);
  const stepRole:StepRole|null=mode==='learn'?'intro':mode==='challenge'?'challenge':step&&(mode==='practice'||mode==='review')?'practice':null;
  return {mode,minutes:state.daily?45 as const:15 as const,step:step?{id:step.id,title:step.title,skills:step.skills}:null,
   stepRole, targetSkills:skills.slice(0,3),difficulty:{min:Math.max(1,band-1),max:Math.min(state.maxDifficulty,band+1)},
   reasonCode,reason:reasons[reasonCode],needsScaffold,roadmapTask};
 };
 const learn=()=>{
  const weak=next?.skills.flatMap(skill=>live.find(s=>s.skillId===skill)?.prerequisites??[])
    .some(skill=>!live.some(s=>s.skillId===skill&&s.mastery==='demonstrated'))??false;
  return decision('learn',next,next?.skills??[],weak?'scaffold':'next_step',weak);
 };
 const requested=!state.daily&&state.requestedStepId?steps.find(step=>step.id===state.requestedStepId):undefined;
 if(requested)return decision('practice',requested,requested.skills,'step_practice');
 if(!state.daily&&state.requestMode==='personal')return decision('personal',undefined,live.map(s=>s.skillId),'personal');
 if(errors.length){
  const target=steps.find(step=>step.status!=='planned'&&step.skills.includes(errors[0]));
  return decision('practice',target,errors,'confirmed_error');
 }
 if(next&&state.recentPractice>=2)return learn();
 if(urgent)return decision('review',current,due.map(s=>s.skillId),'reviews_due');
 if(challenge)return decision('challenge',current,current.skills,'challenge_ready');
 if(current)return decision('practice',current,current.skills,'step_practice');
 if(next)return learn();
 if(due.length)return decision('review',undefined,due.map(s=>s.skillId),'reviews_due');
 if(roadmapTask!=='none'&&live.length)return decision('practice',undefined,live.map(s=>s.skillId),'roadmap_empty');
 return decision('none',undefined,[],'roadmap_empty');
}

export async function roadmapSignals(db:Db,learnerId:string,subjectId:string,day:string){
 const [independent, recent]=await Promise.all([
  db.prepare(`SELECT DISTINCT x.value AS skill FROM attempts a JOIN grades g ON g.id=a.current_grade_id
   CROSS JOIN json_each(a.skill_ids) x WHERE a.learner_id=? AND a.subject_id=? AND a.status='graded'
   AND a.attempt_no=1 AND a.support='none' AND g.result='correct'`).bind(learnerId,subjectId).all<{skill:string}>(),
  db.prepare(`SELECT id,step_role,kind,roadmap_step_id,assigned_date FROM learning_lessons
   WHERE user_id=? AND subject_id=? AND (assigned_date>? OR id IN
    (SELECT id FROM learning_lessons WHERE user_id=? AND subject_id=? ORDER BY assigned_date DESC,updated DESC,id DESC LIMIT 2))
   ORDER BY assigned_date DESC,updated DESC,id DESC`).bind(learnerId,subjectId,addDays(day,-3),learnerId,subjectId)
   .all<{step_role:string|null;kind:string;roadmap_step_id:string|null;assigned_date:string}>(),
 ]);
 return {
  independentSkills:new Set(independent.results?.map(row=>row.skill)),
  challenged:new Set((recent.results??[]).filter(row=>row.step_role==='challenge'&&row.roadmap_step_id&&row.assigned_date>addDays(day,-3)).map(row=>row.roadmap_step_id!)),
  recentPractice:(recent.results??[]).slice(0,2).findIndex(row=>!['review','remediation'].includes(row.kind))===-1
   ?Math.min(2,recent.results?.length??0):0,
 };
}

/** Evaluate the committed evidence in the caller's write batch, after grades and skill states. */
export function roadmapProgressWrite(db:EvidenceDb,learnerId:string,lessonId:string,now:Date,gate='1=1',bindings:unknown[]=[]){
 const stamp=now.toISOString();
 return db.prepare(`WITH lesson AS (
    SELECT id,user_id,subject_id,step_role,roadmap_step_id,completed_at,origin_job_id
    FROM learning_lessons WHERE id=? AND user_id=? AND subject_id IS NOT NULL AND ${gate}
  ), steps AS (
    SELECT r.*, (r.listening=0 OR NOT EXISTS (
      SELECT 1 FROM json_each(r.skill_ids) sk WHERE NOT EXISTS (
        SELECT 1 FROM skill_states st WHERE st.skill_id=sk.value AND st.learner_id=r.learner_id
          AND st.subject_id=r.subject_id AND json_extract(st.listening,'$.level')='secure'
      )
    )) AS listening_ready FROM roadmap_steps r JOIN lesson l ON l.user_id=r.learner_id AND l.subject_id=r.subject_id
    WHERE r.status IN ('planned','open','practising')
  ), evidence AS (
    SELECT i.item_id,i.skill_ids,i.stage,i.activity,a.status,
      coalesce(a.support='none' AND a.status='graded' AND g.result='correct',0) AS correct
    FROM lesson_items i JOIN lesson l ON l.id=i.lesson_id AND l.user_id=i.learner_id AND l.subject_id=i.subject_id
    LEFT JOIN attempts a ON a.lesson_id=i.lesson_id AND a.item_id=i.item_id AND a.learner_id=i.learner_id AND a.attempt_no=1
    LEFT JOIN grades g ON g.id=a.current_grade_id AND g.attempt_id=a.id
  ), candidates AS (
    SELECT id,skill_ids,listening_ready,row_number() OVER (ORDER BY ord,id) AS position
    FROM steps WHERE status='planned' AND (SELECT step_role FROM lesson)='placement'
      AND origin_job_id IS (SELECT origin_job_id FROM lesson)
    ORDER BY ord,id LIMIT 8
  ), placement_evidence AS (
    SELECT e.*, (SELECT c.id FROM candidates c WHERE NOT EXISTS (
      SELECT 1 FROM json_each(e.skill_ids) sk WHERE sk.value NOT IN (SELECT value FROM json_each(c.skill_ids))
    ) ORDER BY c.position LIMIT 1) AS step_id FROM evidence e WHERE json_array_length(e.skill_ids)>0
  ), placement_failure AS (
    SELECT min(c.position) AS position FROM candidates c WHERE NOT c.listening_ready OR EXISTS (
      SELECT 1 FROM json_each(c.skill_ids) sk WHERE NOT EXISTS (
        SELECT 1 FROM placement_evidence e WHERE e.step_id=c.id AND sk.value IN (SELECT value FROM json_each(e.skill_ids))
      )
    ) OR EXISTS (SELECT 1 FROM placement_evidence e WHERE e.step_id=c.id AND e.correct=0)
  ), decisions AS (
    SELECT s.id,s.revision,s.status,
      CASE
        WHEN s.status='planned' AND l.step_role='placement' AND l.completed_at IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM evidence WHERE status IN ('pending','disputed'))
          AND EXISTS (SELECT 1 FROM candidates c WHERE c.id=s.id AND c.position<coalesce((SELECT position FROM placement_failure),9))
          THEN 'placement'
        WHEN s.status='open' AND l.step_role='intro' AND l.roadmap_step_id=s.id AND l.completed_at IS NOT NULL
          THEN 'intro'
        WHEN s.status='practising' AND s.listening_ready AND l.step_role='challenge' AND l.roadmap_step_id=s.id
          AND NOT EXISTS (SELECT 1 FROM evidence WHERE status IN ('pending','disputed'))
          AND (SELECT count(*) FROM evidence) BETWEEN 5 AND 6
          AND (SELECT sum(correct) FROM evidence)*5>=(SELECT count(*) FROM evidence)*4
          AND NOT EXISTS (SELECT 1 FROM json_each(s.skill_ids) sk WHERE NOT EXISTS (
            SELECT 1 FROM evidence e WHERE e.correct AND sk.value IN (SELECT value FROM json_each(e.skill_ids))
          )) THEN 'challenge'
        WHEN s.status='practising' AND s.listening_ready
          AND NOT EXISTS (SELECT 1 FROM json_each(s.skill_ids) sk WHERE NOT EXISTS (
            SELECT 1 FROM skill_states st WHERE st.skill_id=sk.value AND st.learner_id=s.learner_id
              AND st.subject_id=s.subject_id AND st.mastery='demonstrated'
          ))
          AND EXISTS (SELECT 1 FROM attempts a JOIN grades g ON g.id=a.current_grade_id AND g.attempt_id=a.id
            JOIN lesson_items i ON i.lesson_id=a.lesson_id AND i.item_id=a.item_id AND i.learner_id=a.learner_id
            JOIN learning_lessons source ON source.id=a.lesson_id AND source.user_id=a.learner_id AND source.subject_id=a.subject_id
            WHERE a.learner_id=s.learner_id AND a.subject_id=s.subject_id AND a.status='graded' AND g.result='correct'
              AND a.attempt_no=1 AND a.support='none' AND i.stage='independent'
              AND i.activity IN (SELECT value FROM json_each(?))
              AND (source.roadmap_step_id=s.id OR source.step_role IS NULL)
              AND EXISTS (SELECT 1 FROM json_each(a.skill_ids) sk WHERE sk.value IN (SELECT value FROM json_each(s.skill_ids)))
          ) THEN 'mastery'
      END AS via
    FROM steps s CROSS JOIN lesson l
  )
  UPDATE roadmap_steps AS r SET
    status=CASE d.via WHEN 'placement' THEN 'placed' WHEN 'intro' THEN 'practising' ELSE 'passed' END,
    passed_via=nullif(d.via,'intro'),passed_at=CASE WHEN d.via<>'intro' THEN ? END,updated_at=?,revision=r.revision+1
  FROM decisions d WHERE r.id=d.id AND r.revision=d.revision AND r.status=d.status AND d.via IS NOT NULL`)
  .bind(lessonId,learnerId,...bindings,JSON.stringify([...transferActivities]),stamp,stamp);
}
