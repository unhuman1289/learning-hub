import {test} from 'node:test';
import assert from 'node:assert/strict';
import {memoryDb} from './d1-adapter.mjs';
import {startRun,commitRun,readRunJournal,failRun} from '../lib/run-journal.ts';
import {runSchema} from '../lib/run-schema.ts';
import {createBackup} from '../lib/backup-store.ts';
import {buildRestoreSql} from '../lib/backup-contract.mjs';
import {apiFailure,ApiError} from '../lib/api-error.ts';
const content={title:'Bài mới',objective:'Kiểm chứng',minutes:30,level:'A2',sections:[{heading:'Khái niệm',text:'Nội dung'},{heading:'Ví dụ',text:'Ví dụ'}],diagram:'',exercise:'Thử',questions:[{question:'Một',answer:'A'},{question:'Hai',answer:'B'}],deliverable:'Email',sources:[{title:'Nguồn',url:'https://example.org',readScope:'Một phần',retrievedAt:'2026-10-08T01:00:00.000Z',publishedAt:null}],nextTopic:'Kế tiếp'};
function seed(db){
 for(const track of ['Deutsch','Cardio']){
  db.sqlite.prepare("INSERT INTO learning_lessons VALUES(?,?,?,'2026-10-07',?,?,'2026-10-07T20:00:00.000Z')").run('old-'+track,track,JSON.stringify(content),track==='Deutsch'?'2026-10-07T21:00:00.000Z':null,"Câu trả lời ' riêng");
  db.sqlite.prepare('INSERT INTO learning_slots VALUES(?,?,0)').run(track,'old-'+track);
 }
}
const now=new Date('2026-10-08T01:00:01Z');
const input=runId=>runSchema.parse({runId,runDate:'2026-10-08',summary:'Kiểm tra',lessons:[{track:'Deutsch',expectedId:'old-Deutsch',content},{track:'Cardio',expectedId:'old-Cardio',content}]});
test('separate attempts append runs; guarded writer records every track and keeps old answers',async()=>{
 const db=memoryDb();seed(db);
 const id=await startRun(db,'scheduled',now);let result=await commitRun(db,input(id),now);
 assert.equal(result.runs[0].status,'finished');assert.equal(result.runs[0].items.length,5);
 assert.equal(result.runs[0].items.find(i=>i.track==='Deutsch').outcome,'updated');
 assert.equal(result.runs[0].items.find(i=>i.track==='Cardio').outcome,'kept');
 assert.match(result.runs[0].items.find(i=>i.track==='Cardio').reason,/chưa hoàn thành/);
 assert.equal(db.sqlite.prepare("SELECT response FROM learning_lessons WHERE id='old-Deutsch'").get().response,"Câu trả lời ' riêng");
 const before=db.sqlite.prepare('SELECT COUNT(*) n FROM learning_lessons').get().n;
 result=await commitRun(db,input(id),now);assert.equal(result.replayed,true);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM runs').get().n,1);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM learning_lessons').get().n,before);
 await assert.rejects(commitRun(db,{...input(id),summary:'Khác'},now),e=>e.status===409);
 const second=await startRun(db,'scheduled',now);result=await commitRun(db,input(second),now);
 assert.equal(result.runs.length,2);
 assert.equal(result.runs.find(r=>r.id===second).items.find(i=>i.track==='Deutsch').outcome,'kept');
 db.sqlite.close();
});
test('readback never starts a run; timeout >2h and absence >26h warn without altering lessons',async()=>{
 const db=memoryDb();seed(db);const id=await startRun(db,'scheduled',now);
 let result=await readRunJournal(db,new Date('2026-10-08T03:00:02Z'));
 assert.equal(result.runs[0].status,'failed');assert.equal(result.health.stalledRunId,id);assert.equal(result.health.stale,true);
 assert.equal(db.sqlite.prepare('SELECT status FROM runs').get().status,'started');
 await assert.rejects(commitRun(db,input(id),new Date('2026-10-08T03:00:02Z')),e=>e.status===409);
 await failRun(db,id,'Không đọc được nguồn',now);
 const next=await startRun(db,'scheduled',now);await commitRun(db,{...input(next),lessons:[]},now);
 result=await readRunJournal(db,new Date(now.getTime()+26*3600000));assert.equal(result.health.stale,false);
 result=await readRunJournal(db,new Date(now.getTime()+26*3600000+1));assert.equal(result.health.stale,true);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM runs').get().n,2);db.sqlite.close();
});
test('source issues record failed run; no proposals retain unfinished track with reason',async()=>{
 const db=memoryDb();seed(db);const id=await startRun(db,'scheduled',now);
 const result=await commitRun(db,runSchema.parse({runId:id,runDate:'2026-10-08',summary:'Nguồn không truy cập được',lessons:[],issues:[{track:'Deutsch',reason:'Không mở được nguồn'}]}),now);
 assert.equal(result.runs[0].status,'failed');assert.equal(result.health.latestFailed,true);
 assert.equal(result.runs[0].items.find(i=>i.track==='Deutsch').outcome,'error');
 assert.equal(result.runs[0].items.find(i=>i.track==='Cardio').outcome,'kept');
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM learning_lessons').get().n,2);db.sqlite.close();
});
test('all assignment and journal writes rollback together on database failure',async()=>{
 const db=memoryDb();seed(db);const id=await startRun(db,'scheduled',now);
 db.sqlite.exec("CREATE TRIGGER reject_finish BEFORE UPDATE ON runs WHEN NEW.status='finished' BEGIN SELECT RAISE(ABORT,'simulated failure'); END;");
 await assert.rejects(commitRun(db,input(id),now));
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM learning_lessons').get().n,2);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM run_items').get().n,0);
 assert.equal(db.sqlite.prepare('SELECT status FROM runs').get().status,'started');db.sqlite.close();
});
test('backup restores every table and Unicode/quotes into empty migrated SQLite; rejects missing relationships',async()=>{
 const db=memoryDb();seed(db);const id=await startRun(db,'manual',now);await commitRun(db,input(id),now);
 db.sqlite.prepare('INSERT INTO learning_workspace VALUES(?,?,2,?)').run('__shared_family_workspace__',JSON.stringify({notes:["Ghi chú ' tiếng Việt"]}),now.toISOString());
 const backup=await createBackup(db,'user-private',now);assert.equal(backup.format,2);
 const copy=memoryDb();copy.sqlite.exec(buildRestoreSql(backup));
 for(const [table,expected]of Object.entries(backup.tables))assert.deepEqual(copy.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),expected,table);
 assert.throws(()=>copy.sqlite.exec(buildRestoreSql(backup)),/UNIQUE/);
 assert.throws(()=>buildRestoreSql({...backup,tables:{...backup.tables,learning_lessons:[]}}),/missing lessons/);
 copy.sqlite.close();db.sqlite.close();
});
test('invalid schema is 400, malformed JSON is 400, operational failures are 503',()=>{
 assert.equal(runSchema.safeParse({...input(crypto.randomUUID()),runId:'not-id'}).success,false);
 const dup=input(crypto.randomUUID());dup.lessons.push(dup.lessons[0]);assert.equal(runSchema.safeParse(dup).success,false);
 assert.equal(apiFailure(new SyntaxError(),'Failure').status,400);
 assert.equal(apiFailure(new ApiError(409,'Conflict'),'Failure').status,409);
 const original=console.error;console.error=()=>{};try{assert.equal(apiFailure(new Error('DB down'),'Failure').status,503);}finally{console.error=original;}
});
