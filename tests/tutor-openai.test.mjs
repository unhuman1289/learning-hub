import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { memoryDb } from './d1-adapter.mjs';
import { insertLessonV2 } from '../lib/lesson-v2/store.ts';
import { openTutorTurn } from '../lib/tutor/service.ts';
import { answerTutor, tutorEligible, TUTOR_BUSY } from '../lib/tutor/openai.ts';
import { fakeTutorOpenAi } from '../lib/tutor/fake-openai.ts';
import { consumeOpenAi, redispatchOpenAi } from '../build/openai-queue.ts';
const fixture=JSON.parse(readFileSync(new URL('../fixtures/contracts/lesson-v2/deutsch-modalverb.json',import.meta.url)));
const subject='sub_aaaaaaaaaaaaaaaaaaaa';
async function setup(t) {
  const db=memoryDb(); t.after(()=>db.sqlite.close());
  db.sqlite.exec(`INSERT INTO user(id,name,email,email_verified,created_at,updated_at,role,status) VALUES('u','Private Name','private@example.test',1,1,1,'learner','active');
    INSERT INTO learner_settings(user_id,updated,role,display_name) VALUES('u','t','child','Ếch');
    INSERT INTO subjects(id,learner_id,title,template,status,created_by,created_at,updated_at) VALUES('${subject}','u','Deutsch','skill','active','u','t','t');`);
  const lessonId=await insertLessonV2(db,{learnerId:'u',subjectId:subject,day:'2026-11-17',lesson:fixture});
  const env={OPENAI_ENABLED:'true',ENVIRONMENT:'staging',OPENAI_SUBJECT_IDS:subject,OPENAI_API_KEY:'fake'};
  const create=(now=new Date())=>openTutorTurn(db,'u',{lessonId,itemId:'i1',question:'test@example.test'},false,now);
  return {db,lessonId,env,create};
}

test('streamed Luna request sends only the current exercise and saves tokens before done',async t=>{
  const {db,env,create}=await setup(t); const turn=await create();
  db.sqlite.prepare('UPDATE learning_lessons SET draft=?').run(JSON.stringify({i1:{answer:'draft'},i2:{answer:'SECRET-OTHER'}}));
  let request; const events=[];
  const result=await answerTutor(db,env,turn.id,'system', (type,data)=>events.push({type,data}), async (url,options)=>{
    request={url,...JSON.parse(options.body)}; return fakeTutorOpenAi();
  });
  assert.equal(result,'answered'); assert.equal(request.model,'gpt-6-luna'); assert.equal(request.stream,true); assert.equal(request.store,false);
  assert.equal(request.input.includes('SECRET-OTHER'),false); assert.equal(request.input.includes('Private Name'),false); assert.equal(request.input.includes('private@example.test'),false);
  const input=JSON.parse(request.input); assert.equal(input.nickname,'Ếch'); assert.equal(input.draft,'draft'); assert.match(input.question,/email redacted/);
  assert.equal('key' in input,false); assert.equal('solution' in input,false);
  assert.deepEqual(events.map(x=>x.type),['turn','delta','delta','done']);
  const row=db.sqlite.prepare('SELECT status,answer,input_tokens,output_tokens,first_token_ms FROM tutor_turns WHERE id=?').get(turn.id);
  assert.equal(row.status,'answered'); assert.equal(row.input_tokens,12); assert.equal(row.output_tokens,8); assert.ok(row.first_token_ms>=0);
});

test('timeout queues and duplicate delivery cannot duplicate a completed answer',async t=>{
  const {db,env,create}=await setup(t); const turn=await create(); const events=[];
  const timeout=(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('timeout'))));
  assert.equal(await answerTutor(db,env,turn.id,'', (type,data)=>events.push({type,data}),timeout,20),'queued');
  assert.equal(events.at(-1).data.message,TUTOR_BUSY);
  assert.equal(db.sqlite.prepare('SELECT status FROM tutor_turns WHERE id=?').get(turn.id).status,'queued');
  const msg={body:{tutorTurnId:turn.id},ack(){this.acked=true},retry(){this.retried=true}};
  await consumeOpenAi({messages:[msg]}, {...env,DB:db},()=>'',fakeTutorOpenAi,'prompt');
  assert.equal(msg.acked,true);
  const replay={...msg,acked:false};
  await consumeOpenAi({messages:[replay]}, {...env,DB:db},()=>'',()=>assert.fail('must not call model twice'),'prompt');
  assert.equal(db.sqlite.prepare('SELECT status FROM tutor_turns WHERE id=?').get(turn.id).status,'answered');
});

