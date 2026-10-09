import assert from 'node:assert/strict';
import {test} from 'node:test';
import {standaloneRequestGuard} from '../build/worker-boundary.ts';

test('standalone Workers never expose the Sites-scheduled learning endpoint',()=>{
 for(const method of ['GET','POST']){
  const response=standaloneRequestGuard(new Request('https://example.test/api/learning-run',{method}),{ENVIRONMENT:'staging',STAGING_SPIKE_LOCKDOWN:'true'});
  assert.equal(response?.status,410);
 }
});

test('staging exposes only health and a neutral probe page',async()=>{
 const env={ENVIRONMENT:'staging',STAGING_SPIKE_LOCKDOWN:'true'};
 assert.equal(standaloneRequestGuard(new Request('https://example.test/api/health'),env),null);
 assert.equal(standaloneRequestGuard(new Request('https://example.test/api/state'),env)?.status,404);
 assert.equal(standaloneRequestGuard(new Request('https://example.test/api/auth/session'),env)?.status,404);
 const page=standaloneRequestGuard(new Request('https://example.test/'),env);
 assert.equal(page?.status,200);
 const body=await page.text();
 assert.match(body,/staging/);
 assert.doesNotMatch(body,/Bột|Ly|Vũ/);
 assert.equal(standaloneRequestGuard(new Request('https://example.test/_next/static/chunk.js'),env)?.status,404);
});

test('staging lockdown is scoped to staging environment',()=>{
 const production={ENVIRONMENT:'production'};
 assert.equal(standaloneRequestGuard(new Request('https://example.test/'),production),null);
 assert.equal(standaloneRequestGuard(new Request('https://example.test/api/state'),production),null);
});
