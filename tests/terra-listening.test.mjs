import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { consumeOpenAi } from '../build/openai-queue.ts';
import { speech } from '../build/openai-tts.ts';
import { initializeAiControls } from '../lib/ai-controls.ts';
import { OPENAI_VOICE_PREFIX } from '../lib/audio/openai-voices.ts';
import { playAudio } from '../lib/audio/playback.ts';
import { readLessonV2 } from '../lib/lesson-v2/store.ts';
import { aacDurationMs } from '../lib/audio/aac.ts';
const aac = readFileSync(new URL('./fixtures/audio/de-DE-f.aac', import.meta.url));
import { readJob } from '../lib/ai-jobs/lease.ts';
import { systemPrompt } from '../lib/ai/job.mjs';
import { memoryDb } from './d1-adapter.mjs';
import { seedListeningRequest } from './listening-authoring-fixture.mjs';

async function setupTerraFixture(t, { mutate, speech, put, head, retry } = {}) {
  const raw = JSON.parse(readFileSync(new URL('./fixtures/qwen/l4-listening-sample.json', import.meta.url))).listeningSample;
  raw.explorations[0].lesson = JSON.parse(readFileSync(new URL('../fixtures/lessons/deutsch-listening.json', import.meta.url)));
  const db = memoryDb();
  t.after(() => db.sqlite.close());
  const { subject, learner, request } = await seedListeningRequest(db, { at: new Date() });
  db.sqlite.prepare("UPDATE roadmap_steps SET listening=1 WHERE id='time-2'").run();
  const job = db.sqlite.prepare('SELECT job_id FROM learner_requests WHERE id=?').get(request.id);
  const objects = new Map();
  const env = {
    OPENAI_ENABLED:'true', ENVIRONMENT: 'staging', DB: db, OPENAI_API_KEY: 'fixture-key',
    UPLOADS: {
      async put(key, bytes, options) {
        if (put) return put();
        assert.equal(options.onlyIf.etagDoesNotMatch, '*');
        assert.equal(options.httpMetadata.contentType, 'audio/aac');
        if (objects.has(key)) return null;
        const object = { bytes, size: bytes.byteLength, customMetadata: options.customMetadata };
        objects.set(key, object);
        return object;
      },
      async head(key) { return head ? head() : objects.get(key) ?? null; },
      async get(key, { range } = {}) {
        const bytes = objects.get(key)?.bytes;
        return bytes && { body: range ? bytes.slice(range.offset, range.offset + range.length) : bytes };
      },
    },
  };
  let acks = 0;
  const batch = { messages: [{ body: { jobId: job.job_id }, ack: () => acks++, retry: retry ?? (() => assert.fail('Unexpected Queue retry')) }] };
  let terraCalls = 0;
  const voicesByText = new Map();
  const fetcher = async (url, init) => {
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'manual');
    const body = JSON.parse(init.body);
    if (url === 'https://api.openai.com/v1/responses') {
      terraCalls++;
      assert.equal(body.model, 'gpt-6.1-terra');
      assert.equal(body.store, false);
      assert(!body.input.includes('Mỗi bài dùng gradingMode whole-lesson'));
      const context = JSON.parse(body.input.split('<context>\n')[1].split('\n</context>')[0]);
      assert.deepEqual(context.adaptive.listening, { min: 2, max: 3 });
      assert.deepEqual(context.tts.languages, ['de-DE']);
      assert.equal(context.learner.displayName, 'Người học');
      const result = structuredClone(raw);
      Object.assign(result.subjects[0], {
        subjectId: subject.id, expectedRevision: context.subjects[0].revision, reason: context.adaptive.reason,
      });
      result.subjects[0].roadmapChanges = [
        { op: 'revise', stepId: 'time-1', fields: { title: 'Tage im Überblick' } },
        { op: 'append', step: {
          title: 'Einen Termin verschieben', objective: 'Nghe và xác nhận giờ hẹn mới.', situation: 'Đổi giờ hẹn',
          skills: ['sk_listeningtime'], requires: [], band: 2, kind: 'new',
        } },
      ];
      Object.assign(result.explorations[0], { subjectId: subject.id, requestId: request.id });
      mutate?.(result.explorations[0].lesson);
      return Response.json({
        status: 'completed', model: body.model, usage: { input_tokens: 100, output_tokens: 100 },
        output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(result) }] }],
      });
    }
    assert.equal(url, 'https://api.openai.com/v1/audio/speech');
    assert.equal(body.response_format, 'aac');
    assert.equal(body.speed, 0.8);
    const calls = voicesByText.get(body.input) ?? [];
    calls.push(body.voice);
    voicesByText.set(body.input, calls);
    if (speech) return speech();
    return new Response(aac);
  };
  return { raw, db, subject, learner, job, objects, env, voicesByText,
    run: () => consumeOpenAi(batch, env, systemPrompt, fetcher), counts: () => ({ terraCalls, acks }),
  };
}