test('submission or admin disable while generating cannot write an answer',async t=>{
  const {db,env,create,lessonId}=await setup(t);const turn=await create();
  const events=[];const fetcher=async()=>{db.sqlite.prepare("UPDATE learning_lessons SET completed_at='done' WHERE id=?").run(lessonId);return fakeTutorOpenAi();};
  assert.equal(await answerTutor(db,env,turn.id,'',(type)=>events.push(type),fetcher),'ineligible');
  assert.equal(db.sqlite.prepare('SELECT status FROM tutor_turns WHERE id=?').get(turn.id).status,'blocked');
  assert.equal(events.includes('done'),false);
});

test('staging permits children in enabled notebooks and respects the switch',async t=>{
  const {db,env,create}=await setup(t);const turn=await create();
  assert.equal(await tutorEligible(db,turn.id,env),true);
  db.sqlite.prepare("UPDATE learner_settings SET role='child'").run();
  assert.equal(await tutorEligible(db,turn.id,env),true);
  assert.equal(await tutorEligible(db,turn.id,{...env,ENVIRONMENT:'local',APP_ENV:'local'}),true);
  db.sqlite.prepare("UPDATE learner_settings SET role='adult'").run();
  assert.equal(await tutorEligible(db,turn.id,{...env,OPENAI_ENABLED:'false'}),false);
});

test('sixty turns are counted per Berlin day across lessons, including DST',async t=>{
  const {db,lessonId}=await setup(t);
  const insert=db.sqlite.prepare("INSERT INTO tutor_turns(id,lesson_id,item_id,learner_id,question,status,created_at) VALUES(?,?,'i1','u','q','answered',?)");
  const lessons=[];for(let n=0;n<3;n++) lessons.push(await insertLessonV2(db,{learnerId:'u',subjectId:subject,day:`2026-10-${20+n}`,lesson:fixture}));
  for(let n=0;n<60;n++) insert.run('old'+n,lessons[Math.floor(n/20)],'2026-10-25T00:30:00.000Z');
  await assert.rejects(openTutorTurn(db,'u',{lessonId,itemId:'i1',question:'q'},false,new Date('2026-10-25T22:30:00Z')),{status:409});
  const allowed=await openTutorTurn(db,'u',{lessonId,itemId:'i1',question:'q'},false,new Date('2026-10-25T23:00:00Z'));
  assert.equal(allowed.status,'queued');
});

test('concurrent immediate and recovery attempts have one model call and one saved result',async t=>{
  const {db,env,create}=await setup(t); const turn=await create();
  let release; const gate=new Promise(resolve=>{release=resolve}); let calls=0;
  const fetcher=async()=>{calls++;await gate;return fakeTutorOpenAi();};
  const first=answerTutor(db,env,turn.id,'',()=>{},fetcher);
  while(calls===0) await new Promise(resolve=>setTimeout(resolve,1));
  const second=await answerTutor(db,env,turn.id,'',()=>{},fetcher);
  assert.equal(second,'claimed');release();assert.equal(await first,'answered');assert.equal(calls,1);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM tutor_turns WHERE status=\'answered\'').get().n,1);
});

test('admin disabling tutor during the response prevents saving',async t=>{
  const {db,env,create}=await setup(t); const turn=await create();
  const fetcher=async()=>{db.sqlite.prepare('UPDATE learner_settings SET tutor_enabled=0').run();return fakeTutorOpenAi();};
  assert.equal(await answerTutor(db,env,turn.id,'',()=>{},fetcher),'ineligible');
  assert.equal(db.sqlite.prepare('SELECT status FROM tutor_turns WHERE id=?').get(turn.id).status,'blocked');
});

test('queue retries an upstream failure without treating it as a saved answer',async t=>{
  const {db,env,create}=await setup(t); const turn=await create();
  const msg={body:{tutorTurnId:turn.id},ack(){this.acked=true},retry(){this.retried=true}};
  await consumeOpenAi({messages:[msg]}, {...env,DB:db},()=>'',async()=>new Response(null,{status:503}),'prompt');
  assert.equal(msg.retried,true); assert.notEqual(msg.acked,true);
  assert.equal(db.sqlite.prepare('SELECT status FROM tutor_turns WHERE id=?').get(turn.id).status,'queued');
});

test('replayed tutor deliveries stop after two actual calls',async t=>{
  const {db,env,create}=await setup(t);const turn=await create();let calls=0;
  const fail=async()=>{calls++;return new Response(null,{status:503});};
  const message=()=>({body:{tutorTurnId:turn.id},ack(){this.acked=true},retry(){this.retried=true}});
  const first=message(), second=message(), third=message();
  for(const m of [first,second,third]) await consumeOpenAi({messages:[m]},{...env,DB:db},()=>'',fail,'prompt');
  assert.equal(calls,2);assert.equal(second.acked,true);assert.equal(third.acked,true);
  assert.deepEqual({...db.sqlite.prepare('SELECT status,openai_calls FROM tutor_turns WHERE id=?').get(turn.id)},{status:'failed',openai_calls:2});
});

