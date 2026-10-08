import assert from 'node:assert/strict';
import {test} from 'node:test';
import {standaloneApiGuard} from '../build/worker-boundary.ts';

test('standalone Workers never expose the Sites-scheduled learning endpoint',()=>{
 for(const method of ['GET','POST']){
  const response=standaloneApiGuard(new Request('https://example.test/api/learning-run',{method}),{ENVIRONMENT:'staging',STAGING_SPIKE_LOCKDOWN:'true'});
  assert.equal(response?.status,410);
 }
});

test('staging spike allows only the D1 health endpoint among API routes',()=>{
 const env={ENVIRONMENT:'staging',STAGING_SPIKE_LOCKDOWN:'true'};
 assert.equal(standaloneApiGuard(new Request('https://example.test/api/health'),env),null);
 assert.equal(standaloneApiGuard(new Request('https://example.test/api/state'),env)?.status,404);
 assert.equal(standaloneApiGuard(new Request('https://example.test/api/auth/session'),env)?.status,404);
});

test('staging lock does not block page assets or future authenticated non-staging APIs',()=>{
 assert.equal(standaloneApiGuard(new Request('https://example.test/'),{ENVIRONMENT:'staging',STAGING_SPIKE_LOCKDOWN:'true'}),null);
 assert.equal(standaloneApiGuard(new Request('https://example.test/_next/static/app.js'),{ENVIRONMENT:'staging',STAGING_SPIKE_LOCKDOWN:'true'}),null);
 assert.equal(standaloneApiGuard(new Request('https://example.test/api/state'),{ENVIRONMENT:'production'}),null);
});
