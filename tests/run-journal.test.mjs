import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {memoryDb} from './d1-adapter.mjs';
import {startRun,commitRun,readRunJournal,failRun} from '../lib/run-journal.ts';
import {runSchema} from '../lib/run-schema.ts';
import {createBackup} from '../lib/backup-store.ts';
import {buildRestoreSql} from '../lib/backup-contract.mjs';
import {apiFailure,ApiError} from '../lib/api-error.ts';
const content={title:'Bài mới',objective:'Kiểm chứng',minutes:30,level:'A2',sections:[{heading:'Khái niệm',text:'Nội dung'},{heading:'Ví dụ',text:'Ví dụ'}],diagram:'',exercise:'Thử',questions:[{question:'Một',answer:'A'},{question:'Hai',answer:'B'}],deliverable:'Email',sources:[{title:'Nguồn',url:'https://example.org',readScope:'Một phần',retrievedAt:'2026-10-08T01:00:00.000Z',publishedAt:null}],nextTopic:'Kế tiếp'};
const learner='learner-a';
function seed(db){
 for(const track of ['Deutsch','Cardio']){
  db.sqlite.prepare("INSERT INTO learning_lessons(id,user_id,track,payload,assigned_date,completed_at,response,updated) VALUES(?,?,?,?,'2026-10-07',?,?,'2026-10-07T20:00:00.000Z')").run('old-'+track,learner,track,JSON.stringify(content),track==='Deutsch'?'2026-10-07T21:00:00.000Z':null,"Câu trả lời ' riêng");
  db.sqlite.prepare('INSERT INTO learning_slots VALUES(?,?,?,0)').run(learner,track,'old-'+track);
 }
}
const listeningSchema=readFileSync(new URL('../drizzle/0031_listening.sql',import.meta.url),'utf8');
const now=new Date('2026-10-08T01:00:01Z');
const input=runId=>runSchema.parse({runId,runDate:'2026-10-08',summary:'Kiểm tra',lessons:[{track:'Deutsch',expectedId:'old-Deutsch',content},{track:'Cardio',expectedId:'old-Cardio',content}]});
test('separate attempts append runs; guarded writer records every track and keeps old answers',async()=>{
 const db=memoryDb({ through: "0025" });seed(db);
 const id=await startRun(db,'scheduled',now);let result=await commitRun(db,input(id),learner,now);
 assert.equal(result.runs[0].status,'finished');assert.equal(result.runs[0].items.length,5);
 assert.equal(result.runs[0].items.find(i=>i.track==='Deutsch').outcome,'updated');
 assert.equal(result.runs[0].items.find(i=>i.track==='Cardio').outcome,'kept');
 assert.match(result.runs[0].items.find(i=>i.track==='Cardio').reason,/chưa hoàn thành/);
 assert.equal(db.sqlite.prepare("SELECT response FROM learning_lessons WHERE id='old-Deutsch'").get().response,"Câu trả lời ' riêng");
 const before=db.sqlite.prepare('SELECT COUNT(*) n FROM learning_lessons').get().n;
 result=await commitRun(db,input(id),learner,now);assert.equal(result.replayed,true);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM runs').get().n,1);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM learning_lessons').get().n,before);
 await assert.rejects(commitRun(db,{...input(id),summary:'Khác'},learner,now),e=>e.status===409);
 const second=await startRun(db,'scheduled',now);result=await commitRun(db,input(second),learner,now);
 assert.equal(result.runs.length,2);
 assert.equal(result.runs.find(r=>r.id===second).items.find(i=>i.track==='Deutsch').outcome,'kept');
 db.sqlite.close();
});
test('readback never starts a run; timeout >2h and absence >26h warn without altering lessons',async()=>{
 const db=memoryDb({ through: "0025" });seed(db);const id=await startRun(db,'scheduled',now);
 let result=await readRunJournal(db,new Date('2026-10-08T03:00:02Z'));
 assert.equal(result.runs[0].status,'failed');assert.equal(result.health.stalledRunId,id);assert.equal(result.health.stale,true);
 assert.equal(db.sqlite.prepare('SELECT status FROM runs').get().status,'started');
 await assert.rejects(commitRun(db,input(id),learner,new Date('2026-10-08T03:00:02Z')),e=>e.status===409);
 await failRun(db,id,'Không đọc được nguồn',now);
 const next=await startRun(db,'scheduled',now);await commitRun(db,{...input(next),lessons:[]},learner,now);
 result=await readRunJournal(db,new Date(now.getTime()+26*3600000));assert.equal(result.health.stale,false);
 result=await readRunJournal(db,new Date(now.getTime()+26*3600000+1));assert.equal(result.health.stale,true);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM runs').get().n,2);db.sqlite.close();
});
test('source issues record failed run; no proposals retain unfinished track with reason',async()=>{
 const db=memoryDb({ through: "0025" });seed(db);const id=await startRun(db,'scheduled',now);
 const result=await commitRun(db,runSchema.parse({runId:id,runDate:'2026-10-08',summary:'Nguồn không truy cập được',lessons:[],issues:[{track:'Deutsch',reason:'Không mở được nguồn'}]}),learner,now);
 assert.equal(result.runs[0].status,'failed');assert.equal(result.health.latestFailed,true);
 assert.equal(result.runs[0].items.find(i=>i.track==='Deutsch').outcome,'error');
 assert.equal(result.runs[0].items.find(i=>i.track==='Cardio').outcome,'kept');
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM learning_lessons').get().n,2);db.sqlite.close();
});
test('all assignment and journal writes rollback together on database failure',async()=>{
 const db=memoryDb({ through: "0025" });seed(db);const id=await startRun(db,'scheduled',now);
 db.sqlite.exec("CREATE TRIGGER reject_finish BEFORE UPDATE ON runs WHEN NEW.status='finished' BEGIN SELECT RAISE(ABORT,'simulated failure'); END;");
 await assert.rejects(commitRun(db,input(id),learner,now));
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM learning_lessons').get().n,2);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM legacy_run_items').get().n,0);
 assert.equal(db.sqlite.prepare('SELECT status FROM runs').get().status,'started');db.sqlite.close();
});
test('backup restores every table and Unicode/quotes into empty migrated SQLite; rejects missing relationships',async()=>{
 const db=memoryDb({ through: "0025" });seed(db);const id=await startRun(db,'manual',now);await commitRun(db,input(id),learner,now);
 db.sqlite.prepare('INSERT INTO learning_workspace VALUES(?,?,2,?)').run('__shared_family_workspace__',JSON.stringify({notes:["Ghi chú ' tiếng Việt"]}),now.toISOString());
 // Keep the v1 journal tables for this fixture while exercising the current backup contract.
 const perfSchema=readFileSync(new URL('../drizzle/0030_perf.sql',import.meta.url),'utf8');
 const tutorSchema=readFileSync(new URL('../drizzle/0032_tutor.sql',import.meta.url),'utf8')+readFileSync(new URL('../drizzle/0033_ai_controls.sql',import.meta.url),'utf8')+readFileSync(new URL('../drizzle/0034_tutor_openai.sql',import.meta.url),'utf8');
 const calibrationSchema=readFileSync(new URL('../drizzle/0036_calibration.sql',import.meta.url),'utf8');
 db.sqlite.exec(perfSchema+listeningSchema+tutorSchema+calibrationSchema);
 const backup=await createBackup(db,'user-private',now);assert.equal(backup.format,4);
 const copy=memoryDb({ through: "0025" });copy.sqlite.exec(perfSchema+listeningSchema+tutorSchema+calibrationSchema);copy.sqlite.exec(buildRestoreSql(backup));
 for(const [table,expected]of Object.entries(backup.tables))assert.deepEqual(copy.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),expected,table);
 assert.throws(()=>copy.sqlite.exec(buildRestoreSql(backup)),/UNIQUE/);
 assert.throws(()=>buildRestoreSql({...backup,tables:{...backup.tables,learning_lessons:[]}}),/missing lessons/);
 copy.sqlite.close();db.sqlite.close();
});
test('legacy snapshot restoration requires and applies an explicit learner owner',()=>{
 const snapshot={format:1,tables:{
  learning_workspace:[],
  learning_lessons:[{id:'legacy-de',track:'Deutsch',payload:'{"title":"A2"}',assigned_date:'2026-10-08',completed_at:null,response:"Antwort ' ä",updated:'2026-10-08T00:00:00Z'}],
  learning_slots:[{track:'Deutsch',lesson_id:'legacy-de',revision:1}],
  learning_runs:[],
 }};
 assert.throws(()=>buildRestoreSql(snapshot),/Missing column in learning_lessons/);
 const copy=memoryDb({ through: "0025" });copy.sqlite.exec(listeningSchema);copy.sqlite.exec(buildRestoreSql(snapshot,{legacyOwnerId:'admin-vu'}));
 assert.equal(copy.sqlite.prepare('SELECT user_id FROM learning_lessons WHERE id=?').get('legacy-de').user_id,'admin-vu');
 assert.equal(copy.sqlite.prepare('SELECT user_id FROM learning_slots WHERE track=?').get('Deutsch').user_id,'admin-vu');
 copy.sqlite.close();
});
test('format-2 backup run_items restore into legacy_run_items after 0005',()=>{
 const snapshot={format:2,tables:{
  learning_workspace:[],learning_lessons:[],learning_slots:[],learning_runs:[],
  runs:[{id:'legacy-run',day:'2026-10-08',status:'finished',started_at:'a',finished_at:'b',summary:'',error:null,origin:'manual',request_hash:null}],
  run_items:[{run_id:'legacy-run',user_id:'admin-vu',track:'Deutsch',outcome:'kept',reason:'unfinished',previous_lesson_id:'old',lesson_id:null,sources:'[]'}],
 }};
 const copy=memoryDb({ through: "0025" });copy.sqlite.exec(buildRestoreSql(snapshot));
 assert.equal(copy.sqlite.prepare('SELECT COUNT(*) n FROM legacy_run_items').get().n,1);
 assert.equal(copy.sqlite.prepare('SELECT COUNT(*) n FROM run_items').get().n,0);
 assert.equal(copy.sqlite.prepare('SELECT reason FROM legacy_run_items').get().reason,'unfinished');
 copy.sqlite.close();
});
test('invalid schema is 400, malformed JSON is 400, operational failures are 503',()=>{
 assert.equal(runSchema.safeParse({...input(crypto.randomUUID()),runId:'not-id'}).success,false);
 const dup=input(crypto.randomUUID());dup.lessons.push(dup.lessons[0]);assert.equal(runSchema.safeParse(dup).success,false);
 assert.equal(apiFailure(new SyntaxError(),'Failure').status,400);
 assert.equal(apiFailure(new ApiError(409,'Conflict'),'Failure').status,409);
 const original=console.error;console.error=()=>{};try{assert.equal(apiFailure(new Error('DB down'),'Failure').status,503);}finally{console.error=original;}
});
