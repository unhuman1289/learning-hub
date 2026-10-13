import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {runAssessment} from '../integrations/assessor/src/runner.mjs';import {HubClient} from '../integrations/assessor/src/hub.mjs';import system from '../integrations/assessor/src/system.mjs';
const id='job_'+'a'.repeat(20),env={ASSESSOR_ENABLED:'true',ANTHROPIC_API_KEY:'test-only',ANTHROPIC_MODEL:'test',HUB_ORIGIN:'https://learning-hub-staging.tranvu-812.workers.dev',PILOT_LEARNER_REF:'lrn_'+'b'.repeat(12),PILOT_SUBJECT_ID:'sub_'+'c'.repeat(20),HUB_AUTOMATION_BEARER:'test',ACCESS_CLIENT_ID:'test',ACCESS_CLIENT_SECRET:'test'};
function fake({ambiguous=false,child=false,repair=false}={}){const calls=[];let checks=0;return {calls,fetcher:async(url,options)=>{calls.push({url,options});const path=new URL(url).pathname;
 if(path.endsWith('/lease'))return Response.json({jobs:[{jobId:id,leaseToken:'test-lease'}]});
 if(path.endsWith('/context'))return Response.json({learner:{ref:env.PILOT_LEARNER_REF,role:child?'child':'adult'},subject:{sensitivity:'normal',subjectId:env.PILOT_SUBJECT_ID},attempts:[]});
 if(path.endsWith('/schema'))return Response.json({contracts:{'assess-result/1':{type:'object'}}});
 if(url.includes('dryRun'))return Response.json(repair&&++checks===1?{status:422,issues:[{path:'/summary'}]}:{status:200});
 if(path.endsWith('/result')&&ambiguous)throw Error('Network interrupted after commit');
 if(path.endsWith('/'+id))return Response.json({status:'succeeded',outcome:{grades:['g']}});
 return Response.json({status:200});}};}
test('disabled assessor performs no Hub/model requests',async()=>{const f=fake();assert.equal((await runAssessment({...env,ASSESSOR_ENABLED:'false'},{...f,model:()=>{throw Error('never');}})).status,'disabled');assert.equal(f.calls.length,0);});
test('assessor verifies persisted result after one write',async()=>{const f=fake();const r=await runAssessment(env,{...f,model:async()=>({summary:'test'})});assert.equal(r.status,'succeeded');assert.equal(f.calls.filter(c=>c.url.endsWith('/result')).length,1);});
test('uncertain result write is read back, never posted again',async()=>{const f=fake({ambiguous:true});assert.equal((await runAssessment(env,{...f,model:async()=>({})})).status,'succeeded');assert.equal(f.calls.filter(c=>c.url.endsWith('/result')).length,1);});
test('server 422 gets one model repair before any real write',async()=>{const f=fake({repair:true});let models=0;assert.equal((await runAssessment(env,{...f,model:async()=>{models++;return {};}})).status,'succeeded');assert.equal(models,2);});
test('pilot runner refuses children before sending work to model',async()=>{const f=fake({child:true});let models=0;assert.equal((await runAssessment(env,{...f,model:async()=>{models++;return {};}})).status,'failed');assert.equal(models,0);});
test('Hub client cannot call arbitrary host, path or user URL',async()=>{assert.throws(()=>new HubClient({...env,HUB_ORIGIN:'https://evil.example'}));await assert.rejects(new HubClient(env).call('/api/admin/users'));});
test('Worker system prompt equals tracked grading instructions',()=>{assert.equal(system,readFileSync(new URL('../integrations/runner-prompts/assess.md',import.meta.url),'utf8'));});

import {createModel} from '../integrations/assessor/src/model.mjs';
for(const reason of ['max_tokens','refusal'])test('model '+reason+' cannot produce a persisted assessment',async()=>{
 const model=createModel(env,{fetcher:async()=>Response.json({model:'test',content:[{type:'text',text:'{}'}],stop_reason:reason,usage:{input_tokens:3,output_tokens:4}})});
 await assert.rejects(model({}, {type:'object',properties:{},additionalProperties:false,required:[]}));
});
test('model usage is assigned from API telemetry rather than generated text',async()=>{
 const model=createModel(env,{fetcher:async()=>Response.json({model:'test',content:[{type:'text',text:'{"usage":{"inputTokens":999}}'}],stop_reason:'end_turn',usage:{input_tokens:3,output_tokens:4}})});
 const result=await model({}, {type:'object',properties:{},additionalProperties:false,required:[]});assert.equal(result.usage.inputTokens,3);assert.equal(result.usage.outputTokens,4);
});

test('model rate limit requeues before writing grades',async()=>{
 const f=fake();const fetcher=async(url,options)=>url.endsWith('/fail')?Response.json({status:JSON.parse(options.body).retryable?'queued':'failed'}):f.fetcher(url,options);
 const error=Object.assign(new Error('Rate limited'),{status:429});const result=await runAssessment(env,{fetcher,model:async()=>{throw error;}});
 assert.equal(result.status,'queued');assert.equal(f.calls.some(c=>c.url.endsWith('/result')),false);
});

test('assessor cannot send another normal notebook to the model',async()=>{
 const f=fake();let calls=0;const fetcher=async(url,options)=>url.endsWith('/context')?Response.json({learner:{ref:env.PILOT_LEARNER_REF,role:'adult'},subject:{sensitivity:'normal',subjectId:'sub_'+'d'.repeat(20)},attempts:[]}):f.fetcher(url,options);
 const result=await runAssessment(env,{fetcher,model:async()=>{calls++;return {};}});assert.equal(result.status,'failed');assert.equal(calls,0);
});
