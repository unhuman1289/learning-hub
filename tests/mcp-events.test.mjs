import {test} from 'node:test';import assert from 'node:assert/strict';import {createHmac} from 'node:crypto';
import {memoryDb} from './d1-adapter.mjs';
import {callbackUrl,publicAddress,seal,unseal,signedHeaders,subscribe,unsubscribe,deliverEvents,listEvents,signingBytes,EventValidationError} from '../lib/mcp/events.ts';
import {plannerPrincipal} from '../lib/mcp/service.ts';import {enqueue} from '../lib/ai-jobs/queue.ts';
const now=new Date('2026-10-14T06:00:00Z'),secret='whsec_'+Buffer.alloc(32,7).toString('base64'),callback='https://chatgpt.com/backend-api/events/qa';
function seed(){const db=memoryDb();db.sqlite.prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at,status,role) VALUES('owner','unhuman','qa@example.test',1,1,1,'active','learner')").run();db.sqlite.prepare("INSERT INTO oauthClient(id,clientId,redirectUris,disabled) VALUES('client','chatgpt-events','[]',0)").run();db.sqlite.prepare(`INSERT INTO oauthConsent(id,clientId,userId,scopes,createdAt,updatedAt) VALUES('grant','chatgpt-events','owner','["hub:plan","hub:assess"]',1,1)`).run();db.sqlite.prepare("INSERT INTO subjects(id,learner_id,title,template,status,ai_enabled,created_by,created_at,updated_at) VALUES('de','owner','Deutsch','skill','active',1,'owner','t','t')").run();return {DB:db,BETTER_AUTH_SECRET:'test-auth-secret',MCP_EVENTS_ENABLED:'true',ENVIRONMENT:'staging'};}
function receiver({mismatch=false,status=200,privateDns=false}={}){const calls=[];return {calls,fetcher:async(url,opts)=>{if(url.startsWith('https://cloudflare-dns.com/'))return Response.json({Status:0,Answer:[{type:1,data:privateDns?'127.0.0.1':'104.18.32.7'}]});const data=JSON.parse(opts.body);calls.push({data,opts});return data.type==='verification'?Response.json({challenge:mismatch?'wrong':data.challenge}):new Response('',{status});}};}
const request={name:'learning.job.queued',arguments:{kind:'plan'},delivery:{mode:'webhook',url:callback,secret},cursor:null};
test('callbacks reject arbitrary hosts, local/private IPs, credentials, redirects destinations',()=>{for(const url of ['http://chatgpt.com/events','https://127.0.0.1/a','https://chatgpt.com.evil.test/a','https://evil@chatgpt.com/a','https://api.openai.com:444/a','https://chatgpt.com/a#x'])assert.throws(()=>callbackUrl(url));for(const ip of ['10.1.2.3','127.0.0.1','169.254.1.1','100.64.0.1','::1','::ffff:127.0.0.1','2001:db8::1'])assert(!publicAddress(ip));assert(publicAddress('104.18.32.7'));});
test('signing secret encrypted at rest; HMAC matches Standard Webhooks bytes',async()=>{const sealed=await seal(secret,'key');assert(!sealed.includes(secret));assert.equal(await unseal(sealed,'key'),secret);await assert.rejects(unseal(sealed,'wrong'));const body='{"a":1}';const headers=await signedHeaders(secret,'evt',body,'sub',now);assert.equal(headers['webhook-signature'],'v1,'+createHmac('sha256',Buffer.alloc(32,7)).update('evt.'+Math.floor(now.getTime()/1000)+'.'+body).digest('base64'));});
test('subscribe is verified and idempotent; mismatch cannot activate',async()=>{const env=seed(),client=await plannerPrincipal(env.DB,'owner','chatgpt-events',['hub:plan']),r=receiver();const a=await subscribe(env,client,'owner','chatgpt-events',request,now,r.fetcher),b=await subscribe(env,client,'owner','chatgpt-events',request,now,r.fetcher);assert.equal(a.id,b.id);assert.equal(env.DB.sqlite.prepare('SELECT count(*) AS n FROM mcp_event_subscriptions').get().n,1);const stored=env.DB.sqlite.prepare('SELECT secret_cipher FROM mcp_event_subscriptions').get();assert(!stored.secret_cipher.includes(secret));await assert.rejects(subscribe(env,client,'owner','chatgpt-events',{...request,delivery:{...request.delivery,secret:'whsec_'+Buffer.alloc(32,8).toString('base64')}},now,receiver({mismatch:true}).fetcher));await unsubscribe(env.DB,'other','chatgpt-events',{name:request.name,arguments:request.arguments,delivery:{mode:'webhook',url:callback}});assert.equal(env.DB.sqlite.prepare('SELECT active FROM mcp_event_subscriptions').get().active,1);env.DB.sqlite.close();});
test('private DNS cannot reach callback or create subscription',async()=>{const env=seed(),client=await plannerPrincipal(env.DB,'owner','chatgpt-events'),r=receiver({privateDns:true});await assert.rejects(subscribe(env,client,'owner','chatgpt-events',request,now,r.fetcher));assert.equal(r.calls.length,0);env.DB.sqlite.close();});
test('delivery preserves job and has one stable receipt; no answer data leaks; revoke stops future events',async()=>{const env=seed(),client=await plannerPrincipal(env.DB,'owner','chatgpt-events'),r=receiver();await subscribe(env,client,'owner','chatgpt-events',request,now,r.fetcher);await enqueue(env.DB,{}, {learnerId:'owner',kind:'plan',purpose:'daily',subjectId:'de'},new Date(now.getTime()+1000));assert.equal((await deliverEvents(env,new Date(now.getTime()+2000),r.fetcher)).delivered,1);assert.equal((await deliverEvents(env,new Date(now.getTime()+3000),r.fetcher)).delivered,0);const event=r.calls.find(c=>c.data.eventId);assert.deepEqual(Object.keys(event.data.data),['jobId','kind','subject']);assert.equal(event.opts.redirect,'manual');assert.equal(event.opts.headers.Authorization,undefined);assert.equal(env.DB.sqlite.prepare('SELECT status FROM ai_jobs').get().status,'queued');env.DB.sqlite.prepare('DELETE FROM oauthConsent').run();await deliverEvents(env,new Date(now.getTime()+4000),r.fetcher);assert.equal(env.DB.sqlite.prepare('SELECT active FROM mcp_event_subscriptions').get().active,0);env.DB.sqlite.close();});
test('410 stops a subscription while leaving queued work intact',async()=>{const env=seed(),client=await plannerPrincipal(env.DB,'owner','chatgpt-events'),r=receiver({status:410});await subscribe(env,client,'owner','chatgpt-events',request,now,r.fetcher);await enqueue(env.DB,{}, {learnerId:'owner',kind:'plan',purpose:'daily',subjectId:'de'},new Date(now.getTime()+1000));await deliverEvents(env,new Date(now.getTime()+2000),r.fetcher);assert.equal(env.DB.sqlite.prepare('SELECT active FROM mcp_event_subscriptions').get().active,0);assert.equal(env.DB.sqlite.prepare('SELECT status FROM ai_jobs').get().status,'queued');env.DB.sqlite.close();});
test('events only list for adult unhuman; disabled flag stops delivery in production',async()=>{const env=seed(),client=await plannerPrincipal(env.DB,'owner','chatgpt-events');env.DB.sqlite.prepare("UPDATE user SET name='other'").run();assert.deepEqual(await listEvents(env.DB,client),{events:[]});assert.deepEqual(await deliverEvents({...env,ENVIRONMENT:'production',MCP_EVENTS_ENABLED:'false'},now),{delivered:0});env.DB.sqlite.close();});

