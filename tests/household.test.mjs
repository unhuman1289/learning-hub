import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { memoryDb } from './d1-adapter.mjs';
import {
  householdGuard,
  householdMode,
  manageActive,
  profileFromCookie,
  signValue,
  verifyValue,
  PROFILE_COOKIE,
  MANAGE_COOKIE,
} from '../lib/household.ts';
import { activeProfile, archiveProfile, checkManagePin, createProfile, listProfiles, setManagePin } from '../lib/profiles.ts';

const secret = 's'.repeat(40);
const req = (path, init = {}) => new Request('https://learn.example' + path, init);

test('household mode is off unless the gate is configured, so accounts keep working', async () => {
  assert.equal(householdMode({}), null);
  assert.equal(householdMode({ HOUSEHOLD_GATE: 'open' }), null);
  assert.equal(await householdGuard(req('/'), {}), null);
});

test('signed values: tampering, wrong secret and short secrets are rejected', async () => {
  const signed = await signValue(secret, 'prf_abc');
  assert.equal(await verifyValue(secret, signed), 'prf_abc');
  assert.equal(await verifyValue(secret, signed.replace('prf_abc', 'prf_xyz')), null);
  assert.equal(await verifyValue('t'.repeat(40), signed), null);
  assert.equal(await verifyValue('short', signed), null);
  await assert.rejects(signValue('short', 'x'), /32 characters/);
  const header = `${PROFILE_COOKIE}=${encodeURIComponent(signed)}; other=1`;
  assert.equal(await profileFromCookie(header, secret), 'prf_abc');
  const until = await signValue(secret, String(Math.floor(Date.now() / 1000) + 60));
  assert.equal(await manageActive(`${MANAGE_COOKIE}=${encodeURIComponent(until)}`, secret), true);
  const expired = await signValue(secret, String(Math.floor(Date.now() / 1000) - 1));
  assert.equal(await manageActive(`${MANAGE_COOKIE}=${encodeURIComponent(expired)}`, secret), false);
});

test('access gate: people with a valid assertion pass; missing, foreign or service tokens do not', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const env = { HOUSEHOLD_GATE: 'access', ACCESS_TEAM_DOMAIN: 'family.cloudflareaccess.com', APP_ACCESS_AUD: 'aud-app' };
  const sign = (claims, aud = 'aud-app') =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://family.cloudflareaccess.com')
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
  const keys = async () => publicKey;
  const withToken = (t) => req('/', { headers: { 'cf-access-jwt-assertion': t } });
  assert.equal(await householdGuard(withToken(await sign({ email: 'a@example.test', sub: 'user-1' })), env, keys), null);
  assert.equal((await householdGuard(req('/'), env, keys)).status, 403);
  assert.equal((await householdGuard(withToken(await sign({ email: 'a@example.test', sub: 'user-1' }, 'other')), env, keys)).status, 403);
  assert.equal((await householdGuard(withToken(await sign({ sub: '', common_name: 'svc' })), env, keys)).status, 403);
  assert.equal((await householdGuard(req('/api/lessons'), env, keys)).headers.get('content-type'), 'application/json');
  assert.equal((await householdGuard(req('/'), { ...env, APP_ACCESS_AUD: '' }, keys)).status, 503);
});

test('profile mode removes account routes and leaves automation to its own auth', async () => {
  const env = { HOUSEHOLD_GATE: 'access', ACCESS_TEAM_DOMAIN: 'family.cloudflareaccess.com', APP_ACCESS_AUD: 'aud-app' };
  assert.equal((await householdGuard(req('/api/auth/sign-in/email', { method: 'POST' }), env)).status, 404);
  const login = await householdGuard(req('/login'), env);
  assert.equal(login.status, 302);
  assert.equal(login.headers.get('location'), 'https://learn.example/');
  assert.equal(await householdGuard(req('/api/automation/v2/jobs/lease', { method: 'POST' }), env), null);
  assert.equal(await householdGuard(req('/api/health'), env), null);
  const local = { ...env, APP_ENV: 'local', ENVIRONMENT: 'local' };
  assert.equal(await householdGuard(new Request('http://localhost:8791/'), local), null);
  assert.equal((await householdGuard(new Request('http://localhost:8791/'), { ...env, APP_ENV: 'local' })).status, 403);
});

