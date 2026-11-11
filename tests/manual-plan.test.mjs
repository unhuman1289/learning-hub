import {test} from 'node:test';
import assert from 'node:assert/strict';
import {memoryDb} from './d1-adapter.mjs';
import {createManualPlan,readManualPlan} from '../lib/ai-jobs/manual-plan.ts';
const first='11111111-1111-4111-8111-111111111111',second='22222222-2222-4222-8222-222222222222';
function seed(db,id,owner,title='Deutsch',status='active',enabled=1){db.sqlite.prepare("INSERT INTO subjects(id,learner_id,title,template,status,ai_enabled,created_by,created_at,updated_at,legacy_track) VALUES(?,?,?,'skill',?,?,?,'t','t',?)").run(id,owner,title,status,enabled,owner,title);}
test('manual plans select learner notebook, allow multiple same-day runs and reuse the same request after midnight or archive',async()=>{
 const db=memoryDb();seed(db,'de','owner');seed(db,'other','someone');seed(db,'archived','owner','AI','archived',0);
 const now=new Date('2026-10-14T12:00:00Z'),a=await createManualPlan(db,{},'owner',first,undefined,now),b=await createManualPlan(db,{},'owner',second,undefined,now);
 assert.notEqual(a.id,b.id);assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM ai_jobs WHERE subject_id=\'de\'').get().n,2);
 db.sqlite.prepare("UPDATE subjects SET status='archived',ai_enabled=0 WHERE id='de'").run();
 assert.equal((await createManualPlan(db,{},'owner',first,undefined,new Date('2026-10-15T12:00:00Z'))).id,a.id);
 assert.equal((await readManualPlan(db,'owner',first)).id,a.id);assert.equal(await readManualPlan(db,'someone',first),null);
 await assert.rejects(createManualPlan(db,{},'owner','invalid'),e=>e.status===400);
 db.sqlite.close();
});
test('manual plans reject foreign/archived notebooks and require a selection for ambiguous shelves',async()=>{
 const db=memoryDb();seed(db,'de','owner');seed(db,'ai','owner','AI');seed(db,'other','someone');seed(db,'archived','owner','MTB','archived',0);
 await assert.rejects(createManualPlan(db,{},'owner',first),e=>e.status===400);
 for(const id of ['other','archived'])await assert.rejects(createManualPlan(db,{},'owner',first,id),e=>e.status===404);
 assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM ai_jobs').get().n,0);
 const a=await createManualPlan(db,{},'owner',first,'de');assert(a.id);db.sqlite.close();
});

test('saved manual daily immediately dispatches its job; a failed dispatch keeps the same queued job for recovery',async()=>{
 const db=memoryDb();seed(db,'de','owner');const ids=[];
 const bindings={EVENT_DISPATCHER:{async dispatch(id){ids.push(id);throw Error('unavailable');}}};
 const a=await createManualPlan(db,bindings,'owner',first);assert.deepEqual(ids,[a.id]);
 assert.equal((await readManualPlan(db,'owner',first)).status,'queued');
 assert.equal((await createManualPlan(db,bindings,'owner',first)).id,a.id);assert.equal(ids.length,1);
 assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM ai_jobs').get().n,1);db.sqlite.close();
});
