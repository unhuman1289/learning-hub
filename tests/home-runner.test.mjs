import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod/v4';
import { memoryDb } from './d1-adapter.mjs';
import { enqueue, queueSubmission } from '../lib/ai-jobs/queue.ts';
import { leaseJobs, readJob } from '../lib/ai-jobs/lease.ts';
import { applyResult } from '../lib/ai-jobs/result.ts';
import { saveDraft } from '../lib/lesson-v2/actions.ts';
import { submitLesson } from '../lib/evidence/submit.ts';
import { assessResult } from '../lib/contracts/ai-common.ts';
import { processJob, userPrompt, systemPrompt } from '../integrations/home-runner/job.mjs';
import { strictSchema, stripOptionalNulls, parseJsonReply } from '../integrations/home-runner/schema.mjs';
import { childEnv, codexEngine, qwenEngine } from '../integrations/home-runner/engines.mjs';
import { leaseRequest, pollDelay, parseEnvFile, runOnce } from '../integrations/home-runner/runner.mjs';
import { createHub } from '../integrations/home-runner/hub.mjs';

const now = new Date('2026-11-12T09:00:00Z'),
  subject = 'sub_bbbbbbbbbbbbbbbbbbbb',
  learner = 'profile-runner';
const client = {
  id: 'home-runner',
  keySha256: '0'.repeat(64),
  accessClientId: 'home-access-client',
  scopes: ['jobs:plan', 'jobs:assess', 'attachments:read'],
  purposes: ['daily', 'initial', 'request', 'submission', 'recheck'],
  triggers: ['scheduled', 'on_demand', 'deferred'],
  learnerIds: [learner],
};
const runner = { name: 'test', version: '1', model: 'none' };
const fixture = JSON.parse(readFileSync(new URL('../fixtures/lessons/deutsch-modalverb.json', import.meta.url), 'utf8'));

async function openSubmission() {
  const db = memoryDb();
  db.sqlite
    .prepare(
      "INSERT INTO user(id,name,email,email_verified,created_at,updated_at,role,status) VALUES(?,'R','r@example.test',1,1,1,'learner','active')",
    )
    .run(learner);
  db.sqlite
    .prepare("INSERT INTO learner_settings(user_id,daily_target_minutes,updated,role,display_name,preferences) VALUES(?,60,'t','adult','R','{}')")
    .run(learner);
  db.sqlite
    .prepare(
      "INSERT INTO subjects(id,learner_id,title,template,status,ai_enabled,goal,level,created_by,created_at,updated_at) VALUES(?,?,'Deutsch','skill','active',1,'B2','A2',?,'2026-11-01','2026-11-01')",
    )
    .run(subject, learner, learner);
  await enqueue(db, {}, { learnerId: learner, kind: 'plan', purpose: 'daily' }, now);
  const [planLease] = await leaseJobs(db, client, { kinds: ['plan'], max: 1, runner }, 'test', now);
  const ctx = JSON.parse((await readJob(db, planLease.jobId)).context_snapshot);
  const plan = {
    contract: 'plan-result/1',
    contextHash: ctx.contextHash,
    summary: 'Bài thử',
    subjects: ctx.subjects.map((s) => ({
      subjectId: s.subjectId,
      expectedRevision: s.revision,
      expectedOpenPrimaryLessonId: s.slot.openPrimaryLessonId,
      action: 'assign',
      reason: 'Bài thử',
      skillChanges: [{ op: 'add', key: 'modalverb-infinitiv', name: 'Modalverb', description: 'Vị trí động từ', pathOrder: 1, prerequisites: [] }],
      primaryLesson: structuredClone(fixture),
      reviewSet: null,
      masteryProposals: [],
      progressSummary: 'Thử',
      requestsHandled: [],
    })),
    explorations: [],
    usage: { model: 'none', inputTokens: 0, outputTokens: 0, ms: 0 },
  };
  assert.equal((await applyResult(db, client, planLease.jobId, planLease.leaseToken, plan, false, now)).status, 200);
  const lesson = db.sqlite.prepare('SELECT id FROM learning_lessons').get().id;
  await saveDraft(db, learner, lesson, { revision: 0, answers: { i3: { answer: 'Paul möchte einen Kuchen kaufen.' } } }, now);
  const sub = await submitLesson(
    db,
    learner,
    lesson,
    { clientSubmissionId: crypto.randomUUID(), draftRevision: 1, stage: 'guided', itemIds: ['i3'] },
    now,
  );
  await queueSubmission(db, {}, learner, sub.id, now);
  return { db, sub };
}

