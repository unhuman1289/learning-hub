import {test} from 'node:test';import assert from 'node:assert/strict';
import {memoryDb} from './d1-adapter.mjs';
import {plannerPrincipal,callPlannerTool,toolSchemas} from '../lib/mcp/service.ts';
import {enqueue} from '../lib/ai-jobs/queue.ts';
const at=new Date('2026-10-13T07:30:00Z');
function seed(){const db=memoryDb();
 for(const id of ['owner','other'])db.sqlite.prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at,status,role) VALUES(?,?,?,1,1,1,'active','learner')").run(id,'QA',id+'@example.test');
 db.sqlite.prepare("INSERT INTO oauthClient(id,clientId,redirectUris,disabled) VALUES('app','chatgpt-qa','[]',0)").run();
 db.sqlite.prepare("INSERT INTO oauthConsent(id,clientId,userId,scopes,createdAt,updatedAt) VALUES('consent','chatgpt-qa','owner','[\"hub:plan\"]',1,1)").run();return db;}
for(const mode of ['blocked','child','disabled','revoked'])test('OAuth live authorization rejects '+mode,async()=>{const db=seed();
 if(mode==='blocked')db.sqlite.prepare("UPDATE user SET status='blocked' WHERE id='owner'").run();
 if(mode==='child')db.sqlite.prepare("INSERT INTO learner_settings(user_id,role,updated) VALUES('owner','child','t')").run();
 if(mode==='disabled')db.sqlite.prepare("UPDATE oauthClient SET disabled=1").run();
 if(mode==='revoked')db.sqlite.prepare("DELETE FROM oauthConsent").run();
 await assert.rejects(plannerPrincipal(db,'owner','chatgpt-qa'),e=>e.status===403);db.sqlite.close();});
test('direct MCP OAuth principal only leases its own plan jobs',async()=>{const db=seed();const principal=await plannerPrincipal(db,'owner','chatgpt-qa');
 assert.deepEqual(principal.learnerIds,['owner']);assert.deepEqual(principal.scopes,['jobs:plan']);
 await enqueue(db,{}, {learnerId:'other',kind:'plan',purpose:'daily'},at);assert.deepEqual((await callPlannerTool(db,principal,'hub2_lease_plan',{},'staging',at)).jobs,[]);
 db.sqlite.close();});
test('a subject without consent cannot use another user grant',async()=>{const db=seed();await assert.rejects(plannerPrincipal(db,'other','chatgpt-qa'),e=>e.status===403);db.sqlite.close();});
test('direct MCP tools reject supplied learner IDs and require separate assessment authorization',()=>{assert.equal(Object.keys(toolSchemas).length,8);assert(!toolSchemas.hub2_lease_plan.safeParse({learnerId:'other'}).success);assert(!Object.keys(toolSchemas).some(x=>/admin|complete/.test(x)));assert(!toolSchemas.hub2_lease_assess.safeParse({learnerId:'other'}).success);});
test('OAuth migration is additive and protects persisted consent/token ownership with foreign keys',()=>{const db=seed();assert(db.sqlite.prepare("PRAGMA foreign_key_list('oauthConsent')").all().some(r=>r.table==='user'));assert(db.sqlite.prepare("PRAGMA index_list('oauthClient')").all().some(r=>r.unique));db.sqlite.close();});

import {allowedRegistration,isChatGptCallback} from '../lib/mcp/policy.ts';
test('OAuth callback allowlist rejects off-host, credentials, query, and lookalike addresses',()=>{
 assert(isChatGptCallback('https://chatgpt.com/connector_platform_oauth_redirect'));assert(isChatGptCallback('https://chatgpt.com/connector/oauth/qa-learning-hub'));
 for(const uri of ['https://chatgpt.com.evil.test/connector/oauth/x','http://chatgpt.com/connector/oauth/x','https://chatgpt.com:444/connector/oauth/x','https://foo@chatgpt.com/connector/oauth/x','https://chatgpt.com/connector/oauth/x?next=evil','https://chatgpt.com/connector/oauth/x#frag'])assert.equal(isChatGptCallback(uri),false);
});
test('public registration cannot fetch attacker-controlled JWKS or select arbitrary callbacks',()=>{
 const base={redirect_uris:['https://chatgpt.com/connector/oauth/qa'],token_endpoint_auth_method:'none'};assert(allowedRegistration(base));
 assert(!allowedRegistration({...base,jwks_uri:'http://127.0.0.1/private'}));assert(!allowedRegistration({...base,token_endpoint_auth_method:'private_key_jwt'}));assert(!allowedRegistration({...base,redirect_uris:['https://evil.test/return']}));
});