test('Terra API fixture and Queue delivery replay save a Deutsch lesson with four playable AAC files', async t => {
  const { raw, db, subject, learner, job, objects, env, voicesByText, run, counts } = await setupTerraFixture(t);
  await run();
  const saved = await readJob(db, job.job_id);
  assert.equal(saved.status, 'succeeded', saved.error);
  assert.equal(db.sqlite.prepare('SELECT speech_calls FROM ai_jobs WHERE id=?').get(job.job_id).speech_calls, 12);
  assert.equal(saved.runner && JSON.parse(saved.runner).name, 'openai-staging');
  const steps = db.sqlite.prepare('SELECT title,listening FROM roadmap_steps WHERE subject_id=? ORDER BY ord').all(subject.id);
  assert.equal(steps.length, 6);
  assert.equal(steps[1].title, 'Tage im Überblick');
  assert.deepEqual(steps.map(step => step.listening), [0, 0, 1, 0, 0, 1]);
  const [lessonId] = JSON.parse(saved.outcome).extraLessonIds;
  const lesson = await readLessonV2(db, learner, lessonId);
  const listening = lesson.items.filter(item => item.audio);
  assert.equal(listening.length, 2);
  assert.equal(objects.size, 4);
  assert.equal(voicesByText.size, 6);
  for (const [index, line] of raw.explorations[0].lesson.items.filter(item => item.audio).flatMap(item => item.audio.lines).entries()) {
    assert.deepEqual(voicesByText.get(line.text), line.speaker === 'a' ? ['marin', 'cedar'] : ['cedar', 'marin'], 'turn ' + index);
  }
  for (const item of listening) {
    assert.notEqual(item.audio.src.f, item.audio.src.m);
    for (const src of Object.values(item.audio.src)) {
      const hash = src.split('/').at(-1);
      assert(aacDurationMs(objects.get('audio/' + hash + '.aac').bytes) > 0);
      const response = await playAudio(db, env.UPLOADS, { id: learner },
        new Request('http://local.test' + src, { headers: { Range: 'bytes=0-1' } }), hash);
      assert.equal(response.status, 206);
      assert.equal(response.headers.get('content-type'), 'audio/aac');
      assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [...aac.subarray(0, 2)]);
    }
  }
  await run();
  assert.deepEqual(counts(), { terraCalls: 1, acks: 2 });
  assert.equal(objects.size, 4);
  assert.deepEqual(JSON.parse((await readJob(db, job.job_id)).outcome), JSON.parse(saved.outcome));
});

