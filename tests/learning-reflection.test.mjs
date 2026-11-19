import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {memoryDb} from './d1-adapter.mjs';
import {saveReflection,readReflection} from '../lib/lesson-reflection.ts';
import {insertLessonV2} from '../lib/lesson-v2/store.ts';
import {saveDraft} from '../lib/lesson-v2/actions.ts';
import {submitLesson} from '../lib/evidence/submit.ts';
import {buildPlanContext} from '../lib/ai-jobs/context/plan.ts';
import {roadmap,planResult} from '../lib/contracts/ai-common.ts';
import {readSubjectEffort} from '../lib/learner-model/recompute.ts';
const sid='sub_aaaaaaaaaaaaaaaaaaaa',now=new Date('2026-10-14T16:00:00Z');
const input={revision:0,difficulty:'fit',usefulness:'useful',minutes:42,note:'Luyện email công việc nhiều hơn'};
async function setup(){
 const db=memoryDb();
 db.sqlite.prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at,role,status) VALUES('learner','unhuman','test@example.test',1,1,1,'learner','active')").run();
 db.sqlite.prepare("INSERT INTO subjects(id,learner_id,title,template,status,ai_enabled,created_by,created_at,updated_at) VALUES(?,'learner','Deutsch','skill','active',1,'learner','t','t')").run(sid);
 const lesson=JSON.parse(readFileSync(new URL('../fixtures/contracts/lesson-v2/deutsch-modalverb.json',import.meta.url)));
 const id=await insertLessonV2(db,{learnerId:'learner',subjectId:sid,day:'2026-10-14',lesson});
 await saveDraft(db,'learner',id,{revision:0,answers:{i1:{answer:'["b"]'}}});
 const submission=await submitLesson(db,'learner',id,{clientSubmissionId:crypto.randomUUID(),draftRevision:1,stage:null,itemIds:['i1']});
 return {db,id,submission};
}
test('reflection is owner-only, gated on grading, revision-safe; survives backup columns and enters next context',async()=>{
 const {db,id,submission}=await setup();
 await assert.rejects(readReflection(db,'other',submission.id),e=>e.status===404);
 await saveReflection(db,'learner',submission.id,input,now);
 await assert.rejects(saveReflection(db,'learner',submission.id,input,now),e=>e.status===409);
 await saveReflection(db,'learner',submission.id,{...input,revision:1,note:'Giải thích weil rõ hơn'},now);
 assert.equal((await readReflection(db,'learner',submission.id)).revision,2);
 db.sqlite.prepare("UPDATE attempts SET status='pending' WHERE submission_id=?").run(submission.id);
 await assert.rejects(saveReflection(db,'learner',submission.id,{...input,revision:2},now),e=>e.status===409);
 db.sqlite.prepare("UPDATE attempts SET status='graded' WHERE submission_id=?").run(submission.id);
 const job={id:'job_test',learner_id:'learner',subject_id:sid,purpose:'daily',learning_day:'2026-10-14'};
 const context=await buildPlanContext(db,job,'local');
 assert.equal(context.learner.targetMinutes,45);
 for (const roadmapV2 of [false, true]) {
  const adaptive = await buildPlanContext(db, {...job, adaptive:1}, 'local', roadmapV2);
  assert.equal(adaptive.learner.targetMinutes,45);
  assert.equal(adaptive.adaptive.minutes,45);
 }
 assert.equal(context.subjects[0].learnerReflections[0].note,'Giải thích weil rõ hơn');
 assert.equal(db.sqlite.prepare('SELECT completed_at FROM learning_lessons WHERE id=?').get(id).completed_at,null);
 assert.equal(context.subjects[0].roadmap.length,0);
 db.sqlite.close();
});
test('a resubmission reads and updates the same lesson reflection with a shared revision', async t => {
 const {db,id,submission}=await setup();
 t.after(()=>db.sqlite.close());
 await saveReflection(db,'learner',submission.id,input,now);
 const later=new Date('2026-10-14T17:00:00Z');
 await saveDraft(db,'learner',id,{revision:1,answers:{i1:{answer:'["a"]'}}},later);
 const retry=await submitLesson(db,'learner',id,{clientSubmissionId:crypto.randomUUID(),draftRevision:2,stage:null,itemIds:['i1']},later);
 assert.notEqual(retry.id,submission.id);
 assert.deepEqual(await readReflection(db,'learner',retry.id),await readReflection(db,'learner',submission.id));
 const edits=await Promise.allSettled([submission.id,retry.id].map(key =>
   saveReflection(db,'learner',key,{...input,revision:1,note:'Thêm ví dụ ở bài sau'},later)));
 assert.equal(edits.filter(result=>result.status==='fulfilled').length,1);
 assert.equal(edits.find(result=>result.status==='rejected').reason.status,409);
 assert.deepEqual(db.sqlite.prepare('SELECT submission_id,revision,note FROM lesson_reflections').all().map(row=>({...row})),
   [{submission_id:submission.id,revision:2,note:'Thêm ví dụ ở bài sau'}]);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM submissions').get().n,2);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM attempts').get().n,2);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM grades').get().n,2);

 // Before W7 a later submission could have its own reflection.
 db.sqlite.prepare(`INSERT INTO lesson_reflections
   SELECT ?,learner_id,lesson_id,subject_id,difficulty,usefulness,minutes,'Góp ý cũ mới nhất',1,created_at,?
   FROM lesson_reflections WHERE submission_id=?`).run(retry.id,'2026-10-14T18:00:00Z',submission.id);
 assert.equal((await readReflection(db,'learner',submission.id)).note,'Góp ý cũ mới nhất');
 await saveReflection(db,'learner',submission.id,{...input,revision:1,note:'Góp ý hiện tại'},new Date('2026-10-14T19:00:00Z'));
 assert.deepEqual(db.sqlite.prepare('SELECT note FROM lesson_reflections ORDER BY updated_at').all().map(row=>row.note),
   ['Thêm ví dụ ở bài sau','Góp ý hiện tại']);
 const context=await buildPlanContext(db,{id:'job_test',learner_id:'learner',subject_id:sid,purpose:'daily',learning_day:'2026-10-14'},'local');
 assert.deepEqual(context.subjects[0].learnerReflections.map(row=>row.note),['Góp ý hiện tại']);
});