import {readBoundedText} from '../lib/mcp/body.ts';
test('public request bodies are bounded by bytes even without Content-Length',async()=>{
 const oversized=new Request('https://example.test',{method:'POST',body:'đ'.repeat(5)});
 assert.equal(await readBoundedText(oversized,8),null);
 const allowed=new Request('https://example.test',{method:'POST',body:'đ'.repeat(4)});
 assert.equal(await readBoundedText(allowed,8),'đ'.repeat(4));
});
test('declared oversized request is rejected before reading its body',async()=>{
 const request=new Request('https://example.test',{method:'POST',headers:{'Content-Length':'999'},body:'small'});
 assert.equal(await readBoundedText(request,8),null);assert.equal(request.bodyUsed,false);
});

test('old plan tokens cannot acquire grading even after consent is expanded',async()=>{const db=seed();db.sqlite.prepare(`UPDATE oauthConsent SET scopes='["hub:plan","hub:assess"]'`).run();const principal=await plannerPrincipal(db,'owner','chatgpt-qa',['hub:plan']);assert.deepEqual(principal.scopes,['jobs:plan']);await assert.rejects(callPlannerTool(db,principal,'hub2_lease_assess',{},'test',at),e=>e.status===403);db.sqlite.close();});
test('assessment token cannot use a grant that only authorizes planning',async()=>{const db=seed();await assert.rejects(plannerPrincipal(db,'owner','chatgpt-qa',['hub:assess']),e=>e.status===403);db.sqlite.close();});
test('grading tools do not fall back to other adults or notebooks',async()=>{const db=seed();db.sqlite.prepare(`UPDATE oauthConsent SET scopes='["hub:assess"]'`).run();const principal=await plannerPrincipal(db,'owner','chatgpt-qa',['hub:assess']);assert.deepEqual(principal.scopes,['jobs:assess']);assert.deepEqual((await callPlannerTool(db,principal,'hub2_lease_assess',{},'test',at)).jobs,[]);await assert.rejects(callPlannerTool(db,principal,'hub2_lease_plan',{},'test',at),e=>e.status===403);db.sqlite.close();});

