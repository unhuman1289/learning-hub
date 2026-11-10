import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isBerlinPlanTime} from '../lib/plan-schedule.mjs';
import {memoryDb} from './d1-adapter.mjs';
import {enqueue,queueDaily} from '../lib/ai-jobs/queue.ts';
test('automatic plan selects Berlin midnight across DST and rejects neighbouring hours',()=>{
 for(const stamp of ['2026-01-14T23:00:00Z','2026-07-14T22:00:00Z','2026-03-28T23:00:00Z','2026-03-29T22:00:00Z','2026-10-24T22:00:00Z','2026-10-25T23:00:00Z']){
  assert(isBerlinPlanTime(stamp));assert(!isBerlinPlanTime(new Date(Date.parse(stamp)+3600000)));assert(!isBerlinPlanTime(new Date(Date.parse(stamp)-3600000)));
 }
 assert(!isBerlinPlanTime('invalid'));assert(!isBerlinPlanTime('2026-07-14T22:01:00Z'));
});
test('different daily checks on the same Berlin day create distinct jobs; retry of one check is idempotent',async()=>{
 const db=memoryDb(),input={learnerId:'owner',subjectId:'de',kind:'plan',purpose:'daily'},now=new Date('2026-10-14T12:00:00Z');
 const a=await enqueue(db,{},input,now),replay=await enqueue(db,{},input,now),b=await enqueue(db,{},input,new Date(+now+1000));
 assert.equal(a.id,replay.id);assert.notEqual(a.id,b.id);assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM ai_jobs').get().n,2);db.sqlite.close();
});
test('automatic queue preserves notebook scope and deduplicates redelivery of the same scheduler invocation',async()=>{
 const db=memoryDb();db.sqlite.prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at,status,role) VALUES('owner','unhuman','qa@example.test',1,1,1,'active','learner')").run();
 db.sqlite.prepare("INSERT INTO subjects(id,learner_id,title,template,status,ai_enabled,created_by,created_at,updated_at) VALUES('de','owner','Deutsch','skill','active',1,'owner','t','t')").run();
 const at=new Date('2026-10-14T22:00:00Z');await queueDaily(db,{},at);await queueDaily(db,{},at);
 const rows=db.sqlite.prepare('SELECT subject_id,learning_day,expires_at FROM ai_jobs').all();assert.equal(rows.length,1);assert.equal(rows[0].subject_id,'de');assert.equal(rows[0].learning_day,'2026-10-15');assert.equal(rows[0].expires_at,'2026-10-15T22:00:00.000Z');db.sqlite.close();
});