/** The real Hub logic behind the runner's hub interface. */
function memoryHub(db, { failAfterApply = false } = {}) {
  const calls = [];
  return {
    calls,
    lease: (input) => leaseJobs(db, client, input, 'test', now),
    context: async (lease) => JSON.parse((await readJob(db, lease.jobId)).context_snapshot),
    attachment: async () => {
      throw Error('no photos in this test');
    },
    heartbeat: async () => ({}),
    async result(lease, body, dryRun) {
      calls.push({ dryRun, body });
      const r = await applyResult(db, client, lease.jobId, lease.leaseToken, body, dryRun, now);
      if (failAfterApply && !dryRun && r.status === 200) {
        failAfterApply = false;
        throw Error('socket hang up');
      }
      return { status: r.status, body: r };
    },
    fail: async (lease, error, retryable) => (calls.push({ fail: error, retryable }), {}),
    state: async (id) => ({ status: (await readJob(db, id)).status }),
  };
}

function grade(context, { evidence } = {}) {
  const a = context.attempts.find((x) => !x.autoGrade);
  return {
    contract: 'assess-result/1',
    contextHash: 'sha256:' + '0'.repeat(64),
    summary: 'Câu viết đúng vị trí động từ.',
    grades: [
      {
        attemptId: a.attemptId,
        result: evidence ? 'partial' : 'correct',
        score: evidence ? 0.5 : 1,
        rubricScores: a.rubric.map((r) => ({ criterion: r.criterion, points: evidence ? 0 : r.points, max: r.points })),
        feedback: evidence ? 'Xem lại vị trí động từ.' : 'Đúng.',
        correction: a.answer,
        errors: evidence ? [{ skillId: a.skills[0], patternId: null, label: 'G: vị trí động từ', category: 'application', evidence }] : [],
        checkItem: null,
      },
    ],
    diagnosis: [],
    masteryProposals: [],
    errorPatternUpdates: [],
    reviewProposals: [],
    recheckDecision: null,
    usage: { model: '', inputTokens: 0, outputTokens: 0, ms: 0 },
  };
}
const fakeEngine = (name, replies, vision = false) => {
  const seen = [];
  return {
    name,
    vision,
    seen,
    available: async () => true,
    async run(input) {
      seen.push(input);
      const next = replies.shift();
      if (next instanceof Error) throw next;
      return { json: next(JSON.parse(input.user.split('\n')[2])), usage: { model: name + ':m', inputTokens: 10, outputTokens: 5, ms: 7 } };
    },
  };
};

test('a Qwen grade passes the dry run, is saved, verified and reports the engine', async () => {
  const { db, sub } = await openSubmission();
  const hub = memoryHub(db);
  const [lease] = await hub.lease({ kinds: ['assess'], max: 1, runner });
  const qwen = fakeEngine('qwen', [(c) => grade(c)]);
  const out = await processJob(hub, lease, qwen);
  assert.deepEqual(out, { jobId: lease.jobId, status: 'succeeded', engine: 'qwen' });
  assert.equal(db.sqlite.prepare('SELECT status FROM submissions WHERE id=?').get(sub.id).status, 'graded');
  assert.equal(JSON.parse(db.sqlite.prepare('SELECT usage FROM ai_jobs WHERE id=?').get(lease.jobId).usage).model, 'qwen:m');
  assert.deepEqual(
    hub.calls.map((c) => c.dryRun),
    [true, false],
  );
  db.sqlite.close();
});