test('roadmap requires 5–10 typed steps and preserves old plan-result compatibility',()=>{
 const step={title:'Ôn lịch hẹn',objective:'Viết email',situation:'Công việc',skills:['sk_test'],mode:'review'};
 assert(roadmap.safeParse(Array.from({length:5},()=>step)).success);
 assert(!roadmap.safeParse([step]).success);
 assert(!roadmap.safeParse(Array.from({length:11},()=>step)).success);
 assert(!roadmap.safeParse(Array.from({length:5},()=>({...step,mode:'fake'}))).success);
 assert(planResult.safeParse({contract:'plan-result/1',contextHash:'sha256:'+'0'.repeat(64),summary:'',subjects:[],explorations:[],usage:{model:'none',inputTokens:0,outputTokens:0,ms:0}}).success);
});
test('effort counts measured minutes separately from retries and ungraded work',async()=>{
 const {db}=await setup();
 db.sqlite.prepare("INSERT INTO study_time(user_id,day,track,seconds,updated) VALUES('learner','2026-10-14','sub_aaaaaaaaaaaaaaaaaaaa',600,'t')").run();
 const effort=await readSubjectEffort(db,'learner',sid,now);
 assert.equal(effort.minutes,10);assert.equal(effort.days,1);assert.equal(effort.attempts,1);assert.equal(effort.retries,0);
 db.sqlite.close();
});

test('backup restore retains reflections and roadmap on a fresh isolated database',async()=>{
 const {backupColumns,buildRestoreSql}=await import('../lib/backup-contract.mjs');
 const {db,submission}=await setup();await saveReflection(db,'learner',submission.id,input,now);
 const path=Array.from({length:5},()=>({title:'Email',objective:'Viết',situation:'Công việc',skills:['sk_test'],mode:'new'}));
 db.sqlite.prepare('UPDATE subjects SET roadmap=? WHERE id=?').run(JSON.stringify(path),sid);
 const snapshot={format:4,tables:Object.fromEntries(Object.keys(backupColumns).map(t=>[t,db.sqlite.prepare("SELECT 1 FROM sqlite_schema WHERE name=?").get(t) ? db.sqlite.prepare(`SELECT * FROM ${t}`).all() : []]))};
 const restored=memoryDb();restored.sqlite.prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at,role,status) VALUES('learner','unhuman','test@example.test',1,1,1,'learner','active')").run();
 restored.sqlite.exec(buildRestoreSql(snapshot));
 assert.equal((await readReflection(restored,'learner',submission.id)).note,input.note);
 assert.equal(JSON.parse(restored.sqlite.prepare('SELECT roadmap FROM subjects WHERE id=?').get(sid).roadmap).length,5);
 assert.equal(restored.sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
 db.sqlite.close();restored.sqlite.close();
});
