import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { setAiControls } from '../lib/ai-controls.ts';
import { familyAccessError, listFamily, setTutorAddress, setTutorEnabled } from '../lib/admin/family.ts';
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
 for(const row of snapshot.tables.tutor_turns) for(const field of ['input_tokens','output_tokens','cached_tokens','attempt_token','lease_expires_at']) delete row[field];
 const old=memoryDb();t.after(()=>old.sqlite.close());old.sqlite.exec(buildRestoreSql(snapshot));
 assert.equal(old.sqlite.prepare('SELECT input_tokens FROM tutor_turns').get().input_tokens,null);
});

test('tutor timing reports the pre-answer phases without learner content',async t=>{
 const {ask}=await setup(t);const entries=[];const original=console.info;
 console.info=x=>{try{entries.push(JSON.parse(x))}catch{}};
 try { assert.match(await (await ask()).text(),/event: done/); } finally { console.info=original; }
 const log=entries.find(entry=>entry.component==='tutor-timing');assert.ok(log);
 for(const key of ['body_ms','access_ms','notebook_ms','open_turn_ms']) assert.ok(Number.isFinite(log[key]) && log[key]>=0,key);
 assert.doesNotMatch(JSON.stringify(log),/Private Name|private@example\.test|Em nên bắt đầu/);
});

test('counts D1 calls on a successful tutor request before the model call',async t=>{
 const {db,lessonId}=await setup(t);let calls=0;const counted={...db,prepare(sql){const base=db.prepare(sql);const s={bind(...args){base.bind(...args);return s},async first(){calls++;return base.first()},async all(){calls++;return base.all()},async run(){calls++;return base.run()}};return s},async batch(stmts){calls++;return db.batch(stmts.map(s=>s._base??s))}};
 // Statements passed to batch must retain the adapter's SQL metadata.
 counted.prepare=sql=>{const base=db.prepare(sql),s={_base:base,bind(...args){base.bind(...args);return s},async first(){calls++;return base.first()},async all(){calls++;return base.all()},async run(){calls++;return base.run()}};return s};
 let beforeFetch=0;
 const req=new Request(origin+'/api/tutor',{method:'POST',headers:{Origin:origin},body:JSON.stringify({lessonId,itemId:'i1',question:'Gợi ý?'})});
 const response=await postTutor(req,learner,()=>counted,{env:{ENVIRONMENT:'local',APP_ENV:'local',OPENAI_ENABLED:'true',OPENAI_API_KEY:'fixture'},prompt:'fixture',fetcher:async (...args)=>{beforeFetch=calls;return fakeTutorOpenAi(...args)}});
 assert.match(await response.text(),/event: done/);
 assert.equal(beforeFetch,10);
});

test('atomic tutor support preserves stronger help',async t=>{
 const {db,ask,lessonId}=await setup(t);
 db.sqlite.prepare('UPDATE learning_lessons SET support=? WHERE id=?').run(JSON.stringify({i1:'solution'}),lessonId);
 assert.match(await (await ask()).text(),/event: done/);
 assert.equal(db.sqlite.prepare("SELECT json_extract(support,'$.i1') AS level FROM learning_lessons WHERE id=?").get(lessonId).level,'solution');
});

test('history reports the binding per-lesson or daily limit',async t=>{
 const {db,history,lessonId}=await setup(t);
 const insert=db.sqlite.prepare("INSERT INTO tutor_turns(id,lesson_id,item_id,learner_id,question,status,created_at) VALUES(?,?,'i1','child','q','answered',?)");
 const now=new Date().toISOString();
 for(let i=0;i<20;i++) insert.run('lesson_'+i,lessonId,now);
 let data=await (await history()).json(); assert.equal(data.remaining,0); assert.equal(data.limit,'lesson');
 const other=await insertLessonV2(db,{learnerId:'child',subjectId,day:'2026-11-14',lesson:fixture});
 const extra=await insertLessonV2(db,{learnerId:'child',subjectId,day:'2026-11-13',lesson:fixture});
 const fourth=await insertLessonV2(db,{learnerId:'child',subjectId,day:'2026-11-12',lesson:fixture});
 const fifth=await insertLessonV2(db,{learnerId:'child',subjectId,day:'2026-11-11',lesson:fixture});
 for(let i=0;i<60;i++) insert.run('other_'+i,[other,extra,fourth,fifth][Math.floor((i+1)/20)],now);
 const res=await getTutor(new Request(origin+'/api/lessons/'+other+'/tutor'),learner,()=>db,other);
 data=await res.json(); assert.equal(data.remaining,0); assert.equal(data.limit,'day');
});

test('family address uses the admin gate and updates only the supplied field', async t => {
  const { db, history } = await setup(t);
  assert.equal(familyAccessError(null).status, 401);
  for (const user of [learner, guardian, { role: 'learner' }]) {
    assert.equal(familyAccessError(user).status, 403);
  }
  assert.equal(familyAccessError({ role: 'admin' }), null);

  await setTutorAddress(db, 'child', { self: 'em', call: 'chị Ếch' });
  await setTutorAddress(db, 'child', { call: ' chị Ếch mới ' });
  const [member] = await listFamily(db);
  assert.equal(member.tutorSelf, 'em');
  assert.equal(member.tutorCall, 'chị Ếch mới');
  const { displayName, self, call } = await (await history()).json();
  assert.deepEqual({ displayName, self, call }, { displayName: 'Ếch', self: 'em', call: 'chị Ếch mới' });

  for (const invalid of [{ self: 'tôi' }, { call: 'ông\nThắng' }, { call: 'ông\u2028Thắng' }, { call: 'ô'.repeat(31) }, {}]) {
    await assert.rejects(setTutorAddress(db, 'child', invalid), { status: 400 });
  }
  assert.throws(() => db.sqlite.exec("UPDATE learner_settings SET tutor_call='line' || char(10) || 'break'"), /CHECK/);
  await setTutorAddress(db, 'child', { self: null, call: null });
  const defaults = await (await history()).json();
  assert.equal(defaults.self, 'con');
  assert.equal(defaults.call, 'Ếch');
});
