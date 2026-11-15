import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { applyResult } from '../lib/ai-jobs/result.ts';
import { enqueue } from '../lib/ai-jobs/queue.ts';
import { leaseJobs, leasedJob } from '../lib/ai-jobs/lease.ts';
import { audioVariant } from '../lib/audio/hash.mjs';
import { resolveLessonAudio } from '../lib/audio/lesson.ts';
import { playAudio } from '../lib/audio/playback.ts';
import { uploadAudio, MAX_AUDIO_BYTES } from '../lib/audio/upload.ts';
import { readLessonV2 } from '../lib/lesson-v2/store.ts';
import { validateLessonPackage } from '../lib/lesson-v2/validate.ts';
import { fakeResult } from '../scripts/fake-runner.mjs';
import { memoryDb } from './d1-adapter.mjs';

const now = new Date('2026-11-15T10:00:00Z');
const learnerId = 'demo-audio-owner';
const subject = 'sub_aaaaaaaaaaaaaaaaaaaa';
const lang = 'de-DE';
const pair = { f: 'Anna (German (Germany))', m: 'Reed (German (Germany))' };
const audio = { lang, rate: 0.8, maxPlays: 3, transcript: 'never', lines: [{ speaker: 'a', text: 'Guten Morgen.' }] };
const fixture = variant => readFileSync(new URL('./fixtures/audio/de-DE-' + variant + '.m4a', import.meta.url));
const lesson = JSON.parse(readFileSync(new URL('../fixtures/lessons/deutsch-modalverb.json', import.meta.url)));
const client = { id: 'test-tts', scopes: ['jobs:plan'], purposes: ['daily'], triggers: ['scheduled'], learnerIds: [learnerId] };

async function setup(t) {
  const db = memoryDb();
  t.after(() => db.sqlite.close());
  db.sqlite.exec(`INSERT INTO user(id,name,email,email_verified,created_at,updated_at,role,status)
    VALUES ('${learnerId}','Demo','a@test.invalid',1,1,1,'learner','active'),
           ('other','Other','b@test.invalid',1,1,1,'learner','active');
    INSERT INTO learner_settings(user_id,daily_target_minutes,role,updated) VALUES ('${learnerId}',120,'adult','now');
    INSERT INTO subjects(id,learner_id,title,template,status,ai_enabled,goal,level,created_by,created_at,updated_at,legacy_track)
    VALUES ('${subject}','${learnerId}','Deutsch','skill','active',1,'Modalverben','A2','${learnerId}','now','now','Deutsch');`);
  await enqueue(db, {}, { learnerId, kind: 'plan', purpose: 'daily' }, now);
  const [lease] = await leaseJobs(db, client, {
    kinds: ['plan'], max: 1, capabilities: ['lesson-v3', 'tts'], ttsVoices: { [lang]: pair },
    runner: { name: 'test', version: '1', model: 'none' },
  }, 'test', now);
  const verify = (token = lease.leaseToken) => leasedJob(db, client, lease.jobId, token, now);
  const job = await verify();
  const context = JSON.parse(job.context_snapshot);
  assert.deepEqual(context.tts, { languages: [lang], voices: { [lang]: pair } });
  const objects = new Map();
  const bucket = {
    async put(key, bytes, options) {
      assert.equal(options.onlyIf.etagDoesNotMatch, '*');
      if (objects.has(key)) return null;
      const object = { bytes, size: bytes.byteLength, customMetadata: options.customMetadata };
      objects.set(key, object);
      return object;
    },
    async head(key) { return objects.get(key) ?? null; },
    async get(key, { range } = {}) {
      const object = objects.get(key);
      if (!object) return null;
      return { body: range ? object.bytes.slice(range.offset, range.offset + range.length) : object.bytes };
    },
  };
  async function put(variant, { bytes = fixture(variant), hash, mime = 'audio/mp4', token } = {}) {
    const expected = (await audioVariant(audio, pair, variant)).hash;
    const req = new Request('https://test.invalid/audio', { method: 'PUT', body: bytes, headers: {
      'Content-Type': mime, 'X-Audio-Spec': Buffer.from(JSON.stringify({ audio, variant })).toString('base64'),
    } });
    return uploadAudio(db, bucket, req, await verify(token), hash ?? expected, verify, now);
  }
  return { db, lease, context, bucket, objects, put };
}