test('a 422 from the dry run goes back to the engine once with the error codes', async () => {
  const { db } = await openSubmission();
  const hub = memoryHub(db);
  const [lease] = await hub.lease({ kinds: ['assess'], max: 1, runner });
  const qwen = fakeEngine('qwen', [(c) => grade(c, { evidence: 'không có trong bài' }), (c) => grade(c)]);
  const out = await processJob(hub, lease, qwen);
  assert.equal(out.status, 'succeeded');
  assert.equal(qwen.seen.length, 2);
  assert.match(qwen.seen[1].user, /Lần trước bị từ chối/);
  db.sqlite.close();
});

test('Qwen without vision leaves photos with the Hub', async () => {
  let failed;
  const hub = {
    context: async () => ({ attempts: [{ attachments: [{ expired: false }] }] }),
    fail: async (lease, reason) => { failed = reason; },
  };
  const result = await processJob(hub, { jobId: 'job_photo' }, { vision: false });
  assert.equal(result.status, 'returned');
  assert.match(failed, /chưa hỗ trợ chấm ảnh/);
});

test('an uncertain network failure after saving is verified, not resent with other data', async () => {
  const { db } = await openSubmission();
  const hub = memoryHub(db, { failAfterApply: true });
  const [lease] = await hub.lease({ kinds: ['assess'], max: 1, runner });
  const out = await processJob(hub, lease, fakeEngine('qwen', [(c) => grade(c)]));
  assert.equal(out.status, 'succeeded');
  assert.equal(hub.calls.filter((c) => c.dryRun === false).length, 1);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM grades WHERE grader='ai'").get().n, 1);
  db.sqlite.close();
});

test('when Qwen fails the job goes back to the Hub queue with only a short reason', async () => {
  const { db } = await openSubmission();
  const hub = memoryHub(db);
  const [lease] = await hub.lease({ kinds: ['assess'], max: 1, runner });
  const out = await processJob(hub, lease, fakeEngine('qwen', [Error('down')]));
  assert.equal(out.status, 'failed');
  assert.deepEqual(hub.calls.at(-1), { fail: 'qwen: down', retryable: true });
  db.sqlite.close();
});

test('runOnce leases nothing when no engine answers and asks only for work it can do', async () => {
  const hub = { lease: async (input) => ((hub.input = input), []) };
  const none = { available: async () => false };
  assert.deepEqual(await runOnce(hub, none), { idle: true, reason: 'no_engine' });
  const up = { available: async () => true, vision: false };
  await runOnce(hub, up);
  assert.deepEqual(hub.input.purposes, ['submission', 'recheck', 'request', 'initial']);
  assert.deepEqual(hub.input.kinds, ['assess', 'plan']);
  assert.deepEqual(hub.input.capabilities, ['adaptive-plan', 'local-grading']);
});

test('lease requests, poll schedule and env file parsing', () => {
  const all = leaseRequest({ vision: true });
  assert.deepEqual(all.purposes, ['submission', 'recheck', 'request', 'initial']);
  assert.deepEqual(all.kinds, ['assess', 'plan']);
  assert.deepEqual(all.capabilities, ['adaptive-plan', 'local-grading', 'vision']);
  assert.deepEqual(all.triggers, ['on_demand', 'deferred']);
  assert.equal(all.runner.model, 'qwen');
  const nightly = leaseRequest({ vision: false }, { daily: true });
  assert.deepEqual(nightly.purposes, ['submission', 'recheck', 'request', 'initial', 'daily']);
  assert.deepEqual(nightly.triggers, ['on_demand', 'deferred', 'scheduled']);
  assert.deepEqual(nightly.capabilities, ['adaptive-plan', 'local-grading']);
  assert.equal(pollDelay(new Date('2026-11-12T09:00:00Z')), 15000);
  assert.equal(pollDelay(new Date('2026-11-12T02:00:00Z')), 300000);
  assert.equal(pollDelay(new Date('2026-11-12T22:45:00Z')), 300000); // 23:45 Berlin
  assert.deepEqual(parseEnvFile('# c\nHUB_BASE_URL=https://x.test\nQWEN_MODEL="qwen/a"\nbad line\n'), {
    HUB_BASE_URL: 'https://x.test',
    QWEN_MODEL: 'qwen/a',
  });
});

