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

test('streamed request sends the lesson without nickname and saves tokens before done',async t=>{
  const {db,env,create}=await setup(t); const turn=await create();
  db.sqlite.prepare('UPDATE learning_lessons SET draft=?').run(JSON.stringify({i1:{answer:'draft'},i2:{answer:'SECRET-OTHER'}}));
  let request; const events=[];
  const result=await answerTutor(db,env,turn.id,'system', (type,data)=>events.push({type,data}), async (url,options)=>{
    request={url,...JSON.parse(options.body)}; return fakeTutorOpenAi();
  });
  assert.equal(result,'answered'); assert.equal(request.model,'gpt-6-luna'); assert.equal(request.stream,true); assert.equal(request.store,false);
  assert.equal(request.input.includes('SECRET-OTHER'),true); assert.equal(request.input.includes('Ếch'),false); assert.equal(request.input.includes('Private Name'),false); assert.equal(request.input.includes('private@example.test'),false);
  const input=JSON.parse(request.input); assert.equal(input.nickname,undefined); assert.equal(input.lesson.items[0].answer,'draft'); assert.match(input.question,/email redacted/);
  assert.equal('key' in input,false); assert.equal('solution' in input,false);
  assert.equal(events[0].type,'turn'); assert.equal(events.at(-1).type,'done');
  const row=db.sqlite.prepare('SELECT status,answer,input_tokens,output_tokens,cached_tokens,first_token_ms FROM tutor_turns WHERE id=?').get(turn.id);
  assert.equal(row.status,'answered'); assert.equal(row.input_tokens,12); assert.equal(row.output_tokens,8); assert.equal(row.cached_tokens,5); assert.ok(row.first_token_ms>=0);
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

test('the 80th turn is allowed and the 81st waits for Berlin midnight, including DST',async t=>{
  const {db,lessonId}=await setup(t);
  const insert=db.sqlite.prepare("INSERT INTO tutor_turns(id,lesson_id,item_id,learner_id,question,status,created_at) VALUES(?,?,'i1','u','q','answered',?)");
  for(let n=0;n<79;n++) insert.run('old'+n,lessonId,'2026-10-25T00:30:00.000Z');
  const eightieth=await openTutorTurn(db,'u',{lessonId,itemId:'i1',question:'q'},false,new Date('2026-10-25T22:29:00Z'));
  assert.equal(eightieth.status,'queued');
  db.sqlite.prepare("UPDATE tutor_turns SET status='answered' WHERE id=?").run(eightieth.id);
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

test('adult and child Responses payloads exclude nickname, account name and profile id',async t=>{
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
      assert.equal(result,'answered');assert.equal(JSON.parse(sent.input).nickname,undefined); assert.equal(JSON.stringify(sent).includes(nickname),false);
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

test('answer filtering occurs before SSE and persistence, with a blocked event and flag', async t => {
  const {db,env,create}=await setup(t); const turn=await create();
  const item=JSON.parse(db.sqlite.prepare("SELECT payload FROM lesson_items WHERE item_id='i1'").get().payload);
  item.key={type:'text',accepted:['Guten Tag'],caseSensitive:false}; item.solution='Guten Tag';
  db.sqlite.prepare("UPDATE lesson_items SET payload=? WHERE item_id='i1'").run(JSON.stringify(item));
  const entries=[{type:'response.output_text.delta',delta:'ON_TOPIC\nHãy nghĩ nhé. GUTEN, '},{type:'response.output_text.delta',delta:'tag! Thử lại?'},{type:'response.completed',response:{status:'completed',usage:{input_tokens:1,output_tokens:2}}}];
  const fetcher=async()=>new Response(entries.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''));
  const events=[]; assert.equal(await answerTutor(db,env,turn.id,'',(type,data)=>events.push({type,data}),fetcher),'answered');
  const row=db.sqlite.prepare('SELECT answer,leak_blocked FROM tutor_turns WHERE id=?').get(turn.id);
  assert.equal(row.leak_blocked,1); assert.doesNotMatch(row.answer,/guten/i); assert.match(row.answer,/Chỗ này lộ đáp án/);
  assert.ok(events.some(event=>event.type==='blocked')); assert.doesNotMatch(JSON.stringify(events),/guten/i);
});

test('personalizes a split placeholder before stream and storage without sending the name', async t => {
  const {db,env,create}=await setup(t); const turn=await create(); let request;
  const entries=[{type:'response.output_text.delta',delta:'ON_TOPIC\nCon chào {te'},{type:'response.output_text.delta',delta:'n} ạ! Con giúp nha.'},{type:'response.completed',response:{status:'completed',usage:{input_tokens:1,output_tokens:2}}}];
  const events=[]; const fetcher=async (_url,options)=>{request=options.body;return new Response(entries.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''));};
  assert.equal(await answerTutor(db,env,turn.id,'',(type,data)=>events.push({type,data}),fetcher),'answered');
  assert.doesNotMatch(request,/Ếch/); assert.match(JSON.stringify(events),/Ếch/); assert.doesNotMatch(JSON.stringify(events),/\{ten\}/);
  assert.match(db.sqlite.prepare('SELECT answer FROM tutor_turns WHERE id=?').get(turn.id).answer,/Con chào Ếch/);
});

test('another hidden question is protected and off-topic answers are flagged', async t => {
  const {db,env,create}=await setup(t); const turn=await create();
  const item=JSON.parse(db.sqlite.prepare("SELECT payload FROM lesson_items WHERE item_id='i2'").get().payload);
  item.key={type:'text',accepted:['geheimwort']}; item.solution='geheimwort';
  db.sqlite.prepare("UPDATE lesson_items SET payload=? WHERE item_id='i2'").run(JSON.stringify(item));
  const response=parts=>async()=>new Response([...parts.map(delta=>({type:'response.output_text.delta',delta})),{type:'response.completed',response:{status:'completed',usage:{input_tokens:1,output_tokens:1}}}].map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''));
  assert.equal(await answerTutor(db,env,turn.id,'',()=>{},response(['ON_TOPIC\nCâu 2 là geheimwort.'])),'answered');
  const saved=db.sqlite.prepare('SELECT answer,leak_blocked FROM tutor_turns WHERE id=?').get(turn.id);
  assert.equal(saved.leak_blocked,1); assert.doesNotMatch(saved.answer,/geheimwort/i);
  const next=await create();
  assert.equal(await answerTutor(db,env,next.id,'',()=>{},response(['OFF_','TOPIC\nNội dung không được hiển thị'])),'answered');
  const off=db.sqlite.prepare('SELECT answer,off_topic FROM tutor_turns WHERE id=?').get(next.id);
  assert.equal(off.off_topic,1); assert.match(off.answer,/bài này/); assert.doesNotMatch(off.answer,/không được hiển thị/);
});

test('only an explicitly revealed solution enters model context', async t => {
  const {db,env,create,lessonId}=await setup(t); const turn=await create();
  const item=JSON.parse(db.sqlite.prepare("SELECT payload FROM lesson_items WHERE item_id='i2'").get().payload);
  item.key={type:'text',accepted:['solution-secret']}; item.solution='solution-secret'; item.rubric='private-rubric';
  db.sqlite.prepare("UPDATE lesson_items SET payload=? WHERE item_id='i2'").run(JSON.stringify(item));
  db.sqlite.prepare('UPDATE learning_lessons SET support=? WHERE id=?').run(JSON.stringify({i2:'solution'}),lessonId);
  let request; const fetcher=async(_url,options)=>{request=options.body;return fakeTutorOpenAi();};
  assert.equal(await answerTutor(db,env,turn.id,'',()=>{},fetcher),'answered');
  assert.match(request,/solution-secret/); assert.doesNotMatch(request,/private-rubric/);
});

test('25-item lesson preserves nearby context and bounds the model input',async t=>{
  const {db,lessonId}=await setup(t); const row=db.sqlite.prepare("SELECT * FROM lesson_items WHERE lesson_id=? AND item_id='i1'").get(lessonId);
  db.sqlite.prepare("DELETE FROM lesson_items WHERE lesson_id=? AND item_id NOT IN ('i1','i2')").run(lessonId);
  const columns=Object.keys(row); const insert=db.sqlite.prepare(`INSERT INTO lesson_items (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`);
  for(let n=3;n<=25;n++) {
    const item=JSON.parse(row.payload); item.id=`i${n}`; item.prompt=`Câu ${n}: `+'Từ vựng cần học. '.repeat(300); item.solution=`secret${n}`; item.key={type:'text',accepted:[`secret${n}`]};
    insert.run(...columns.map(column=>column==='item_id'?item.id:column==='payload'?JSON.stringify(item):row[column]));
  }
  const turn=await openTutorTurn(db,'u',{lessonId,itemId:'i3',question:'Gợi ý?'},false); let sent;
  assert.equal(await answerTutor(db,{OPENAI_ENABLED:'true',OPENAI_API_KEY:'fake'},turn.id,'',()=>{},async(_url,options)=>{sent=JSON.parse(options.body);return fakeTutorOpenAi();}),'answered');
  const input=JSON.parse(sent.input); assert.equal(input.lesson.items.length,25); assert.ok(Buffer.byteLength(sent.input)<=5500,`input bytes ${Buffer.byteLength(sent.input)}`);
  assert.equal(input.selectedItem,'i3'); assert.ok(input.lesson.items[2].prompt.length>input.lesson.items[24].prompt.length);
  assert.doesNotMatch(sent.input,/secret(?:3|25)/);
});

test('fake adapter uses Bột’s voice and prompt provides eight examples',async t=>{
 const {db,env,create}=await setup(t); const turn=await create();
 const prompt=readFileSync(new URL('../integrations/runner-prompts/tutor.md',import.meta.url),'utf8');
 assert.equal((prompt.match(/^- Hỏi:/gm) ?? []).length,8);
 assert.equal(await answerTutor(db,env,turn.id,prompt,()=>{},fakeTutorOpenAi),'answered');
 const answer=db.sqlite.prepare('SELECT answer FROM tutor_turns WHERE id=?').get(turn.id).answer;
 assert.match(answer,/\b[Cc]on\b/u); assert.doesNotMatch(answer,/\b(?:mình|bạn|Bột)\b/iu);
 for(const sentence of answer.split(/[.!?]/u)) assert.ok((sentence.match(/ạ/gu)??[]).length<=1);
});

test('T4 questions retain scope, name privacy and useful explanations',async t=>{
  const {db,env,lessonId}=await setup(t);
  const cases=[
    {question:'Câu 5 điền gì',model:'OFF_TOPIC\nKhông liên quan.',expected:/gợi|đọc lại đề/iu},
    {question:'Tôi là ai, tên gì',model:'OFF_TOPIC\nKhông liên quan.',expected:/Ếch/iu},
    {question:'Câu này hiểu như nào, vì sao',model:'ON_TOPIC\nCâu 2 hỏi về động từ. Con giải thích nghĩa đề nha.',expected:/giải thích nghĩa đề/iu},
    {question:'Đáp án là gì',model:'OFF_TOPIC\nKhông liên quan.',expected:/giữ lại đáp án/iu},
    {question:'Giải thích quy tắc trong bài',model:'ON_TOPIC\nCon giải thích cách nghĩ nha.',expected:/giải thích cách nghĩ/iu},
  ];
  for(const {question,model,expected} of cases) {
    const turn=await openTutorTurn(db,'u',{lessonId,itemId:'i2',question},false);
    const entries=[{type:'response.output_text.delta',delta:model},{type:'response.completed',response:{status:'completed',usage:{input_tokens:1,output_tokens:1}}}];let request;
    const result=await answerTutor(db,env,turn.id,'',()=>{},async(_url,options)=>{request=options.body;return new Response(entries.map(entry=>'data: '+JSON.stringify(entry)+'\n\n').join(''));});
    assert.equal(result,'answered',question);const saved=db.sqlite.prepare('SELECT answer,off_topic,leak_blocked FROM tutor_turns WHERE id=?').get(turn.id);
    assert.equal(saved.off_topic,0,question);assert.equal(saved.leak_blocked,0,question);assert.match(saved.answer,expected,question);assert.doesNotMatch(request,/Ếch/);
  }
});

const tutorPrompt = readFileSync(new URL('../integrations/runner-prompts/tutor.md', import.meta.url), 'utf8');
for (const [displayName, self, call, heading] of [
  ['Ếch', 'em', 'chị Ếch', 'Em'],
  ['Ông Thắng', 'cháu', 'ông', 'Cháu'],
  ['unhuman', 'con', 'bố Thạch', 'Con'],
  ['Mai', null, null, 'Con'],
]) test(`tutor substitutes ${heading} locally and never sends the configured address (${displayName})`, async t => {
  const { db, env, create } = await setup(t);
  db.sqlite.prepare('UPDATE learner_settings SET display_name=?, tutor_self=?, tutor_call=?').run(displayName, self, call);
  const turn = await create();
  db.sqlite.prepare('UPDATE tutor_turns SET question=? WHERE id=?').run(`Nhờ ${call ?? displayName} xem giúp ${displayName} trong bài.`, turn.id);
  db.sqlite.prepare('UPDATE learning_lessons SET draft=?').run(JSON.stringify({ i1: { answer: `${displayName} và ${call ?? displayName}` } }));
  let request;
  const result = await answerTutor(db, env, turn.id, tutorPrompt, () => {}, async (_url, options) => {
    request = JSON.parse(options.body);
    const events = [
      { type: 'response.output_text.delta', delta: `ON_TOPIC\n${heading} chào {te` },
      { type: 'response.output_text.delta', delta: 'n} ạ!' },
      { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 1, output_tokens: 1 } } },
    ];
    return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''));
  });
  assert.equal(result, 'answered');
  assert.ok(request.instructions.includes(`Xưng “${self ?? 'con'}”`));
  assert.ok(request.instructions.includes(`${heading} chào {ten} ạ!`));
  assert.doesNotMatch(request.instructions, /\{[xX]ung\}|\{giong\}/u);
  if (self === 'cháu') assert.match(request.instructions, /Lễ phép, điềm đạm/);
  if (self === 'em') assert.match(request.instructions, /Thân mật, vui vẻ/);
  const input = JSON.parse(request.input);
  assert.equal(input.question, 'Nhờ {ten} xem giúp {ten} trong bài.');
  assert.equal(input.lesson.items[0].answer, '{ten} và {ten}');
  assert.equal(db.sqlite.prepare('SELECT answer FROM tutor_turns WHERE id=?').get(turn.id).answer,
    `${heading} chào ${call ?? displayName} ạ!`);
});
