import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { consumeOpenAi } from '../build/openai-queue.ts';
import { playAudio } from '../lib/audio/playback.ts';
import { readLessonV2 } from '../lib/lesson-v2/store.ts';
import { wavDurationMs } from '../lib/audio/wav.ts';
import { readJob } from '../lib/ai-jobs/lease.ts';
import { systemPrompt } from '../integrations/home-runner/job.mjs';
import { memoryDb } from './d1-adapter.mjs';
import { seedListeningRequest } from './listening-authoring-fixture.mjs';

test('Terra API fixture and Queue delivery replay save a Deutsch lesson with four playable WAV files', async t => {
  const raw = JSON.parse(readFileSync(new URL('./fixtures/qwen/l4-listening-sample.json', import.meta.url))).listeningSample;
  raw.explorations[0].lesson = JSON.parse(readFileSync(new URL('../fixtures/lessons/deutsch-listening.json', import.meta.url)));
  const db = memoryDb();
  t.after(() => db.sqlite.close());
  const { subject, learner, request } = await seedListeningRequest(db, { at: new Date() });
  const job = db.sqlite.prepare('SELECT job_id FROM learner_requests WHERE id=?').get(request.id);
  const objects = new Map();
  const env = {
    ENVIRONMENT: 'staging', DB: db, OPENAI_API_KEY: 'fixture-key',
    OPENAI_SUBJECT_IDS: subject.id, OPENAI_TTS_SUBJECT_IDS: subject.id,
    UPLOADS: {
      async put(key, bytes, options) {
        assert.equal(options.onlyIf.etagDoesNotMatch, '*');
        assert.equal(options.httpMetadata.contentType, 'audio/wav');
        if (objects.has(key)) return null;
        const object = { bytes, size: bytes.byteLength, customMetadata: options.customMetadata };
        objects.set(key, object);
        return object;
      },
      async head(key) { return objects.get(key) ?? null; },
      async get(key, { range } = {}) {
        const bytes = objects.get(key)?.bytes;
        return bytes && { body: range ? bytes.slice(range.offset, range.offset + range.length) : bytes };
      },
    },
  };
  let acks = 0;
  const batch = { messages: [{ body: { jobId: job.job_id }, ack: () => acks++, retry: () => assert.fail('Unexpected Queue retry') }] };
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
      Object.assign(result.explorations[0], { subjectId: subject.id, requestId: request.id });
      return Response.json({
        status: 'completed', model: body.model, usage: { input_tokens: 100, output_tokens: 100 },
        output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(result) }] }],
      });
    }
    assert.equal(url, 'https://api.openai.com/v1/audio/speech');
    assert.equal(body.response_format, 'pcm');
    assert.equal(body.speed, 0.8);
    const calls = voicesByText.get(body.input) ?? [];
    calls.push(body.voice);
    voicesByText.set(body.input, calls);
    return new Response(new Uint8Array(4800).fill(body.voice === 'marin' ? 11 : 23));
  };
  await consumeOpenAi(batch, env, systemPrompt, fetcher);
  const saved = await readJob(db, job.job_id);
  assert.equal(saved.status, 'succeeded', saved.error);
  assert.equal(saved.runner && JSON.parse(saved.runner).name, 'openai-staging');
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
    for (const [variant, src] of Object.entries(item.audio.src)) {
      const hash = src.split('/').at(-1);
      assert.equal(wavDurationMs(objects.get('audio/' + hash + '.wav').bytes), 1100);
      const response = await playAudio(db, env.UPLOADS, { id: learner },
        new Request('http://local.test' + src, { headers: { Range: 'bytes=44-45' } }), hash);
      assert.equal(response.status, 206);
      assert.equal(response.headers.get('content-type'), 'audio/wav');
      assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], variant === 'f' ? [11, 11] : [23, 23]);
    }
  }
  await consumeOpenAi(batch, env, systemPrompt, fetcher);
  assert.equal(terraCalls, 1);
  assert.equal(acks, 2);
  assert.equal(objects.size, 4);
  assert.deepEqual(JSON.parse((await readJob(db, job.job_id)).outcome), JSON.parse(saved.outcome));
});