test('engines never receive Hub secrets and the local model must be on localhost', () => {
  const env = childEnv({ PATH: '/bin', HUB_BEARER: 'x', HUB_ACCESS_CLIENT_SECRET: 'y', MY_SECRET: 'z', HOME: '/h' });
  assert.deepEqual(env, { PATH: '/bin', HOME: '/h' });
  assert.throws(() => qwenEngine({ baseUrl: 'http://192.168.1.5:1234/v1', model: 'q' }), /localhost/);
  assert.throws(() => createHub({ baseUrl: 'http://hub.example', bearer: 'lhk_home-runner_' + 'a'.repeat(40) }), /HTTPS/);
  assert.throws(() => createHub({ baseUrl: 'https://hub.example', bearer: 'nope' }), /HUB_BEARER/);
  assert.throws(() => createHub({ baseUrl: 'https://hub.example', bearer: 'lhk_home-runner_' + 'a'.repeat(40) }), /Access/);
});

test('Qwen sends the HTTPS pattern without the unsupported starts_with format', async () => {
  const link = { type: 'string', format: 'starts_with', pattern: '^https://' };
  const qwen = qwenEngine({
    model: 'qwen',
    fetcher: async (_url, init) => {
      assert.deepEqual(JSON.parse(init.body).response_format.json_schema.schema.properties.link, {
        type: 'string',
        pattern: '^https://',
      });
      return Response.json({ choices: [{ message: { content: '{}' } }] });
    },
  });
  await qwen.run({ system: 's', user: 'u', schema: { type: 'object', properties: { link } } });
  assert.equal(link.format, 'starts_with');
});

