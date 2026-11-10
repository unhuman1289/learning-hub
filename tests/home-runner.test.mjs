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
import { processJob, engineChain, userPrompt, systemPrompt } from '../integrations/home-runner/job.mjs';
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
  const out = await processJob(hub, lease, { qwen, codex: null, claude: null });
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
  const out = await processJob(hub, lease, { qwen });
  assert.equal(out.status, 'succeeded');
  assert.equal(qwen.seen.length, 2);
  assert.match(qwen.seen[1].user, /Lần trước bị từ chối/);
  db.sqlite.close();
});

test('when Qwen fails the job falls through to Codex; on battery Qwen is skipped', async () => {
  const { db } = await openSubmission();
  const hub = memoryHub(db);
  const [lease] = await hub.lease({ kinds: ['assess'], max: 1, runner });
  const qwen = fakeEngine('qwen', [Error('model server down')]);
  const codex = fakeEngine('codex', [(c) => grade(c)], true);
  assert.equal((await processJob(hub, lease, { qwen, codex })).engine, 'codex');
  const context = { attempts: [] };
  assert.deepEqual(
    engineChain({ kind: 'assess', purpose: 'submission' }, context, { qwen, codex }, { onAC: false }).map((e) => e.name),
    ['codex'],
  );
  assert.deepEqual(
    engineChain({ kind: 'assess', purpose: 'recheck' }, context, { qwen, codex }, { onAC: true }).map((e) => e.name),
    ['codex'],
  );
  const photos = { attempts: [{ attachments: [{ attachmentId: 'img_1', expired: false }] }] };
  assert.deepEqual(
    engineChain({ kind: 'assess', purpose: 'submission' }, photos, { qwen, codex }, { onAC: true }).map((e) => e.name),
    ['codex'],
  );
  db.sqlite.close();
});

test('an uncertain network failure after saving is verified, not resent with other data', async () => {
  const { db } = await openSubmission();
  const hub = memoryHub(db, { failAfterApply: true });
  const [lease] = await hub.lease({ kinds: ['assess'], max: 1, runner });
  const out = await processJob(hub, lease, { qwen: fakeEngine('qwen', [(c) => grade(c)]) });
  assert.equal(out.status, 'succeeded');
  assert.equal(hub.calls.filter((c) => c.dryRun === false).length, 1);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM grades WHERE grader='ai'").get().n, 1);
  db.sqlite.close();
});

test('when every engine fails the job is failed without retry and gives only a short reason', async () => {
  const { db } = await openSubmission();
  const hub = memoryHub(db);
  const [lease] = await hub.lease({ kinds: ['assess'], max: 1, runner });
  const out = await processJob(hub, lease, { qwen: fakeEngine('qwen', [Error('down')]), codex: fakeEngine('codex', [Error('quota')], true) });
  assert.equal(out.status, 'failed');
  assert.deepEqual(hub.calls.at(-1), { fail: 'codex: quota', retryable: false });
  db.sqlite.close();
});

test('runOnce leases nothing when no engine answers and asks only for work it can do', async () => {
  const hub = { lease: async (input) => ((hub.input = input), []) };
  const none = { available: async () => false };
  assert.deepEqual(await runOnce(hub, { qwen: none, codex: none, claude: none }, { power: async () => true }), { idle: true, reason: 'no_engine' });
  const up = { available: async () => true, vision: false };
  await runOnce(hub, { qwen: up, codex: null, claude: null }, { power: async () => true });
  assert.deepEqual(hub.input.purposes, ['submission']);
  assert.deepEqual(hub.input.kinds, ['assess']);
  assert.deepEqual(hub.input.capabilities, []);
});

test('lease requests, poll schedule and env file parsing', () => {
  assert.equal(leaseRequest({ qwen: true, codex: false, claude: false }, false), null);
  const all = leaseRequest({ qwen: true, codex: true, claude: false }, true);
  assert.deepEqual(all.purposes, ['submission', 'recheck', 'request', 'initial']);
  assert.deepEqual(all.kinds, ['assess', 'plan']);
  assert.deepEqual(all.capabilities, ['vision']);
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