test('queued child tutor turn is redispatched while its notebook is enabled',async t=>{
  const {db,env,create}=await setup(t); const turn=await create(new Date('2026-11-17T10:00:00Z'));
  const sent=[]; const dispatchEnv={...env,DB:db,AI_QUEUE:{send:async body=>sent.push(body)}};
  await redispatchOpenAi(dispatchEnv,new Date('2026-11-17T10:03:00Z'));
  assert.deepEqual(sent,[{tutorTurnId:turn.id}]);
  db.sqlite.prepare("INSERT INTO ai_subject_controls(subject_id,openai_enabled,tts_enabled,updated_by,updated_at) VALUES(?,0,1,'admin','t')").run(subject);
  sent.length=0; await redispatchOpenAi(dispatchEnv,new Date('2026-11-17T10:04:00Z'));
  assert.deepEqual(sent,[]);
});

test('disabling notebook AI while a child receives an answer prevents saving',async t=>{
  const {db,env,create}=await setup(t); const turn=await create();
  const fetcher=async()=>{db.sqlite.prepare("INSERT INTO ai_subject_controls(subject_id,openai_enabled,tts_enabled,updated_by,updated_at) VALUES(?,0,1,'admin','t')").run(subject);return fakeTutorOpenAi();};
  assert.equal(await answerTutor(db,env,turn.id,'',()=>{},fetcher),'ineligible');
  assert.equal(db.sqlite.prepare('SELECT status FROM tutor_turns WHERE id=?').get(turn.id).status,'blocked');
});

test('adult and child Responses payloads include nickname but not account name or profile id',async t=>{
  for(const role of ['adult','child']) {
    await t.test(role,async t=>{
      const db=memoryDb();t.after(()=>db.sqlite.close());
      const profile='private-profile-unique-89214', name='Private Legalname Unique', nickname='Ếch';
      db.sqlite.prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at,role,status) VALUES(?,?,?,1,1,1,'learner','active')").run(profile,name,'private@example.test');
      db.sqlite.prepare("INSERT INTO learner_settings(user_id,updated,role,display_name) VALUES(?,'t',?,?)").run(profile,role,nickname);
      db.sqlite.prepare("INSERT INTO subjects(id,learner_id,title,template,status,created_by,created_at,updated_at) VALUES(?,?,'Deutsch','skill','active',?,'t','t')").run(subject,profile,profile);
      const lessonId=await insertLessonV2(db,{learnerId:profile,subjectId:subject,day:'2026-11-17',lesson:fixture});
      const turn=await openTutorTurn(db,profile,{lessonId,itemId:'i1',question:'Gợi ý cách bắt đầu?'},false);
      let sent;
      const result=await answerTutor(db,{OPENAI_ENABLED:'true',ENVIRONMENT:'staging',OPENAI_API_KEY:'fake'},turn.id,'prompt',()=>{},async (_url,options)=>{sent=JSON.parse(options.body);return fakeTutorOpenAi();});
      assert.equal(result,'answered');assert.equal(JSON.parse(sent.input).nickname,nickname);
      const payload=JSON.stringify(sent);assert.equal(payload.includes(profile),false);assert.equal(payload.includes(name),false);assert.equal(payload.includes('private@example.test'),false);
    });
  }
});

test('first-token timing log contains only durations and the opaque turn id',async t=>{
  const {db,env,create}=await setup(t);const turn=await create();const logs=[];const old=console.info;
  console.info=value=>logs.push(JSON.parse(value));
  try {assert.equal(await answerTutor(db,env,turn.id,'secret prompt',()=>{},fakeTutorOpenAi),'answered');} finally {console.info=old;}
  const entry=logs.find(x=>x.component==='tutor-timing');assert.equal(entry.turnId,turn.id);
  for(const key of ['pre_answer_ms','eligibility_ms','recovery_ms','context_ms','claim_ms','recheck_ms','count_ms','openai_first_ms','first_token_ms']) assert.ok(Number.isFinite(entry[key]) && entry[key]>=0,key);
  assert.doesNotMatch(JSON.stringify(entry),/secret prompt|Private Name|private@example\.test|Ếch/);
});

test('eligibility uses one read and respects the global and per-notebook AI switches',async t=>{
  const {db,env,create}=await setup(t);const turn=await create();let statements=0;
  const tracked={...db,prepare(sql){statements++;return db.prepare(sql)}};
  assert.equal(await tutorEligible(tracked,turn.id,env),true);assert.equal(statements,1);
  db.sqlite.prepare("INSERT INTO ai_subject_controls(subject_id,openai_enabled,tts_enabled,updated_by,updated_at) VALUES(?,0,1,'admin','t')").run(subject);
  statements=0;assert.equal(await tutorEligible(tracked,turn.id,env),false);assert.equal(statements,1);
  statements=0;assert.equal(await tutorEligible(tracked,turn.id,{...env,OPENAI_ENABLED:'false'}),false);assert.equal(statements,0);
});