import {readFileSync} from 'node:fs';
import {fakeResult} from '../scripts/fake-runner.mjs';
import {saveDraft} from '../lib/lesson-v2/actions.ts';
import {submitLesson} from '../lib/evidence/submit.ts';
import {queueSubmission} from '../lib/ai-jobs/queue.ts';
async function ownAssessment(){
 const db=seed();const subject='sub_'+'a'.repeat(20);
 db.sqlite.prepare("UPDATE user SET name='unhuman' WHERE id='owner'").run();
 db.sqlite.prepare(`UPDATE oauthConsent SET scopes='["hub:plan","hub:assess"]'`).run();
 db.sqlite.prepare("INSERT INTO subjects(id,learner_id,title,template,status,ai_enabled,goal,level,created_by,created_at,updated_at) VALUES(?,'owner','Deutsch','skill','active',1,'A2','A2','owner','t','t')").run(subject);
 const principal=await plannerPrincipal(db,'owner','chatgpt-qa',['hub:plan','hub:assess']);
 await enqueue(db,{}, {learnerId:'owner',kind:'plan',purpose:'daily'},at);
 const plan=(await callPlannerTool(db,principal,'hub2_lease_plan',{},'test',at)).jobs[0];
 const planLease={jobId:plan.jobId,leaseToken:plan.leaseToken};
 const context=await callPlannerTool(db,principal,'hub2_context',planLease,'test',at);
 const fixture=JSON.parse(readFileSync(new URL('../fixtures/lessons/deutsch-modalverb.json',import.meta.url),'utf8'));
 const applied=await callPlannerTool(db,principal,'hub2_submit_result',{...planLease,result:fakeResult(context,fixture)},'test',at);
 const lesson=applied.outcome.subjects[0].lessonIds[0];
 await saveDraft(db,'owner',lesson,{revision:0,answers:{i3:{answer:'Paul möchte einen Kuchen kaufen.'}}},at);
 const sub=await submitLesson(db,'owner',lesson,{clientSubmissionId:crypto.randomUUID(),draftRevision:1,stage:'guided',itemIds:['i3']},at);
 await queueSubmission(db,{},'owner',sub.id,at);
 return {db,principal,lesson};
}
test('MCP subscription grading validates, saves once and reads persistent grade IDs without completing lesson',async()=>{
 const {db,principal,lesson}=await ownAssessment();
 const job=(await callPlannerTool(db,principal,'hub2_lease_assess',{},'test',at)).jobs[0];assert(job);
 const lease={jobId:job.jobId,leaseToken:job.leaseToken};
 const ctx=await callPlannerTool(db,principal,'hub2_context',lease,'test',at);
 const result=fakeResult(ctx);result.usage.model='subscription-unmetered';
 assert.equal((await callPlannerTool(db,principal,'hub2_check_result',{...lease,result},'test',at)).status,200);
 assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM grades WHERE grader='ai'").get().n,0);
 await callPlannerTool(db,principal,'hub2_submit_result',{...lease,result},'test',at);
 const receipt=await callPlannerTool(db,principal,'hub2_job',{jobId:job.jobId},'test',at);
 assert.equal(receipt.status,'succeeded');assert.equal(receipt.outcome.gradeIds.length,1);
 assert.equal(db.sqlite.prepare('SELECT completed_at FROM learning_lessons WHERE id=?').get(lesson).completed_at,null);
 db.sqlite.close();
});
test('MCP grading skips queued jobs containing images without claiming or exposing context',async()=>{
 const {db,principal}=await ownAssessment();
 db.sqlite.prepare(`UPDATE attempts SET attachment_ids='["img_aaaaaaaaaaaaaaaaaaaa"]'`).run();
 assert.deepEqual((await callPlannerTool(db,principal,'hub2_lease_assess',{},'test',at)).jobs,[]);
 assert.equal(db.sqlite.prepare("SELECT status FROM ai_jobs WHERE kind='assess'").get().status,'queued');db.sqlite.close();
});

import {knowledgePrincipal,callKnowledgeTool,knowledgeTools} from '../lib/knowledge/tools.ts';
test('Knowledge OAuth requires an active adult administrator and current consent',async()=>{
 const db=seed();
 await assert.rejects(knowledgePrincipal(db,'owner','chatgpt-qa',['hub:knowledge']),{status:403});
 db.sqlite.prepare("UPDATE user SET role='admin' WHERE id='owner'").run();
 await assert.rejects(knowledgePrincipal(db,'owner','chatgpt-qa',['hub:knowledge']),{status:403});
 db.sqlite.prepare("UPDATE oauthConsent SET scopes=?").run('["hub:knowledge"]');
 await assert.rejects(knowledgePrincipal(db,'owner','chatgpt-qa',['hub:plan']),{status:403});
 const client=await knowledgePrincipal(db,'owner','chatgpt-qa',['hub:knowledge']);
 assert.deepEqual(Object.keys(client),['clientId']);
 await assert.rejects(plannerPrincipal(db,'owner','chatgpt-qa',['hub:knowledge']),{status:403});
 const writes=db.sqlite.prepare('SELECT total_changes() AS n').get().n;
 for(const [name,tool] of Object.entries(knowledgeTools))if(tool.read)
   await callKnowledgeTool(db,client,name,name==='search'?{query:'Deutsch',subjectId:'none'}:{});
 assert.equal(db.sqlite.prepare('SELECT total_changes() AS n').get().n,writes);
 db.sqlite.prepare("INSERT INTO learner_settings(user_id,role,updated) VALUES('owner','child','t')").run();
 await assert.rejects(knowledgePrincipal(db,'owner','chatgpt-qa',['hub:knowledge']),{status:403});
 db.sqlite.close();
});

import {authorizationMetadata, mcpScopesFor} from '../lib/mcp/metadata.ts';
test('production MCP advertises and accepts only the Knowledge OAuth task scope',()=>{
 const scopes=mcpScopesFor('production');
 assert.deepEqual(scopes,['openid','offline_access','hub:knowledge']);
 assert.deepEqual(authorizationMetadata('https://learn.unhuman.cc','production').scopes_supported,scopes);
 assert(mcpScopesFor('staging').includes('hub:plan'));
 assert(mcpScopesFor('staging').includes('hub:assess'));
});