test('Queue logs safe stages, codes and paths for the L4 failure modes', async t => {
  const secret = 'do-not-log-provider-or-storage-detail';
  const contact = 'qa-private@example.test';
  const lessonPath = '/explorations/0/lesson';
  const audioPath = lessonPath + '/items/0/audio';
  const cases = [
    ['lesson validation', { mutate: lesson => { lesson.items[0].audio.rate = 1; } },
      { event: 'audio_validation_error', stage: 'lesson_validation',
        issues: [{ code: 'difficulty_limit', path: audioPath + '/rate' }] }],
    ['content privacy', { mutate: lesson => { lesson.items[0].audio.lines[0].text = contact; } },
      { event: 'audio_error', stage: 'lesson_validation', code: 'privacy', path: audioPath + '/lines' }],
    ['Speech HTTP response', { speech: () => Response.json({ error: { message: secret } }, { status: 429 }) },
      { event: 'audio_error', stage: 'speech_api', code: 'speech_http', httpStatus: 429,
        path: audioPath + '/lines/0/text', variant: 'f' }],
    ['Speech transport', { speech: () => { throw Error(secret); } },
      { event: 'audio_error', stage: 'speech_api', code: 'speech_transport',
        path: audioPath + '/lines/0/text', variant: 'f' }],
    ['invalid AAC', { speech: () => new Response(new Uint8Array(3)) },
      { event: 'audio_error', stage: 'audio_format', code: 'aac_invalid',
        path: audioPath + '/lines/0/text', variant: 'f' }],
    ['R2 put', { put: () => { throw Error(secret); } },
      { event: 'audio_error', stage: 'r2', code: 'r2_put_failed', httpStatus: 503, path: audioPath, variant: 'f' }],
    ['R2 head', { put: () => null, head: () => { throw Error(secret); } },
      { event: 'audio_error', stage: 'r2', code: 'r2_head_failed', httpStatus: 503, path: audioPath, variant: 'f' }],
    ['R2 confirmation', { put: () => null },
      { event: 'audio_error', stage: 'r2', code: 'r2_object_unconfirmed', httpStatus: 503, path: audioPath, variant: 'f' }],
  ];
  for (const [name, options, expected] of cases) await t.test(name, async t => {
    const captured = [];
    t.mock.method(console, 'warn', line => captured.push(JSON.parse(line)));
    t.mock.method(console, 'info', line => captured.push(JSON.parse(line)));
    const delays = [];
    const { raw, db, job, objects, run } = await setupTerraFixture(t, { ...options, retry: entry => delays.push(entry.delaySeconds) });
    await run();
    assert(captured.some(entry => entry.component === 'openai-queue-tts' &&
      entry.jobId === job.job_id && entry.leaseCount === 1 &&
      Object.entries(expected).every(([key, value]) => {
        // The two Speech requests run concurrently; either line can fail first.
        if (key === 'path' && typeof value === 'string' && value.endsWith('/lines/0/text'))
          return entry.path === value || entry.path === value.replace('/lines/0/text', '/lines/1/text');
        return JSON.stringify(entry[key]) === JSON.stringify(value);
      })),
    JSON.stringify(captured));
    const canRetry = false;
    assert.equal(captured.some(entry => entry.event === 'queue_failed'), !canRetry);
    assert.deepEqual(delays, canRetry ? [30] : []);
    const serialized = JSON.stringify(captured);
    for (const privateValue of [secret, contact, 'fixture-key', raw.explorations[0].lesson.items[0].audio.lines[0].text])
      assert(!serialized.includes(privateValue));
    assert.equal((await readJob(db, job.job_id)).status, canRetry ? 'queued' : 'failed');
    assert.equal(db.sqlite.prepare('SELECT count(*) n FROM learning_lessons').get().n, 0);
    assert.equal(db.sqlite.prepare('SELECT count(*) n FROM audio_assets').get().n, 0);
    assert.equal(objects.size, 0);
  });
});

test('two repair calls in one delivery exhaust the job and further deliveries make no calls', async t=>{
  const {db,job,run,counts}=await setupTerraFixture(t,{mutate:lesson=>{lesson.items[0].audio.rate=1;},retry:()=>{}});
  await run();
  assert.equal(counts().terraCalls,2);
  const row=db.sqlite.prepare('SELECT status,openai_calls,error FROM ai_jobs WHERE id=?').get(job.job_id);
  assert.equal(row.status,'failed');assert.equal(row.openai_calls,2);assert.match(row.error,/2 lần/);
  await run();await run();assert.equal(counts().terraCalls,2);
});


