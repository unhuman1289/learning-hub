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
test('direct MCP tools reject supplied learner IDs and expose no assess/admin tools',()=>{assert.equal(Object.keys(toolSchemas).length,7);assert(!toolSchemas.hub2_lease_plan.safeParse({learnerId:'other'}).success);assert(!Object.keys(toolSchemas).some(x=>/assess|admin|complete/.test(x)));});
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
