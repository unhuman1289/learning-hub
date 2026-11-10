import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bridgeCall,authorizeSiteCaller,stagingOrigin} from '../integrations/sites-bridge/site/lib/hub-bridge.mjs';
const env={HUB_BRIDGE_BEARER:'fixture-bearer',HUB_BRIDGE_ACCESS_CLIENT_ID:'fixture-id',HUB_BRIDGE_ACCESS_CLIENT_SECRET:'fixture-secret',HUB_BRIDGE_OWNER_EMAIL:'owner@example.test'};
const runId='c1436a89-091a-4fbd-a40a-c935e6a77d53';
test('bridge fails closed without secrets and never invokes upstream',async()=>{
 const r=await bridgeCall('hub_schema',{}, {},()=>{throw Error('must not fetch')});assert.equal(r.status,503);
});
test('Sites viewer cannot use owner tools; service and owner can',()=>{
 assert.equal(authorizeSiteCaller(new Request('https://site.test',{headers:{'oai-authenticated-user-id':'viewer','oai-authenticated-user-email':'viewer@example.test'}}),env),false);
 assert.equal(authorizeSiteCaller(new Request('https://site.test',{headers:{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.test'}}),env),true);
 assert.equal(authorizeSiteCaller(new Request('https://site.test'),env),true);
});
test('bridge pins destination and rejects SSRF path/arguments',async()=>{
 await assert.rejects(bridgeCall('hub_run',{runId:'../../admin/export'},env));
 await assert.rejects(bridgeCall('hub_schema',{url:'https://other.test'},env));
 let destination;await bridgeCall('hub_context',{runId},env,async(url,opts)=>{destination=url;assert.equal(opts.redirect,'manual');return Response.json({targets:[]})});
 assert.equal(destination,stagingOrigin+'/api/automation/v1/runs/'+runId+'/context');
});
test('redirect never forwards secrets or becomes success',async()=>{
 let calls=0;const r=await bridgeCall('hub_schema',{},env,async()=>{calls++;return new Response('',{status:302,headers:{location:'https://evil.test'}})});assert.equal(calls,1);assert.equal(r.ok,false);assert.equal(r.status,302);
});
test('uncertain POST is not retried and retains recovery IDs',async()=>{
 let calls=0;const r=await bridgeCall('hub_result',{runId,result:{items:[]}},env,async()=>{calls++;throw Error('connection lost')});assert.equal(calls,1);assert.equal(r.runId,runId);assert.equal(r.error,'uncertain_write_read_same_run');
});
test('POST uses two independent auth layers and stable idempotency',async()=>{
 const r=await bridgeCall('hub_start_run',{idempotencyKey:'bridge-test-20261010'},env,async(url,opts)=>{assert.equal(opts.headers.Authorization,'Bearer fixture-bearer');assert.equal(opts.headers['CF-Access-Client-Secret'],'fixture-secret');assert.equal(opts.headers['Idempotency-Key'],'bridge-test-20261010');assert.equal(JSON.parse(opts.body).trigger,'manual');return Response.json({runId},{status:201})});assert.equal(r.ok,true);
});

test('Hub 2 tools reach only the v2 job API with the lease token as a header', async () => {
  const jobId = 'job_0123456789abcdef0123', token = crypto.randomUUID() + crypto.randomUUID();
  const calls = [];
  const fetcher = async (url, opts) => { calls.push({ url, opts }); return Response.json({ ok: true }); };
  await bridgeCall('hub2_lease_plan', {}, env, fetcher);
  await bridgeCall('hub2_context', { jobId, leaseToken: token }, env, fetcher);
  await bridgeCall('hub2_check_result', { jobId, leaseToken: token, result: { contract: 'plan-result/1' } }, env, fetcher);
  await bridgeCall('hub2_submit_result', { jobId, leaseToken: token, result: { contract: 'plan-result/1' } }, env, fetcher);
  await bridgeCall('hub2_job', { jobId }, env, fetcher);
  assert.deepEqual(calls.map((c) => [c.opts.method, c.url.replace(stagingOrigin, '')]), [
    ['POST', '/api/automation/v2/jobs/lease'],
    ['GET', `/api/automation/v2/jobs/${jobId}/context`],
    ['POST', `/api/automation/v2/jobs/${jobId}/result?dryRun=1`],
    ['POST', `/api/automation/v2/jobs/${jobId}/result`],
    ['GET', `/api/automation/v2/jobs/${jobId}`],
  ]);
  assert.equal(calls[1].opts.headers['X-Lease-Token'], token);
  assert.deepEqual(JSON.parse(calls[0].opts.body).kinds, ['plan']);
  await assert.rejects(bridgeCall('hub2_context', { jobId: '../admin', leaseToken: token }, env, fetcher));
  await assert.rejects(bridgeCall('hub2_job', { jobId, extra: 1 }, env, fetcher));
  await assert.rejects(bridgeCall('hub2_context', { jobId, leaseToken: 'x' }, env, fetcher));
});

test('an uncertain Hub 2 write points to the job readback, never a retry', async () => {
  const jobId = 'job_0123456789abcdef0123', token = crypto.randomUUID() + crypto.randomUUID();
  let calls = 0;
  const r = await bridgeCall('hub2_submit_result', { jobId, leaseToken: token, result: {} }, env, async () => { calls++; throw Error('lost'); });
  assert.equal(calls, 1);
  assert.equal(r.error, 'uncertain_write_read_hub2_job');
  assert.equal(r.jobId, jobId);
});

test('hub2_status reads one profile through the read-only status path', async () => {
  const calls = [];
  const fetcher = async (url, opts) => { calls.push({ url, opts }); return Response.json({ notebooks: [] }); };
  await bridgeCall('hub2_status', { profileId: 'prf_0123456789abcdef0123' }, env, fetcher);
  assert.deepEqual(calls.map((c) => [c.opts.method, c.url.replace(stagingOrigin, '')]), [['GET', '/api/automation/v2/status/prf_0123456789abcdef0123']]);
  await assert.rejects(bridgeCall('hub2_status', { profileId: '../jobs/lease' }, env, fetcher));
  await assert.rejects(bridgeCall('hub2_status', {}, env, fetcher));
});