test('Speech permits at most two fetches for the same sentence and voice',async t=>{
  const {db,env,job}=await setupTerraFixture(t);
  await initializeAiControls(db,env);
  db.sqlite.prepare("UPDATE ai_jobs SET status='leased' WHERE id=?").run(job.job_id);
  let calls=0;const fetcher=async()=>{calls++;return new Response(null,{status:503});};
  const audio={lang:'de-DE',rate:0.8,lines:[{speaker:'a',text:'Guten Tag'}]};
  const call=()=>speech(audio,audio.lines[0],OPENAI_VOICE_PREFIX+'marin','fake',fetcher,AbortSignal.timeout(1000),{path:'/fixture',variant:'f'},db,job.job_id);
  await assert.rejects(call);await assert.rejects(call);await assert.rejects(call);
  assert.equal(calls,2);assert.equal(db.sqlite.prepare('SELECT openai_calls FROM ai_speech_calls').get().openai_calls,2);
});

test('concurrent Speech turns reserve at most the job budget across deliveries', async t => {
  const { db, env, job } = await setupTerraFixture(t);
  await initializeAiControls(db, env);
  db.sqlite.prepare("UPDATE ai_jobs SET status='leased' WHERE id=?").run(job.job_id);
  let calls = 0;
  const fetcher = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); return new Response(aac); };
  const call = index => {
    const audio = { lang: 'de-DE', rate: 0.8, lines: [{ speaker: 'a', text: 'Fixture ' + index }] };
    return speech(audio, audio.lines[0], OPENAI_VOICE_PREFIX + 'marin', 'fake', fetcher,
      AbortSignal.timeout(1000), { path: '/fixture', variant: 'f' }, db, job.job_id, 6);
  };
  const result = await Promise.allSettled(Array.from({ length: 20 }, (_, index) => call(index)));
  assert.equal(result.filter(entry => entry.status === 'fulfilled').length, 6);
  assert.equal(calls, 6);
  assert.equal(db.sqlite.prepare('SELECT speech_calls FROM ai_jobs WHERE id=?').get(job.job_id).speech_calls, 6);
  await assert.rejects(call(21), error => error.diagnostic?.code === 'speech_job_limit');
  assert.equal(calls, 6);
});

test('Queue stops Speech at a configured job limit without saving an incomplete lesson', async t => {
  const { db, env, job, run, objects } = await setupTerraFixture(t);
  env.OPENAI_SPEECH_MAX_PER_JOB = '1';
  await run();
  const row = db.sqlite.prepare('SELECT status,speech_calls,error FROM ai_jobs WHERE id=?').get(job.job_id);
  assert.equal(row.status, 'failed');
  assert.equal(row.speech_calls, 1);
  assert.match(row.error, /Chưa tạo được âm thanh/);
  assert.equal(db.sqlite.prepare('SELECT sum(openai_calls) n FROM ai_speech_calls').get().n, 1);
  assert.equal(objects.size, 0);
  await run();
  assert.equal(db.sqlite.prepare('SELECT speech_calls FROM ai_jobs WHERE id=?').get(job.job_id).speech_calls, 1);
});

test('Speech job limit defaults to 12 and rejects invalid configuration', async () => {
  const { speechJobLimit } = await import('../build/openai-tts.ts');
  assert.equal(speechJobLimit(undefined), 12);
  assert.equal(speechJobLimit('6'), 6);
  for (const invalid of ['', '0', '-1', '1.5', 'abc', 'Infinity']) assert.throws(() => speechJobLimit(invalid));
});