import {createMcpHandler,McpServer} from '@modelcontextprotocol/server';
import {registerEvents} from '../lib/mcp/events-register.ts';
test('native MCP 2.0 discovery and event methods work without breaking legacy tools',async()=>{
 const env=seed(),principal=await plannerPrincipal(env.DB,'owner','chatgpt-events');
 const handler=createMcpHandler(()=>{const server=new McpServer({name:'QA',version:'1'});registerEvents(server,env,principal,'owner','chatgpt-events');return server;},{legacy:'stateless'});
 for(const method of ['server/discover','events/list']){
 const response=await handler.fetch(new Request('https://qa.example/mcp',{method:'POST',headers:{'Mcp-Method':method,'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2026-07-28'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:{_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'qa',version:'1'},'io.modelcontextprotocol/clientCapabilities':{}}}})}));
 assert.equal(response.status,200);const data=await response.json();assert.equal(data.result.resultType,'complete');
 if(method==='server/discover'){assert.deepEqual(data.result.capabilities.events,{});assert(data.result.supportedVersions.includes('2026-07-28'));}else assert.equal(data.result.events[0].name,'learning.job.queued');
 }
 env.DB.sqlite.close();
});

test('unsubscribe uses the documented name/arguments/delivery identity and is idempotent',async()=>{const env=seed(),client=await plannerPrincipal(env.DB,'owner','chatgpt-events'),r=receiver();await subscribe(env,client,'owner','chatgpt-events',request,now,r.fetcher);const stop={name:request.name,arguments:request.arguments,delivery:{mode:'webhook',url:callback}};await unsubscribe(env.DB,'owner','chatgpt-events',stop);await unsubscribe(env.DB,'owner','chatgpt-events',stop);assert.equal(env.DB.sqlite.prepare('SELECT active FROM mcp_event_subscriptions').get().active,0);env.DB.sqlite.close();});

import {checked} from '../lib/mcp/events-register.ts';
import {ApiError} from '../lib/api-error.ts';
test('subscribe diagnostics contain only fixed categories and no callback credentials',async()=>{
 const messages=[],original=console.info;console.info=x=>messages.push(x);
 try{await assert.rejects(checked(async()=>{throw new ApiError(400,'Private callback whsec_DO_NOT_LOG');}),e=>e.code===-32602);}
 finally{console.info=original;}
 assert.equal(messages.length,2);assert(messages.every(x=>!x.includes('whsec_')&&!x.includes('Private callback')));assert.equal(JSON.parse(messages[1]).category,'invalid_callback_or_secret');
});

