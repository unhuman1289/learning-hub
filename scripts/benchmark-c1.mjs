// Synthetic context-only byte comparison. No network or real learner data.
import { writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { compactOpenAiContext, compactPlanContext } from '../lib/ai/job.mjs';
import { memoryDb } from '../tests/d1-adapter.mjs';
import { insertLessonV2 } from '../lib/lesson-v2/store.ts';
import { openTutorTurn } from '../lib/tutor/service.ts';
import { tutorContext } from '../lib/tutor/context.ts';
const text = 'Học tiếng Đức và thực hành câu mới. '.repeat(12);
const subjects = [{subjectId:'synthetic',goal:text,instructions:text,progressSummary:text,skills:[],errorPatterns:[],roadmap:Array.from({length:20},(_,i)=>({id:`step-${i}`,title:text,objective:text})),recentLessons:Array.from({length:4},(_,i)=>({lessonId:`lesson-${i}`,assignedDay:'2026-11-01',kind:'primary',title:text,completed:true,items:Array.from({length:3},()=>({itemId:'item',attemptId:'attempt',activity:'practice',skills:[],prompt:text,result:'correct',support:'none',attemptNo:1,errorLabels:[],flag:null}))}))}];
const plan={contract:'plan-context/1',adaptive:{roadmapTask:'none',step:{id:'step-10'}},subjects};
const assess={contract:'assess-context/1',contextHash:'synthetic',purpose:'submission',learner:{role:'adult',explainLanguage:'vi',displayName:'Người học',personalPrompt:''},subject:{title:'Deutsch',level:'A2',sensitivity:'normal',goal:text,instructions:text},lesson:{title:'Bài giả',objective:'Luyện viết'},attempts:[{attemptId:'a',itemId:'i',prompt:'Viết một câu.',rubric:[{criterion:'Đúng ngữ pháp',points:1}],solution:'Một đáp án mẫu.',answer:'Câu trả lời giả.',skills:['sk_demo'],previousAttempts:[]}],openErrorPatterns:[],recentEvidence:[],skills:Array.from({length:10},(_,i)=>({skillId:`sk_${i}`,name:text})),calibration:[],recheck:null,truncated:[]};
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const db=memoryDb();
db.sqlite.exec("INSERT INTO user(id,name,email,email_verified,created_at,updated_at,role,status) VALUES('u','Demo','demo@example.test',1,1,1,'learner','active'); INSERT INTO learner_settings(user_id,updated,role,display_name) VALUES('u','t','child','Demo'); INSERT INTO subjects(id,learner_id,title,template,status,created_by,created_at,updated_at) VALUES('sub_demo','u','Deutsch','skill','active','u','t','t');");
const fixture=JSON.parse(readFileSync(new URL('../fixtures/contracts/lesson-v2/deutsch-modalverb.json',import.meta.url)));
const lessonId=await insertLessonV2(db,{learnerId:'u',subjectId:'sub_demo',day:'2026-11-17',lesson:fixture});
db.sqlite.prepare("DELETE FROM lesson_items WHERE lesson_id=? AND item_id NOT IN ('i1','i2')").run(lessonId);
const row=db.sqlite.prepare("SELECT * FROM lesson_items WHERE lesson_id=? AND item_id='i1'").get(lessonId); const columns=Object.keys(row); const insert=db.sqlite.prepare(`INSERT INTO lesson_items (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`);
for(let n=3;n<=25;n++){const item=JSON.parse(row.payload); item.id=`i${n}`; item.prompt=`Câu ${n}: `+text.repeat(6); insert.run(...columns.map(c=>c==='item_id'?item.id:c==='payload'?JSON.stringify(item):row[c]));}
const turn=await openTutorTurn(db,'u',{lessonId,itemId:'i3',question:'Gợi ý?'},false);
const baselinePath=new URL('../lib/tutor/.c1-baseline.ts',import.meta.url);
try {
  writeFileSync(baselinePath,execFileSync('git',['show','f700d69:lib/tutor/context.ts']));
  const baseline=(await import('../lib/tutor/.c1-baseline.ts')).tutorContext;
  const results={plan:[bytes(compactPlanContext(plan)),bytes(compactOpenAiContext(plan))],assess:[bytes(assess),bytes(compactOpenAiContext(assess))],tutor:[bytes((await baseline(db,turn.id)).context),bytes((await tutorContext(db,turn.id)).context)]};
  console.log(JSON.stringify(results,null,2));
} finally {unlinkSync(baselinePath); db.sqlite.close();}
