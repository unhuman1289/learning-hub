import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { setAiControls } from '../lib/ai-controls.ts';
import { listFamily, setTutorEnabled } from '../lib/admin/family.ts';
import { backupColumns, buildRestoreSql } from '../lib/backup-contract.mjs';
import { lessonSummary } from '../lib/lesson-v2/summary.ts';
import { insertLessonV2 } from '../lib/lesson-v2/store.ts';
import { getTutor, postTutor } from '../lib/tutor/http.ts';
import { fakeTutorOpenAi } from '../lib/tutor/fake-openai.ts';
import { memoryDb } from './d1-adapter.mjs';
const origin='http://localhost', learner={id:'child',name:'Private Name',email:'private@example.test'}, guardian={id:'guardian'}, stranger={id:'stranger'};
const subjectId='sub_aaaaaaaaaaaaaaaaaaaa';
const fixture=JSON.parse(readFileSync(new URL('../fixtures/contracts/lesson-v2/deutsch-modalverb.json',import.meta.url)));
async function setup(t) {
  const db=memoryDb(); t.after(()=>db.sqlite.close());
  db.sqlite.exec(`INSERT INTO user(id,name,email,email_verified,created_at,updated_at,role,status) VALUES('child','Private Name','private@example.test',1,1,1,'learner','active');
    INSERT INTO learner_settings(user_id,updated,role,display_name) VALUES('child','t','child','Ếch');
    INSERT INTO guardians(guardian_id,learner_id,created_by,created_at) VALUES('guardian','child','admin','t');
    INSERT INTO subjects(id,learner_id,title,template,status,created_by,created_at,updated_at) VALUES('${subjectId}','child','Deutsch','skill','active','child','t','t');`);
  const lessonId=await insertLessonV2(db,{learnerId:'child',subjectId,day:'2026-11-15',lesson:fixture});
  const queue=[];
  const ask=({user=learner,query='',referer=origin,fetcher=fakeTutorOpenAi,...data}={})=>postTutor(new Request(origin+'/api/tutor'+query,{method:'POST',headers:{Origin:referer},body:JSON.stringify({lessonId,itemId:'i1',question:'Em nên bắt đầu thế nào?',...data})}),user,()=>db,
    {env:{ENVIRONMENT:'local',APP_ENV:'local',OPENAI_ENABLED:'true',OPENAI_SUBJECT_IDS:subjectId,OPENAI_API_KEY:'fixture',AI_QUEUE:{send:async body=>queue.push(body)}},prompt:'fixture',fetcher});
  const history=(viewer=learner,query='')=>getTutor(new Request(origin+'/api/lessons/'+lessonId+'/tutor'+query),viewer,()=>db,lessonId);
  return {db,ask,history,lessonId,queue};
}
test('authorization, lesson eligibility and question limits remain enforced',async t=>{
 const {db,ask,history,lessonId}=await setup(t);
 assert.equal((await ask({user:null})).status,401); assert.equal((await history(null)).status,401);
 assert.equal((await ask({referer:'https://elsewhere.test'})).status,403);
 for (const user of [stranger,guardian,{id:'admin',role:'admin'}]) assert.equal((await ask({user,query:'?learner=child'})).status,404);
 for(const question of [' '.repeat(500),'a'.repeat(501),'🙂'.repeat(501),'a\0b']) assert.equal((await ask({question})).status,400);
 assert.equal((await ask({itemId:'i99'})).status,404);
 db.sqlite.prepare("UPDATE learning_lessons SET completed_at='t' WHERE id=?").run(lessonId);
 assert.equal((await ask()).status,409);
});
test('API failure queues one open turn and dispatches it; hint1 is preserved',async t=>{
 const {db,ask,queue,lessonId}=await setup(t);
 const response=await ask({fetcher:async()=>{throw Error('offline')}}); const text=await response.text();
 assert.match(text,/event: queued/); assert.match(text,/Gia sư đang bận/); assert.equal(queue.length,1);
 assert.equal((await ask()).status,409);
 assert.equal(db.sqlite.prepare('SELECT status FROM tutor_turns').get().status,'queued');
 assert.equal(db.sqlite.prepare("SELECT json_extract(support,'$.i1') AS level FROM learning_lessons WHERE id=?").get(lessonId).level,'hint1');
});
test('guardian can read saved response and question with contact information redacted',async t=>{
 const {ask,history}=await setup(t);
 const response=await ask({question:'Liên hệ test@example.test hoặc +49 451 1234567'});
 assert.match(await response.text(),/event: delta[\s\S]*event: delta[\s\S]*event: done/);
 assert.equal((await history(stranger,'?learner=child')).status,404); assert.equal((await history(guardian)).status,404);
 const {turns}=await (await history(guardian,'?learner=child')).json();
 assert.match(turns[0].question,/\[email redacted\]/);assert.match(turns[0].question,/\[phone redacted\]/);assert.equal(turns[0].status,'answered');
});
test('per-lesson limit, profile toggle and guardian history',async t=>{
 const {db,ask,history,lessonId}=await setup(t);
 assert.equal((await listFamily(db))[0].tutorEnabled,true);await setTutorEnabled(db,'child',false);assert.equal((await ask()).status,403);
 assert.equal((await history(guardian,'?learner=child')).status,200);await setTutorEnabled(db,'child',true);
 for(let n=0;n<20;n++) assert.match(await (await ask()).text(),/event: done/);
 assert.equal((await ask()).status,409);assert.equal((await lessonSummary(db,'child',lessonId)).tutorTurns.length,20);
});
test('child can ask by default and a disabled notebook returns 403',async t=>{
 const {db,ask}=await setup(t);
 assert.match(await (await ask()).text(),/event: done/);
 await setAiControls(db,{OPENAI_ENABLED:'true'},subjectId,{openaiEnabled:false,ttsEnabled:true},'admin');
 assert.equal((await ask()).status,403);
});
test('backup restores tutor turns with usage and older snapshots with defaults',async t=>{
 const {db,ask}=await setup(t);await (await ask()).text();
 const snapshot={format:4,tables:Object.fromEntries(Object.keys(backupColumns).map(table=>[table,db.sqlite.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(table)?db.sqlite.prepare(`SELECT * FROM "${table}"`).all():[]]))};
 const target=memoryDb();t.after(()=>target.sqlite.close());target.sqlite.exec(buildRestoreSql(snapshot));
 assert.deepEqual(target.sqlite.prepare('SELECT * FROM tutor_turns').all(),snapshot.tables.tutor_turns);
 assert.deepEqual(target.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
 for(const row of snapshot.tables.tutor_turns) for(const field of ['input_tokens','output_tokens','attempt_token','lease_expires_at']) delete row[field];
 const old=memoryDb();t.after(()=>old.sqlite.close());old.sqlite.exec(buildRestoreSql(snapshot));
 assert.equal(old.sqlite.prepare('SELECT input_tokens FROM tutor_turns').get().input_tokens,null);
});