test('requested lifetime can exceed server cap; subscription grants at most requested duration or seven days',async()=>{
 const env=seed(),client=await plannerPrincipal(env.DB,'owner','chatgpt-events'),r=receiver();
 for(const ttlMs of [1000,30*86400000]){
 const result=await subscribe(env,client,'owner','chatgpt-events',{...request,ttlMs},now,r.fetcher);
 assert.equal(Date.parse(result.refreshBefore)-now.getTime(),Math.min(ttlMs,604800000));
 }
 env.DB.sqlite.close();
});

test('callback and signing failures have distinct fixed reasons without credential leakage',async()=>{
 const cases=[
  [()=>callbackUrl('not-a-url'),'callback_url'],
  [()=>callbackUrl('https://receiver.example.test/private?token=DO_NOT_LOG'),'callback_origin'],
  [()=>callbackUrl('https://chatgpt.com/private#DO_NOT_LOG'),'callback_structure'],
  [()=>signingBytes('DO_NOT_LOG'),'signing_format'],
  [()=>signingBytes('whsec_A'),'signing_base64'],
  [()=>signingBytes('whsec_'+Buffer.alloc(8).toString('base64')),'signing_length'],
 ];
 for(const [run,reason] of cases){
  const messages=[],original=console.info;console.info=x=>messages.push(x);
  try{await assert.rejects(checked(async()=>run()),e=>e.code===-32602);}
  finally{console.info=original;}
  assert.equal(JSON.parse(messages.at(-1)).reason,reason);
  assert(messages.every(x=>!x.includes('DO_NOT_LOG')&&!x.includes('https://')&&!x.includes('whsec_')));
  if(reason==='callback_origin')assert.deepEqual(JSON.parse(messages.at(-1)).destination,{hostname:'receiver.example.test',protocol:'https:',port:''});
 }
 for(const length of [24,32,64])assert.equal(signingBytes('whsec_'+Buffer.alloc(length).toString('base64')).length,length);
});

test('nonpublic DNS and failed challenge stay blocked with distinct diagnostics and no stored subscription',async()=>{
 for(const [receiverOptions,reason] of [[{privateDns:true},'callback_nonpublic'],[{mismatch:true},'callback_challenge']]){
  const env=seed(),client=await plannerPrincipal(env.DB,'owner','chatgpt-events'),r=receiver(receiverOptions);
  await assert.rejects(subscribe(env,client,'owner','chatgpt-events',request,now,r.fetcher),e=>e instanceof EventValidationError&&e.reason===reason);
  assert.equal(env.DB.sqlite.prepare('SELECT count(*) AS n FROM mcp_event_subscriptions').get().n,0);
  env.DB.sqlite.close();
 }
});

test('observed OpenAI connector origin verifies and stores; sibling and lookalike origins stay blocked',async()=>{
 const env=seed(),client=await plannerPrincipal(env.DB,'owner','chatgpt-events'),r=receiver();
 const url='https://connectors.api.openai.com/mcp-events/private-callback';
 const result=await subscribe(env,client,'owner','chatgpt-events',{...request,delivery:{...request.delivery,url}},now,r.fetcher);
 assert(result.id);assert.equal(r.calls.length,1);assert.equal(r.calls[0].data.type,'verification');
 assert.equal(env.DB.sqlite.prepare('SELECT callback_url,active FROM mcp_event_subscriptions').get().callback_url,url);
 for(const bad of ['http://connectors.api.openai.com/a','https://connectors.api.openai.com.evil.test/a','https://other.api.openai.com/a','https://connectors.api.openai.com:444/a','https://private@connectors.api.openai.com/a'])assert.throws(()=>callbackUrl(bad));
 env.DB.sqlite.close();
});

test('private immediate dispatch sends only requested queued job; replay does not duplicate receipt or consume job',async()=>{
 const env=seed(),client=await plannerPrincipal(env.DB,'owner','chatgpt-events'),r=receiver();
 await subscribe(env,client,'owner','chatgpt-events',request,now,r.fetcher);
 const a=await enqueue(env.DB,{}, {learnerId:'owner',kind:'plan',purpose:'daily',subjectId:'de'},new Date(+now+1000));
 const b=await enqueue(env.DB,{}, {learnerId:'owner',kind:'plan',purpose:'daily',subjectId:'de'},new Date(+now+2000));
 assert.equal((await deliverEvents(env,new Date(+now+3000),r.fetcher,a.id)).delivered,1);
 assert.equal((await deliverEvents(env,new Date(+now+4000),r.fetcher,a.id)).delivered,0);
 const receipts=env.DB.sqlite.prepare('SELECT job_id FROM mcp_event_deliveries').all();assert.deepEqual(receipts,[{job_id:a.id}].map(x=>Object.assign(Object.create(null),x)));
 assert.equal(env.DB.sqlite.prepare('SELECT status FROM ai_jobs WHERE id=?').get(b.id).status,'queued');
 assert.equal(env.DB.sqlite.prepare('SELECT status FROM ai_jobs WHERE id=?').get(a.id).status,'queued');env.DB.sqlite.close();
});