test('audio upload requires a live plan lease, matching hash and a bounded M4A', async t => {
  const { db, put, objects } = await setup(t);
  await assert.rejects(put('f', { token: 'wrong' }), { status: 401 });
  await assert.rejects(put('f', { hash: 'a'.repeat(64) }), { status: 400 });
  await assert.rejects(put('f', { mime: 'text/plain' }), { status: 415 });
  await assert.rejects(put('f', { bytes: Buffer.from('not m4a') }), { status: 415 });
  await assert.rejects(put('f', { bytes: new Uint8Array(MAX_AUDIO_BYTES + 1) }), { status: 413 });
  const f = await put('f');
  const expected = createHash('sha256').update('de-DE|' + JSON.stringify([pair.f, pair.f]) + '|0.8|[["a","Guten Morgen."]]').digest('hex');
  assert.equal(f.hash, expected);
  assert.ok(f.durationMs > 0);
  const key = 'audio/' + f.hash + '.m4a';
  const original = objects.get(key);
  assert.deepEqual(await put('f'), f);
  assert.equal(objects.get(key), original);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM audio_assets').get().n, 1);
  db.sqlite.exec("UPDATE ai_jobs SET lease_expires_at='2000-01-01'");
  await assert.rejects(put('m'), { status: 410 });
});

test('plan drops audio items without both objects, then enforces the original item minimum', async t => {
  const { db, lease, context, bucket, objects, put } = await setup(t);
  const draft = structuredClone(lesson);
  draft.items[0].audio = audio;
  const result = fakeResult(context, draft);
  const f = await put('f');
  const filtered = await resolveLessonAudio(db, result.subjects[0].primaryLesson, context.tts, bucket);
  assert.equal(filtered.lesson.items.length, draft.items.length - 1);
  assert(!filtered.lesson.stages.some(stage => stage.itemIds.includes(draft.items[0].id)));
  assert.equal(validateLessonPackage(filtered.lesson, { aiSizes: true }).lesson, null);
  const rejected = await applyResult(db, client, lease.jobId, lease.leaseToken, result, true, now, undefined, bucket);
  assert.equal(rejected.status, 422);
  const m = await put('m');
  assert.notEqual(f.hash, m.hash);
  const key = 'audio/' + m.hash + '.m4a';
  const object = objects.get(key);
  objects.delete(key);
  assert.equal((await resolveLessonAudio(db, result.subjects[0].primaryLesson, context.tts, bucket)).assets.size, 0);
  objects.set(key, object);

  // Save the full lesson while dropping an additional item for which there are no assets.
  const extra = { ...draft.items[0], id: 'i9', prompt: 'Câu chỉ dùng để thử tệp thiếu.',
    audio: { ...audio, lines: [{ speaker: 'a', text: 'Bis später.' }] } };
  draft.items.push(extra);
  draft.stages.find(stage => stage.itemIds.includes(draft.items[0].id)).itemIds.push(extra.id);
  const saved = await applyResult(db, client, lease.jobId, lease.leaseToken, fakeResult(context, draft), false, now, undefined, bucket);
  assert.equal(saved.status, 200, JSON.stringify(saved));
  const id = saved.outcome.subjects[0].lessonIds[0];
  const view = await readLessonV2(db, learnerId, id);
  assert.equal(view.items.length, lesson.items.length);
  const urls = { f: '/api/audio/' + f.hash, m: '/api/audio/' + m.hash };
  assert.deepEqual(view.items.find(item => item.id === draft.items[0].id).audio, {
    lang, rate: 0.8, maxPlays: 3, transcript: 'never', durationMs: Math.max(f.durationMs, m.durationMs), src: urls,
  });
  const request = (headers, suffix = '') => new Request('https://test.invalid' + urls.f + suffix, { headers });
  const allowed = await playAudio(db, bucket, { id: learnerId }, request({ Range: 'bytes=0-15' }), f.hash);
  assert.equal(allowed.status, 206);
  assert.equal(allowed.headers.get('Content-Range'), 'bytes 0-15/' + fixture('f').length);
  assert.equal(allowed.headers.get('Cache-Control'), 'private, max-age=31536000, immutable');
  assert.deepEqual(Buffer.from(await allowed.arrayBuffer()), fixture('f').subarray(0, 16));
  const cached = request({ 'If-None-Match': allowed.headers.get('ETag') });
  assert.equal((await playAudio(db, bucket, { id: learnerId }, cached, f.hash)).status, 304);
  await assert.rejects(playAudio(db, bucket, { id: 'other' }, cached, f.hash), { status: 404 });
  assert.equal((await playAudio(db, bucket, { id: 'other' }, request({}, '?learner=' + learnerId), f.hash)).status, 404);
  assert.equal((await playAudio(db, bucket, { id: 'other', role: 'admin' }, request({}), f.hash)).status, 200);
});
