import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { memoryDb } from './d1-adapter.mjs';
import { insertLessonV2 } from '../lib/lesson-v2/store.ts';
import { openTutorTurn } from '../lib/tutor/service.ts';

const bundled = await build({ entryPoints:['build/tutor-relay.ts'], bundle:true, write:false, platform:'node', format:'esm',
  plugins:[{name:'durable-object-stub',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'mock',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export class DurableObject { constructor(ctx,env){this.ctx=ctx;this.env=env} }'}));}}] });
const {TutorRelay} = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const NativeResponse = globalThis.Response;
class Socket {
  readyState = 1; sent = []; attachment = null;
  send(value) { this.sent.push(JSON.parse(value)); }
  close() { this.readyState = 3; }
  serializeAttachment(value) { this.attachment = value; }
  deserializeAttachment() { return this.attachment; }
}
globalThis.WebSocket = Object.assign(class {}, {OPEN:1});
globalThis.WebSocketPair = class { constructor(){this[0]=new Socket();this[1]=new Socket();} };
globalThis.WebSocketRequestResponsePair = class {};
globalThis.Response = class extends NativeResponse { constructor(body, init) { if (init?.status===101) { super(null,{status:200}); this.socket=init.webSocket; } else super(body,init); } };

async function setup(t) {
  const db=memoryDb(); t.after(()=>db.sqlite.close());
  db.sqlite.exec(`INSERT INTO user(id,name,email,email_verified,created_at,updated_at,role,status) VALUES('child','Private Name','p@example.test',1,1,1,'learner','active');
    INSERT INTO learner_settings(user_id,updated,role,display_name) VALUES('child','t','child','Ếch');
    INSERT INTO subjects(id,learner_id,title,template,status,created_by,created_at,updated_at) VALUES('sub_aaaaaaaaaaaaaaaaaaaa','child','Deutsch','skill','active','child','t','t');`);
  const lesson=JSON.parse(readFileSync(new URL('../fixtures/contracts/lesson-v2/deutsch-modalverb.json',import.meta.url)));
  const lessonId=await insertLessonV2(db,{learnerId:'child',subjectId:'sub_aaaaaaaaaaaaaaaaaaaa',day:'2026-11-17',lesson});
  const state={sockets:[],pending:[],getWebSockets(){return this.sockets;},acceptWebSocket(socket){this.sockets.push(socket);},setWebSocketAutoResponse(){},waitUntil(p){this.pending.push(p);}};
  const relay=new TutorRelay(state,{DB:db});
  const connect=async learners=>{await relay.fetch(new Request('https://internal/connect',{headers:{Upgrade:'websocket','X-Tutor-Session':JSON.stringify({learners})}}));await Promise.all(state.pending.splice(0));return state.sockets.at(-1);};
  const create=async (question='Gợi ý?')=>openTutorTurn(db,'child',{lessonId,itemId:'i1',question},false);
  const submit=async id=>relay.fetch(new Request('https://internal/submit',{method:'POST',body:JSON.stringify({id})}));
  const flush=()=>relay.operations;
  return {db,lesson,relay,connect,create,submit,flush};
}

test('fake runner streams separate deltas and saves the answer, with scoped and redacted context', async t=>{
  const {db,lesson,relay,connect,create,submit,flush}=await setup(t);
  const sock=await connect(['child']);
  const turn=await create('Liên hệ test@example.test');
  db.sqlite.prepare('UPDATE learning_lessons SET draft=?').run(JSON.stringify({i1:{answer:'nháp +49 451 1234567'},i2:{answer:'OTHER-DRAFT'}}));
  const response=await submit(turn.id); const reader=response.body.getReader();
  await flush(); const ask=sock.sent.at(-1);
  assert.equal(ask.type,'ask'); assert.equal(ask.turnId,turn.id);
  assert.equal(ask.context.nickname,'Ếch'); assert.match(ask.context.question,/\[email redacted\]/); assert.match(ask.context.draft,/\[phone redacted\]/);
  assert.equal(ask.context.prompt,lesson.items[0].prompt);
  const context=JSON.stringify(ask.context); assert.doesNotMatch(context,/OTHER-DRAFT|errorLabel|"correct"|"solution"|"key"|Private Name/);
  assert.match(new TextDecoder().decode((await reader.read()).value),/event: turn/);
  relay.webSocketMessage(sock,JSON.stringify({type:'delta',turnId:turn.id,text:'Thử '})); await flush();
  assert.match(new TextDecoder().decode((await reader.read()).value),/Thử/);
  relay.webSocketMessage(sock,JSON.stringify({type:'delta',turnId:turn.id,text:'nhé.'})); await flush();
  assert.match(new TextDecoder().decode((await reader.read()).value),/nhé/);
  relay.webSocketMessage(sock,JSON.stringify({type:'done',turnId:turn.id})); await flush();
  assert.match(new TextDecoder().decode((await reader.read()).value),/event: done/);
  assert.equal(db.sqlite.prepare('SELECT answer,status FROM tutor_turns WHERE id=?').get(turn.id).answer,'Thử nhé.');
  assert.equal(db.sqlite.prepare('SELECT status FROM tutor_turns WHERE id=?').get(turn.id).status,'answered');
});

test('queued turns wait for an authorized runner and recover after disconnection', async t=>{
  const {db,relay,connect,create,submit,flush}=await setup(t);
  const turn=await create(); assert.equal((await submit(turn.id)).status,202);
  const outsider=await connect(['someone-else']); assert.equal(outsider.sent.length,0);
  const runner=await connect(['child']); assert.equal(runner.sent[0].turnId,turn.id);
  relay.webSocketClose(runner); runner.close(); await flush();
  assert.equal(db.sqlite.prepare('SELECT status FROM tutor_turns WHERE id=?').get(turn.id).status,'queued');
  const again=await connect(['child']); assert.equal(again.sent[0].turnId,turn.id);
  relay.webSocketMessage(runner,JSON.stringify({type:'done',turnId:turn.id})); await flush();
  relay.webSocketMessage(again,JSON.stringify({type:'delta',turnId:turn.id,text:'Gợi ý.'}));
  relay.webSocketMessage(again,JSON.stringify({type:'done',turnId:turn.id})); await flush();
  assert.equal(db.sqlite.prepare('SELECT status FROM tutor_turns WHERE id=?').get(turn.id).status,'answered');
});

test('first token timeout queues the turn and ignores late chunks', {timeout:13000}, async t=>{
  const {db,relay,connect,create,submit,flush}=await setup(t);
  const runner=await connect(['child']); const turn=await create(); const response=await submit(turn.id); const reader=response.body.getReader();
  await flush(); await reader.read(); const timeout=await reader.read();
  assert.match(new TextDecoder().decode(timeout.value),/Gia sư đang bận/);
  relay.webSocketMessage(runner,JSON.stringify({type:'delta',turnId:turn.id,text:'late'})); await flush();
  assert.equal(db.sqlite.prepare('SELECT status FROM tutor_turns WHERE id=?').get(turn.id).status,'queued');
});

test('a submit racing recovery attaches to its in-flight stream without dispatching twice', async t=>{
  const {db,relay,connect,create,submit,flush}=await setup(t);
  const turn=await create(); const runner=await connect(['child']);
  relay.webSocketMessage(runner,JSON.stringify({type:'delta',turnId:turn.id,text:'Gợi ý '})); await flush();
  const response=await submit(turn.id); const reader=response.body.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value),/event: turn/);
  assert.match(new TextDecoder().decode((await reader.read()).value),/Gợi ý/);
  relay.webSocketMessage(runner,JSON.stringify({type:'delta',turnId:turn.id,text:'tiếp.'}));
  relay.webSocketMessage(runner,JSON.stringify({type:'done',turnId:turn.id})); await flush();
  assert.match(new TextDecoder().decode((await reader.read()).value),/tiếp/);
  assert.match(new TextDecoder().decode((await reader.read()).value),/event: done/);
  assert.equal(runner.sent.length,1);
  assert.equal(db.sqlite.prepare('SELECT answer FROM tutor_turns WHERE id=?').get(turn.id).answer,'Gợi ý tiếp.');
  assert.match(await (await submit(turn.id)).text(),/event: done/);
});
