import {readFileSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {fakeResult} from './fake-runner.mjs';
const file=process.argv[2];if(!file)throw Error('Private generated QA manifest required.');
const m=JSON.parse(readFileSync(file,'utf8')),origin=m.origin;
if(!/^qa-h5-[a-f0-9]{20}$/.test(m.learnerId)||!(origin==='http://localhost:8874'||origin==='https://learning-hub-mcp-staging.tranvu-812.workers.dev'))throw Error('Only synthetic local/staging MCP QA.');
let cookie='';
async function call(path,method='GET',body,headers={}){
 const r=await fetch(origin+path,{method,redirect:'manual',signal:AbortSignal.timeout(20000),headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
 const jar=new Map(cookie.split('; ').filter(Boolean).map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)];}));
 for(const h of r.headers.getSetCookie()){const s=h.split(';')[0],i=s.indexOf('=');jar.set(s.slice(0,i),s.slice(i+1));}cookie=[...jar].map(([k,v])=>k+'='+v).join('; ');return r;
}
const initial=await call('/mcp','POST',{jsonrpc:'2.0',id:1,method:'tools/list'});assert.equal(initial.status,401);assert(initial.headers.get('www-authenticate').includes('resource_metadata'));
const discovery=await call('/.well-known/oauth-authorization-server/api/auth');assert.equal(discovery.status,200);const meta=await discovery.json();assert(meta.code_challenge_methods_supported.includes('S256'));assert(meta.scopes_supported.includes('offline_access'));
const resource=await (await call('/.well-known/oauth-protected-resource/mcp')).json();assert.equal(resource.resource,origin+'/mcp');
const callback='https://chatgpt.com/connector/oauth/qa-learning-hub';
const registered=await call('/api/auth/oauth2/register','POST',{client_name:'Synthetic MCP QA',redirect_uris:[callback],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code'],scope:'openid offline_access hub:plan'});assert.equal(registered.status,201);const client=await registered.json();
const verifier=randomBytes(32).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url'),state=randomBytes(16).toString('hex');
const query=new URLSearchParams({client_id:client.client_id,redirect_uri:callback,response_type:'code',scope:'openid offline_access hub:plan',resource:origin+'/mcp',code_challenge:challenge,code_challenge_method:'S256',state});
const authorize=await call('/api/auth/oauth2/authorize?'+query,'GET',undefined,{Accept:'text/html'});assert([200,302].includes(authorize.status));const login=new URL(authorize.status===302?authorize.headers.get('location'):(await authorize.json()).url,origin);assert.equal(login.pathname,'/login');
const signin=await call('/api/auth/sign-in/email','POST',{email:m.email,password:m.password,oauth_query:login.search.slice(1)});assert.equal(signin.status,200);const next=await signin.json();const consentUrl=new URL(next.url,origin);assert.equal(consentUrl.pathname,'/connect/chatgpt');
const consent=await call('/api/auth/oauth2/consent','POST',{accept:true,oauth_query:consentUrl.search.slice(1)});assert.equal(consent.status,200);const consentResult=await consent.json();const redirect=new URL(consentResult.redirect_uri??consentResult.url);assert.equal(redirect.searchParams.get('state'),state);assert.equal(redirect.searchParams.get('iss'),origin+'/api/auth');
const code=redirect.searchParams.get('code');assert(code);
const form=new URLSearchParams({grant_type:'authorization_code',client_id:client.client_id,code,code_verifier:verifier,redirect_uri:callback,resource:origin+'/mcp'});
const tokenResponse=await fetch(origin+'/api/auth/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form});assert.equal(tokenResponse.status,200);const tokens=await tokenResponse.json();assert(tokens.access_token&&tokens.refresh_token);
async function rpc(method,params,id=2){const r=await fetch(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+tokens.access_token,'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25'},body:JSON.stringify({jsonrpc:'2.0',id,method,...(params?{params}:{})})});assert.equal(r.status,200);const text=await r.text();return r.headers.get('content-type').includes('text/event-stream')?JSON.parse(text.split('\n').find(l=>l.startsWith('data: ')).slice(6)):JSON.parse(text);}
const init=await rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'qa',version:'1'}});assert(init.result);
const list=await rpc('tools/list');assert.equal(list.result.tools.length,7);assert(list.result.tools.every(t=>t.name.startsWith('hub2_')));
const schema=await rpc('tools/call',{name:'hub2_schema',arguments:{}});assert(!schema.result.isError);
const lease=await rpc('tools/call',{name:'hub2_lease_plan',arguments:{}});assert(!lease.result.isError);const job=JSON.parse(lease.result.content[0].text).jobs[0];assert(job);
const read=await rpc('tools/call',{name:'hub2_context',arguments:{jobId:job.jobId,leaseToken:job.leaseToken}});assert(!read.result.isError);const ctx=JSON.parse(read.result.content[0].text);assert(!JSON.stringify(ctx).includes(m.email));assert.equal(ctx.learner.ref,m.credentials.expectedLearnerRef);
const result=fakeResult(ctx,JSON.parse(readFileSync('fixtures/lessons/deutsch-modalverb.json','utf8')));
for(const name of ['hub2_check_result','hub2_submit_result']){const r=await rpc('tools/call',{name,arguments:{jobId:job.jobId,leaseToken:job.leaseToken,result}});assert(!r.result.isError);}
const saved=await rpc('tools/call',{name:'hub2_job',arguments:{jobId:job.jobId}});const outcome=JSON.parse(saved.result.content[0].text);assert.equal(outcome.status,'succeeded');const lessonIds=outcome.outcome.subjects.flatMap(s=>s.lessonIds);assert.equal(lessonIds.length,1);
const refresh=await fetch(origin+'/api/auth/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:client.client_id,refresh_token:tokens.refresh_token,resource:origin+'/mcp'})});assert.equal(refresh.status,200);
const connections=await call('/connections');assert.equal(connections.status,200);const page=await connections.text();const consentId=page.match(/name="id" value="([^"]+)"/)[1];
const revoke=await fetch(origin+'/connections/revoke',{method:'POST',redirect:'manual',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id:consentId})});assert.equal(revoke.status,303);
const denied=await fetch(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+tokens.access_token,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:99,method:'tools/list'})});assert.equal(denied.status,403);
console.log(JSON.stringify({environment:m.environment,result:'PASS',verified:['401 discovery challenge','OAuth metadata','public registration','signed login continuation','consent','PKCE resource token','MCP initialize/tools','own learner context','dry run/save/readback','refresh','consent revocation denies existing JWT'],jobId:job.jobId,lessonIds,secretValuesDisplayed:false}));
