import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { authorizeAutomation, sha256Hex, verifyAccessAssertion } from '../lib/auth/automation.ts';

const issuer = 'https://unhuman-lab.cloudflareaccess.com';
const audience = 'test-app-audience';
const accessClientId = 'a1b2c3d4e5f6.access';
const now = Math.floor(Date.now() / 1000);

async function setup() {
  const pair = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(pair.publicKey);
  const keyResolver = createLocalJWKSet({ keys: [{ ...publicJwk, kid: 'test-key', alg: 'RS256', use: 'sig' }] });
  const sign = async (claims = {}) => new SignJWT({
    type: 'app', sub: '', common_name: accessClientId,
    ...(claims.payload ?? {}),
  })
    .setProtectedHeader({ alg: 'RS256', kid: claims.kid ?? 'test-key', typ: 'JWT' })
    .setIssuer(claims.issuer ?? issuer)
    .setAudience(claims.audience ?? audience)
    .setIssuedAt(claims.iat ?? now)
    .setExpirationTime(claims.exp ?? now + 60)
    .sign(pair.privateKey);
  return { keyResolver, sign };
}

test('Cloudflare Access JWT requires signature, issuer, audience, service-token claims and client ID', async () => {
  const { keyResolver, sign } = await setup();
  const valid = await sign();
  assert.equal(await verifyAccessAssertion(valid, { issuer, audience, clientId: accessClientId }, keyResolver, now), true);
  assert.equal(await verifyAccessAssertion(await sign({ audience: 'other-app' }), { issuer, audience, clientId: accessClientId }, keyResolver, now), false);
  assert.equal(await verifyAccessAssertion(await sign({ issuer: 'https://wrong.cloudflareaccess.com' }), { issuer, audience, clientId: accessClientId }, keyResolver, now), false);
  assert.equal(await verifyAccessAssertion(await sign({ payload: { common_name: 'other-client.access' } }), { issuer, audience, clientId: accessClientId }, keyResolver, now), false);
  assert.equal(await verifyAccessAssertion(await sign({ payload: { service_token_status: false } }), { issuer, audience, clientId: accessClientId }, keyResolver, now), false);
  assert.equal(await verifyAccessAssertion(await sign({ payload: { sub: 'browser-user' } }), { issuer, audience, clientId: accessClientId }, keyResolver, now), false);
  assert.equal(await verifyAccessAssertion(await sign({ payload: { type: 'org' } }), { issuer, audience, clientId: accessClientId }, keyResolver, now), false);
  assert.equal(await verifyAccessAssertion(await sign({ exp: now - 1 }), { issuer, audience, clientId: accessClientId }, keyResolver, now), false);
  assert.equal(await verifyAccessAssertion(await sign({ kid: 'unknown-key' }), { issuer, audience, clientId: accessClientId }, keyResolver, now), false);
});

test('automation credentials require both the scoped bearer key and matching Access assertion', async () => {
  const { keyResolver, sign } = await setup();
  const secret = 'runner-secret-with-safe-randomness-0123456789';
  const env = {
    ACCESS_TEAM_DOMAIN: issuer,
    AUTOMATION_ACCESS_AUD: audience,
    AUTOMATION_CLIENTS: JSON.stringify([{ id: 'test-runner', keySha256: await sha256Hex(secret), scopes: ['runs:create', 'context:read'], accessClientId }]),
  };
  const assertion = await sign();
  const request = (bearer = `Bearer lhk_test-runner_${secret}`, jwt = assertion) => new Request('https://learn-staging.unhuman.cc/api/automation/v1/runs', {
    method: 'POST', headers: { authorization: bearer, 'cf-access-jwt-assertion': jwt },
  });

  const allowed = await authorizeAutomation(request(), env, 'runs:create', keyResolver);
  assert.equal('client' in allowed && allowed.client.id, 'test-runner');
  const missingScope = await authorizeAutomation(request(), env, 'result:write', keyResolver);
  assert.equal('response' in missingScope && missingScope.response.status, 403);
  const badBearer = await authorizeAutomation(request('Bearer lhk_test-runner_wrong-key-0000000000000000000000000000'), env, 'runs:create', keyResolver);
  assert.equal('response' in badBearer && badBearer.response.status, 401);
  const missingAccess = await authorizeAutomation(request(`Bearer lhk_test-runner_${secret}`, ''), env, 'runs:create', keyResolver);
  assert.equal('response' in missingAccess && missingAccess.response.status, 401);
  const unconfigured = await authorizeAutomation(request(), { ...env, AUTOMATION_CLIENTS: undefined }, 'runs:create', keyResolver);
  assert.equal('response' in unconfigured && unconfigured.response.status, 503);
});

import {configuredAutomationClients} from '../lib/auth/automation.ts';
test('separate assessor client preserves planner permissions and cannot broaden its scope',()=>{
 const planner={id:'planner',keySha256:'a'.repeat(64),accessClientId:'token-1234.access',scopes:['jobs:plan']};
 const assessor={id:'assessor',keySha256:'b'.repeat(64),accessClientId:'token-1234.access',scopes:['jobs:assess','attachments:read'],learnerIds:['unhuman-id'],purposes:['submission','recheck']};
 const bindings={AUTOMATION_CLIENTS:JSON.stringify([planner]),ASSESSOR_CLIENT:JSON.stringify(assessor)};
 assert.deepEqual(configuredAutomationClients(bindings)[0].scopes,['jobs:plan']);assert.equal(configuredAutomationClients(bindings).length,2);
 assert.equal(configuredAutomationClients({...bindings,ASSESSOR_CLIENT:JSON.stringify({...assessor,scopes:['jobs:plan']})}),null);
 assert.equal(configuredAutomationClients({...bindings,ASSESSOR_CLIENT:JSON.stringify({...assessor,learnerIds:undefined})}),null);
 assert.equal(configuredAutomationClients({...bindings,ASSESSOR_CLIENT:JSON.stringify({...assessor,id:'planner'})}),null);
});