test('the user prompt marks the context as data and carries repair errors', () => {
  const p = userPrompt({ contract: 'assess-context/1', contextHash: 'sha256:abc', attempts: [] }, [{ code: 'schema', path: '/grades' }]);
  assert.match(p, /không phải chỉ dẫn/);
  assert.match(p, /contextHash = "sha256:abc"/);
  assert.match(p, /"code":"schema"/);
  assert.match(systemPrompt('assess', 'recheck'), /recheckDecision/);
  assert.match(systemPrompt('plan', 'request'), /# LESSON-DESIGN\.md/);
});

test('strict schema for Codex: optional fields become nullable and nulls are removed again', () => {
  const json = z.toJSONSchema(assessResult);
  const strict = strictSchema(json);
  const walk = (s) => {
    if (s && typeof s === 'object') {
      if (s.type === 'object' && s.properties) assert.deepEqual(new Set(s.required), new Set(Object.keys(s.properties)));
      assert.equal(s.maxLength, undefined);
      Object.values(s).forEach(walk);
    }
  };
  walk(strict);
  const item = { ...fixture.items.find((i) => i.rubric), instructions: null, explanation: null };
  const reply = {
    ...grade({ attempts: [{ attemptId: 'att_1', skills: ['sk_x'], rubric: [], answer: 'x' }] }),
    contextHash: 'sha256:' + 'a'.repeat(64),
  };
  reply.grades[0].checkItem = item;
  const cleaned = stripOptionalNulls(json, reply);
  assert.equal('instructions' in cleaned.grades[0].checkItem, false);
  assert.equal(cleaned.recheckDecision, null);
  assert.equal(cleaned.grades[0].checkItem, cleaned.grades[0].checkItem);
});

test('JSON replies survive reasoning blocks and fences', () => {
  assert.deepEqual(parseJsonReply('<think>hmm {no}</think>\n```json\n{"a":1}\n```'), { a: 1 });
  assert.throws(() => parseJsonReply('nothing here'), /no JSON/);
});

test('codex engine runs exec with an output schema in a private temp dir and reads the last message', async () => {
  let seen;
  const engine = codexEngine({
    model: 'gpt-x',
    env: { PATH: '/bin', HUB_BEARER: 'secret' },
    runner: async (bin, args, opts) => {
      seen = { bin, args, opts };
      if (args[0] === 'exec') writeFileSync(args[args.indexOf('-o') + 1], '{"ok":true,"extra":null}');
    },
  });
  const out = await engine.run({
    system: 'S',
    user: 'U',
    schema: { type: 'object', properties: { ok: { type: 'boolean' }, extra: { type: 'string' } }, required: ['ok'] },
  });
  assert.deepEqual(out.json, { ok: true });
  assert.equal(seen.bin, 'codex');
  for (const flag of ['exec', '--skip-git-repo-check', '--ephemeral', '-o', '-m']) assert(seen.args.includes(flag), flag);
  assert(!seen.args.includes('--output-schema'));
  assert.match(seen.opts.input, /^S\n\nU\n\nJSON Schema/);
  assert.equal(seen.args[seen.args.indexOf('--sandbox') + 1], 'read-only');
  assert.equal(seen.opts.env.HUB_BEARER, undefined);
});

test('reference hygiene: invented pattern ids become null and each answer keeps one grade', async () => {
  const { normalizeAssess } = await import('../integrations/home-runner/job.mjs');
  const context = {
    purpose: 'submission',
    attempts: [
      { attemptId: 'att_a', autoGrade: null },
      { attemptId: 'att_auto', autoGrade: { result: 'incorrect' } },
    ],
    openErrorPatterns: [{ patternId: 'err_known' }],
  };
  const out = normalizeAssess(
    {
      grades: [
        { attemptId: 'att_a', result: 'partial', errors: [{ patternId: 'modalverb-word-order' }, { patternId: 'err_known' }, { patternId: null }] },
        { attemptId: 'att_a', result: 'correct', errors: [] },
        { attemptId: 'att_auto', result: 'correct', errors: [] },
        { attemptId: 'att_ghost', result: 'correct', errors: [] },
      ],
      diagnosis: [{ attemptId: 'att_auto', errors: [{ patternId: 'made-up' }] }],
      errorPatternUpdates: [{ patternId: 'err_known' }, { patternId: 'nope' }],
    },
    context,
  );
  assert.deepEqual(
    out.grades.map((g) => [g.attemptId, g.result]),
    [['att_a', 'partial']],
  );
  assert.deepEqual(
    out.grades[0].errors.map((e) => e.patternId),
    [null, 'err_known', null],
  );
  assert.equal(out.diagnosis[0].errors[0].patternId, null);
  assert.deepEqual(
    out.errorPatternUpdates.map((u) => u.patternId),
    ['err_known'],
  );
});

test('Drive copy: once per Berlin day after 03:00, atomic files, only listed profiles', async () => {
  const { mirrorDue, mirrorHistory } = await import('../integrations/home-runner/mirror.mjs');
  const { mkdtemp, readFile, readdir, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  assert.equal(mirrorDue(null, new Date('2026-11-10T01:30:00Z')), null); // 02:30 Berlin
  assert.equal(mirrorDue(null, new Date('2026-11-10T02:30:00Z')), '2026-11-10');
  assert.equal(mirrorDue('2026-11-10', new Date('2026-11-10T20:00:00Z')), null);
  const dir = await mkdtemp(join(tmpdir(), 'lh-mirror-'));
  const asked = [];
  const hub = { history: async (id) => (asked.push(id), '# Lịch sử ' + id) };
  assert.equal(await mirrorHistory(hub, { dir, learnerIds: ['prf_a', '../evil', 'prf_b'] }), 2);
  assert.deepEqual(asked, ['prf_a', 'prf_b']);
  assert.deepEqual((await readdir(dir)).sort(), ['lich-su-prf_a.md', 'lich-su-prf_b.md']);
  assert.equal(await readFile(join(dir, 'lich-su-prf_a.md'), 'utf8'), '# Lịch sử prf_a');
  await rm(dir, { recursive: true });
});

test('after ChatGPT reports its usage limit Codex rests an hour so Qwen takes the work', async () => {
  let clock = 1_000_000;
  const engine = codexEngine({
    now: () => clock,
    env: {},
    runner: async (_bin, args) => {
      if (args[0] === '--version') return;
      throw Error("codex exited 1: ERROR: You've hit your usage limit.");
    },
  });
  assert.equal(await engine.available(), true);
  await assert.rejects(engine.run({ system: 's', user: 'u', schema: { type: 'object' } }), /usage limit/);
  assert.equal(await engine.available(), false);
  clock += 61 * 60000;
  assert.equal(await engine.available(), true);
});