test('concurrent attempts for the same sentence keep the per-file limit', async t => {
  const { db, env, job } = await setupTerraFixture(t);
  await initializeAiControls(db, env);
  db.sqlite.prepare("UPDATE ai_jobs SET status='leased' WHERE id=?").run(job.job_id);
  const audio = { lang: 'de-DE', rate: 0.8, lines: [{ speaker: 'a', text: 'Guten Tag' }] };
  let calls = 0;
  const fetcher = async () => { calls++; return new Response(aac); };
  const call = () => speech(audio, audio.lines[0], OPENAI_VOICE_PREFIX + 'marin', 'fake', fetcher,
    AbortSignal.timeout(1000), { path: '/fixture', variant: 'f' }, db, job.job_id, 12);
  const result = await Promise.allSettled(Array.from({ length: 10 }, call));
  assert.equal(result.filter(entry => entry.status === 'fulfilled').length, 2);
  assert.equal(calls, 2);
  assert.equal(db.sqlite.prepare('SELECT openai_calls FROM ai_speech_calls').get().openai_calls, 2);
});

test('R2 head failure after audio upload fails the same job and does not retry OpenAI', async t => {
  const { db, job, run, counts, objects } = await setupTerraFixture(t, {
    head: () => { throw Error('private R2 failure'); }, retry: () => assert.fail('must not retry'),
  });
  await run();
  const row = db.sqlite.prepare('SELECT status,error,openai_calls,speech_calls FROM ai_jobs WHERE id=?').get(job.job_id);
  assert.equal(row.status, 'failed');
  assert.match(row.error, /Không hoàn tất/);
  assert.equal(row.openai_calls, 1);
  assert.equal(row.speech_calls, 12);
  assert.equal(objects.size, 4);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM learning_lessons').get().n, 0);
  await run();
  assert.equal(counts().terraCalls, 1);
});

test('a committed result survives a lost D1 response after audio upload', async t => {
  const { db, job, run, counts } = await setupTerraFixture(t);
  const batch = db.batch.bind(db);
  let lost = false;
  db.batch = async statements => {
    const result = await batch(statements);
    if (!lost && statements.some(statement => statement.sql.includes("SET status='succeeded'"))) {
      lost = true;
      throw Error('response lost after commit');
    }
    return result;
  };
  await run();
  const row = db.sqlite.prepare('SELECT status,outcome FROM ai_jobs WHERE id=?').get(job.job_id);
  assert.equal(lost, true);
  assert.equal(row.status, 'succeeded');
  assert.equal(JSON.parse(row.outcome).extraLessonIds.length, 1);
  assert.equal(counts().terraCalls, 1);
});

test('scheduled sweep fails only expired exhausted OpenAI leases', async t => {
  const { db, env, job } = await setupTerraFixture(t);
  const { failExpiredOpenAiJobs } = await import('../build/openai-queue.ts');
  await initializeAiControls(db, env);
  db.sqlite.prepare("UPDATE ai_jobs SET status='leased',lease_client_id='openai-staging',lease_token_sha256='old',lease_expires_at='2026-11-17T00:00:00.000Z',openai_calls=2 WHERE id=?").run(job.job_id);
  await failExpiredOpenAiJobs(db, new Date('2026-11-17T01:00:00.000Z'));
  const row = db.sqlite.prepare('SELECT status,error,lease_token_sha256 FROM ai_jobs WHERE id=?').get(job.job_id);
  assert.equal(row.status, 'failed');
  assert.match(row.error, /Không hoàn tất/);
  assert.equal(row.lease_token_sha256, null);
});

test('normal lease maintenance fails exhausted OpenAI lease before requeue', async t => {
  const { db, job } = await setupTerraFixture(t);
  const { maintainJobs } = await import('../lib/ai-jobs/lease.ts');
  db.sqlite.prepare("UPDATE ai_jobs SET status='leased',lease_client_id='openai-staging',lease_token_sha256='old',lease_expires_at='2026-11-17T00:00:00.000Z',expires_at='2026-11-18T00:00:00.000Z',openai_calls=2 WHERE id=?").run(job.job_id);
  await maintainJobs(db, new Date('2026-11-17T01:00:00.000Z'));
  const row = db.sqlite.prepare('SELECT status,error FROM ai_jobs WHERE id=?').get(job.job_id);
  assert.equal(row.status, 'failed');
  assert.match(row.error, /Không hoàn tất/);
});