test('passphrase gate: form, wrong passphrase, and a signed house cookie', async () => {
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('family pass 2026'))), (x) =>
    x.toString(16).padStart(2, '0'),
  ).join('');
  const env = { HOUSEHOLD_GATE: 'passphrase', HOUSEHOLD_PASSPHRASE_SHA256: hash, PROFILE_COOKIE_SECRET: secret };
  const page = await householdGuard(req('/'), env);
  assert.equal(page.status, 302);
  assert.equal((await householdGuard(req('/api/today'), env)).status, 401);
  assert.match(await (await householdGuard(req('/household'), env)).text(), /Mật khẩu gia đình/);
  const form = (p) => req('/api/household', { method: 'POST', headers: { Origin: 'https://learn.example' }, body: new URLSearchParams({ passphrase: p }) });
  assert.equal((await householdGuard(form('wrong'), env)).status, 401);
  const crossOrigin = form('family pass 2026');
  crossOrigin.headers.set('Origin', 'https://untrusted.example');
  assert.equal((await householdGuard(crossOrigin, env)).status, 403);
  assert.equal((await householdGuard(form('a'.repeat(4097)), env)).status, 413);
  const ok = await householdGuard(form('family pass 2026'), env);
  assert.equal(ok.status, 303);
  const set = ok.headers.get('set-cookie');
  assert.match(set, /lh_house=.*HttpOnly; SameSite=Lax; Max-Age=31536000; Secure/);
  const value = decodeURIComponent(set.split(';')[0].split('=').slice(1).join('='));
  assert.equal(await householdGuard(req('/', { headers: { cookie: 'lh_house=' + encodeURIComponent(value) } }), env), null);
  assert.equal((await householdGuard(req('/', { headers: { cookie: 'lh_house=house.forged' } }), env)).status, 302);
  assert.equal((await householdGuard(req('/', { headers: { cookie: 'lh_house=%AB' } }), env)).status, 302);
  const expired = await signValue(secret, 'house:' + (Date.now() - 1));
  assert.equal((await householdGuard(req('/', { headers: { cookie: 'lh_house=' + expired } }), env)).status, 302);
});

test('profiles: create, list, hide; the manage PIN is optional', async () => {
  const db = memoryDb();
  assert.deepEqual(await listProfiles(db), []);
  const a = await createProfile(db, { displayName: 'Vũ', role: 'adult', avatar: '🦊' });
  const b = await createProfile(db, { displayName: 'Ếch', role: 'child', avatar: '🐸' });
  assert.match(a.id, /^prf_[a-f0-9]{20}$/);
  assert.deepEqual(
    (await listProfiles(db)).map((p) => [p.displayName, p.role, p.avatar]),
    [
      ['Vũ', 'adult', '🦊'],
      ['Ếch', 'child', '🐸'],
    ],
  );
  await assert.rejects(createProfile(db, { displayName: '', role: 'adult' }), /1–40/);
  await assert.rejects(createProfile(db, { displayName: 'X', role: 'admin' }), /người lớn hoặc trẻ em/);
  await assert.rejects(createProfile(db, { displayName: 'X', role: 'adult', avatar: '<script>' }), /Biểu tượng/);
  await archiveProfile(db, b.id);
  assert.deepEqual(
    (await listProfiles(db)).map((p) => p.id),
    [a.id],
  );
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM learner_settings WHERE user_id=?').get(b.id).n, 1);
  assert.equal(await checkManagePin(db, undefined), true);
  await setManagePin(db, '2468');
  assert.equal(await checkManagePin(db, '2468'), true);
  assert.equal(await checkManagePin(db, '1111'), false);
  await assert.rejects(setManagePin(db, '12'), /4–8/);
  await setManagePin(db, null);
  assert.equal(await checkManagePin(db, undefined), true);
  db.sqlite.close();
});

test('legacy accounts only appear or can be selected when explicitly included', async () => {
  const db = memoryDb();
  db.sqlite.prepare("INSERT INTO user(id,name,email,created_at,updated_at,status) VALUES(?,?,?,0,0,'active')").run('old', 'Existing learner', 'owner@example.test');
  assert.deepEqual(await listProfiles(db), []);
  await assert.rejects(activeProfile(db, 'old'), /Không tìm thấy/);
  assert.equal((await listProfiles(db, 'old'))[0].id, 'old');
  assert.equal(await activeProfile(db, 'old', 'old'), 'old');
  await assert.rejects(archiveProfile(db, 'old'), /Không tìm thấy/);
  assert.equal(await activeProfile(db, 'old', 'old'), 'old');
  db.sqlite.close();
});
