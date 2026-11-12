import {DatabaseSync} from 'node:sqlite';

const args=process.argv.slice(2);
const input=args[args.indexOf('--db')+1];
if(!args.includes('--db')||!input||input.startsWith('--')||args.some(arg=>arg!==input&&!['--db','--apply'].includes(arg)))
  throw Error('Usage: node scripts/repair-roadmaps.mjs --db <SQLite copy> [--apply]');
const apply=args.includes('--apply');
const db=new DatabaseSync(input,{readOnly:!apply});
const subjects=db.prepare("SELECT id,learner_id,roadmap FROM subjects WHERE status<>'archived' ORDER BY id").all();
const skills=db.prepare('SELECT id FROM skills WHERE subject_id=? AND learner_id=?');
const snapshots=db.prepare(`SELECT context_snapshot FROM ai_jobs WHERE learner_id=? AND context_snapshot IS NOT NULL
 AND created_at>(SELECT min(created_at) FROM ai_jobs WHERE learner_id=? AND subject_id=? AND purpose='initial' AND status='succeeded')
 ORDER BY created_at,id`);
const historical=db.prepare("SELECT DISTINCT roadmap_step_id FROM learning_lessons WHERE subject_id=? AND user_id=? AND roadmap_step_id IS NOT NULL");
const update=apply?db.prepare('UPDATE subjects SET roadmap=?,revision=revision+1,updated_at=? WHERE id=? AND learner_id=? AND roadmap=?'):null;
const stamp=new Date().toISOString();
const report=[];
try {
 if(apply)db.exec('BEGIN IMMEDIATE');
 for(const subject of subjects) {
  const known=new Set(skills.all(subject.id,subject.learner_id).map(row=>row.id));
  const valid=steps=>Array.isArray(steps)&&steps.every(step=>step&&typeof step.title==='string'&&step.title.trim()&&
    Array.isArray(step.skills)&&step.skills.length>0&&step.skills.length<=3&&step.skills.every(id=>known.has(id)));
  let existing;
  try{existing=JSON.parse(subject.roadmap);}catch{existing=null;}
  let recovered=valid(existing)?existing:undefined;
  if(!recovered)for(const {context_snapshot} of snapshots.iterate(subject.learner_id,subject.learner_id,subject.id)){
   let steps;
   try{steps=JSON.parse(context_snapshot).subjects?.find(s=>s.subjectId===subject.id)?.roadmap;}catch{continue;}
   if(steps?.length&&valid(steps)) {
    recovered=steps;break;
   }
  }
  const json=recovered===existing?subject.roadmap:JSON.stringify(recovered??[]);
  const stepIds=new Set((recovered??[]).map((_step,i)=>'step_'+(i+1)));
  const unmatched=historical.all(subject.id,subject.learner_id).filter(row=>!stepIds.has(row.roadmap_step_id)).length;
  if(json!==subject.roadmap&&apply){
    const result=update.run(json,stamp,subject.id,subject.learner_id,subject.roadmap);
    if(result.changes!==1)throw Error('Subject changed during repair');
  }
  report.push({subjectId:subject.id,action:json===subject.roadmap?'unchanged':recovered?'restore':'clear_for_replan',steps:recovered?.length??0,historicalUnmatched:unmatched});
 }
 if(apply)db.exec('COMMIT');
 console.log(JSON.stringify({mode:apply?'applied':'dry-run',subjects:report},null,2));
} catch(error){
 if(apply&&db.isTransaction)db.exec('ROLLBACK');
 throw error;
} finally{db.close();}
