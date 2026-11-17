import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { consumeOpenAi } from '../build/openai-queue.ts';
import { playAudio } from '../lib/audio/playback.ts';
import { readLessonV2 } from '../lib/lesson-v2/store.ts';
import { aacDurationMs } from '../lib/audio/aac.ts';
const aac = readFileSync(new URL('./fixtures/audio/de-DE-f.aac', import.meta.url));
import { readJob } from '../lib/ai-jobs/lease.ts';
import { systemPrompt } from '../integrations/home-runner/job.mjs';
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
    ENVIRONMENT: 'staging', DB: db, OPENAI_API_KEY: 'fixture-key',
    OPENAI_SUBJECT_IDS: subject.id, OPENAI_TTS_SUBJECT_IDS: subject.id,
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
      const context = JSON.parse(body.input.split('\n')[2]);
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
      Object.entries(expected).every(([key, value]) => JSON.stringify(entry[key]) === JSON.stringify(value))),
    JSON.stringify(captured));
    const canRetry = expected.event === 'audio_validation_error';
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
