import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { memoryDb } from './d1-adapter.mjs';
import { enqueue, queueSubmission, queueDaily, dispatchJob } from '../lib/ai-jobs/queue.ts';
import { refreshSkills } from '../lib/learner-model/nightly.ts';
import { createDispute, escalateDispute, resolveDispute } from '../lib/disputes/service.ts';
import { createRequest, parseRequest } from '../lib/requests/service.ts';
import { leaseJobs, leasedJob, heartbeat, maintainJobs, readJob } from '../lib/ai-jobs/lease.ts';
import { applyResult } from '../lib/ai-jobs/result.ts';
import { saveDraft } from '../lib/lesson-v2/actions.ts';
import { submitLesson } from '../lib/evidence/submit.ts';
import { authorizeAutomation, sha256Hex } from '../lib/auth/automation.ts';
import { canonical, contextHash } from '../lib/ai-jobs/context/common.ts';
import { sendAlertDigest } from '../lib/alerts.ts';
import { createSubject } from '../lib/subjects/service.ts';
import { parseSubjectInput } from '../lib/subjects/policy.ts';
const now = new Date('2026-10-13T07:30:00Z'),
  subject = 'sub_aaaaaaaaaaaaaaaaaaaa',
  learner = 'private-real-learner-id';
const client = {
  id: 'test-runner',
  keySha256: '0'.repeat(64),
  accessClientId: 'test-access-client',
  scopes: ['jobs:plan', 'jobs:assess', 'attachments:read'],
  purposes: ['daily', 'initial', 'request', 'submission', 'recheck'],
  triggers: ['scheduled', 'on_demand', 'deferred'],
  learnerIds: [learner],
};
const fixture = JSON.parse(readFileSync(new URL('../fixtures/lessons/deutsch-modalverb.json', import.meta.url), 'utf8'));
function seed() {
  const db = memoryDb();
  db.sqlite
    .prepare(
      "INSERT INTO user(id,name,email,email_verified,created_at,updated_at,role,status) VALUES(?,'Test adult','learner@example.test',1,1,1,'learner','active')",
    )
    .run(learner);
  db.sqlite
    .prepare(
      "INSERT INTO learner_settings(user_id,daily_target_minutes,updated,role,display_name,preferences) VALUES(?,60,'t','adult','Học thử','{}')",
    )
    .run(learner);
  db.sqlite
    .prepare(
      "INSERT INTO subjects(id,learner_id,title,template,status,ai_enabled,goal,level,created_by,created_at,updated_at,legacy_track) VALUES(?,?,'Deutsch','skill','active',1,'A2 → B2; viết và nói','A2',?,'2026-10-01','2026-10-01','Deutsch')",
    )
    .run(subject, learner, learner);
  return db;
}
const input = { kinds: ['plan'], max: 1, runner: { name: 'fake', version: '1', model: 'none' } };
async function leasePlan(db) {
  const q = await enqueue(db, {}, { learnerId: learner, kind: 'plan', purpose: 'daily' }, now);
  const [lease] = await leaseJobs(db, client, input, 'test', now);
  assert.equal(q.id, lease.jobId);
  const job = await readJob(db, lease.jobId);
  return { lease, context: JSON.parse(job.context_snapshot) };
}
function plan(context, lesson = structuredClone(fixture)) {
  return {
    contract: 'plan-result/1',
    contextHash: context.contextHash,
    summary: 'Bài thử được soạn từ fixture',
    subjects: context.subjects.map((s) => ({
      subjectId: s.subjectId,
      expectedRevision: s.revision,
      expectedOpenPrimaryLessonId: s.slot.openPrimaryLessonId,
      action: lesson ? 'assign' : 'no_action',
      reason: 'Bài thử',
      skillChanges: lesson
        ? [{ op: 'add', key: 'modalverb-infinitiv', name: 'Modalverb', description: 'Vị trí động từ', pathOrder: 1, prerequisites: [] }]
        : [],
      primaryLesson: lesson,
      reviewSet: null,
      masteryProposals: [],
      progressSummary: 'Đang thử luồng',
      requestsHandled: [],
    })),
    explorations: [],
    usage: { model: 'none', inputTokens: 0, outputTokens: 0, ms: 0 },
  };
}
async function assigned() {
  const db = seed(),
    { lease, context } = await leasePlan(db),
    result = plan(context);
  const applied = await applyResult(db, client, lease.jobId, lease.leaseToken, result, false, now);
  assert.equal(applied.status, 200);
  const lesson = db.sqlite.prepare('SELECT id FROM learning_lessons').get().id;
  return { db, lease, context, result, lesson };
}

test('queue deduplicates, caps total jobs, and stores no lesson data in dispatch', async () => {
  const db = seed();
  const a = await enqueue(db, { AI_JOBS_DAILY_CAP: '1' }, { learnerId: learner, kind: 'plan', purpose: 'daily' }, now);
  const b = await enqueue(db, { AI_JOBS_DAILY_CAP: '1' }, { learnerId: learner, kind: 'plan', purpose: 'daily' }, now);
  assert.equal(a.id, b.id);
  assert.equal(b.created, false);
  await assert.rejects(
    enqueue(db, { AI_JOBS_DAILY_CAP: '1' }, { learnerId: learner, kind: 'plan', purpose: 'initial', subjectId: subject }, now),
    (e) => e.status === 429,
  );
  db.sqlite.close();
});
test('context includes actual goals, anonymizes learner and stable canonical hash', async () => {
  const db = seed(),
    { context } = await leasePlan(db);
  assert.equal(context.subjects[0].goal, 'A2 → B2; viết và nói');
  assert(!JSON.stringify(context).includes(learner));
  assert(!JSON.stringify(context).includes('learner@example.test'));
  assert.equal(await contextHash({ b: 1, a: 2 }), await contextHash({ a: 2, b: 1 }));
  assert.equal(canonical({ x: 1, y: [2, 3] }), '{"x":1,"y":[2,3]}');
  db.sqlite.close();
});
test('two concurrent leases cannot own same job; disallowed purposes/scopes are refused', async () => {
  const db = seed();
  await enqueue(db, {}, { learnerId: learner, kind: 'plan', purpose: 'daily' }, now);
  const results = await Promise.all([leaseJobs(db, client, input, 'test', now), leaseJobs(db, { ...client, id: 'other' }, input, 'test', now)]);
  assert.equal(results.flat().length, 1);
  await assert.rejects(leaseJobs(db, { ...client, scopes: ['jobs:assess'] }, input, 'test', now), (e) => e.status === 403);
  db.sqlite.close();
});
test('a client restricted to a test learner cannot claim another account job', async () => {
  const db = seed();
  await enqueue(db, {}, { learnerId: learner, kind: 'plan', purpose: 'daily' }, now);
  assert.deepEqual(await leaseJobs(db, { ...client, learnerIds: ['someone-else'] }, input, 'test', now), []);
  db.sqlite.close();
});
test('heartbeat cannot extend past hard bound and wrong token cannot read context', async () => {
  const db = seed(),
    { lease } = await leasePlan(db);
  await assert.rejects(leasedJob(db, client, lease.jobId, 'wrong', now), (e) => e.status === 401);
  await heartbeat(db, client, lease.jobId, lease.leaseToken, new Date(now.getTime() + 50 * 60000));
  const h = await heartbeat(db, client, lease.jobId, lease.leaseToken, new Date(now.getTime() + 105 * 60000));
  assert.equal(Date.parse(h.leaseExpiresAt), now.getTime() + 120 * 60000);
  db.sqlite.close();
});
test('expired leases retry at most 3 times, then fail', async () => {
  const db = seed(),
    { lease } = await leasePlan(db);
  for (let n = 1; n <= 3; n++) {
    const time = new Date(now.getTime() + n * 61 * 60000);
    await maintainJobs(db, time);
    if (n < 3) assert.equal((await leaseJobs(db, client, input, 'test', time)).length, 1);
  }
  assert.equal((await readJob(db, lease.jobId)).status, 'failed');
  db.sqlite.close();
});
test('on-demand waiting 15 minutes becomes deferred and loses priority', async () => {
  const db = seed();
  const q = await enqueue(db, {}, { learnerId: learner, kind: 'assess', purpose: 'submission', refId: 'submission-test' }, now);
  await maintainJobs(db, new Date(now.getTime() + 16 * 60000));
  const job = await readJob(db, q.id);
  assert.equal(job.trigger, 'deferred');
  assert.equal(db.sqlite.prepare('SELECT priority FROM ai_jobs WHERE id=?').get(q.id).priority, 20);
  db.sqlite.close();
});
test('dry-run writes nothing; application preserves history and replay returns same outcome', async () => {
  const db = seed(),
    { lease, context } = await leasePlan(db),
    result = plan(context);
  const dry = await applyResult(db, client, lease.jobId, lease.leaseToken, result, true, now);
  assert.equal(dry.status, 200);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM learning_lessons').get().n, 0);
  const first = await applyResult(db, client, lease.jobId, lease.leaseToken, result, false, now);
  assert.equal(first.outcome.subjects[0].status, 'applied');
  assert.equal(first.outcome.subjects[0].lessonIds.length, 1);
  const replay = await applyResult(db, client, lease.jobId, lease.leaseToken, result, false, now);
  assert.deepEqual(replay.outcome, first.outcome);
  assert.equal(replay.replayed, true);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM learning_lessons').get().n, 1);
  await assert.rejects(
    applyResult(db, client, lease.jobId, lease.leaseToken, { ...result, summary: 'different' }, false, now),
    (e) => e.status === 409,
  );
  db.sqlite.close();
});
test('a changed notebook is stale while another notebook is still applied', async () => {
  const db = seed();
  const second = 'sub_bbbbbbbbbbbbbbbbbbbb';
  db.sqlite
    .prepare(
      "INSERT INTO subjects(id,learner_id,title,template,status,ai_enabled,created_by,created_at,updated_at) VALUES(?,?,'Deutsch 2','skill','active',1,?,'t','t')",
    )
    .run(second, learner, learner);
  const { lease, context } = await leasePlan(db),
    result = plan(context);
  db.sqlite.prepare('UPDATE subjects SET revision=revision+1 WHERE id=?').run(subject);
  const r = await applyResult(db, client, lease.jobId, lease.leaseToken, result, false, now);
  assert.equal(r.outcome.subjects.find((x) => x.subjectId === subject).status, 'stale');
  assert.equal(r.outcome.subjects.find((x) => x.subjectId === second).status, 'applied');
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM learning_lessons').get().n, 1);
  db.sqlite.close();
});
for (const [code, mutate] of [
  [
    'schema',
    (r) => {
      r.contract = 'bad';
    },
  ],
  [
    'unknown_reference',
    (r) => {
      r.subjects[0].primaryLesson.targetSkills = ['sk_unknown123'];
    },
  ],
  [
    'over_budget',
    (r) => {
      r.subjects[0].primaryLesson.estMinutes = 90;
      r.subjects[0].reviewSet = {
        ...structuredClone(fixture),
        kind: 'review',
        sheet: null,
        estMinutes: 10,
        // A review set from an AI runner holds 5–6 items (D20).
        items: fixture.items.slice(0, 6),
        stages: [{ stage: 'independent', itemIds: fixture.items.slice(0, 6).map((i) => i.id) }],
      };
    },
  ],
  [
    'difficulty_limit',
    (r) => {
      r.subjects[0].primaryLesson.items[0].difficulty = 5;
    },
  ],
  [
    'duplicate_item',
    (r) => {
      r.subjects[0].primaryLesson.items[1].prompt = r.subjects[0].primaryLesson.items[0].prompt;
    },
  ],
  [
    'privacy',
    (r) => {
      r.subjects[0].primaryLesson.items[0].prompt = 'Gửi thông tin đến patient@example.com';
    },
  ],
  [
    'skill_graph',
    (r) => {
      r.subjects[0].skillChanges[0].prerequisites = ['key:modalverb-infinitiv'];
    },
  ],
])
  test('invalid plan: ' + code, async () => {
    const db = seed(),
      { lease, context } = await leasePlan(db),
      r = plan(context);
    mutate(r);
    const x = await applyResult(db, client, lease.jobId, lease.leaseToken, r, true, now);
    assert.equal(x.status, 422);
    assert(
      x.errors.some((e) => e.code === code),
      JSON.stringify(x),
    );
    assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM learning_lessons').get().n, 0);
    assert.equal((await readJob(db, lease.jobId)).status, 'leased');
    db.sqlite.close();
  });
test('three validation failures finish a job without any assignments', async () => {
  const db = seed(),
    { lease } = await leasePlan(db);
  for (let n = 0; n < 5; n++) assert.equal((await applyResult(db, client, lease.jobId, lease.leaseToken, {}, true, now)).status, 422);
  assert.equal((await readJob(db, lease.jobId)).status, 'leased', 'dry runs do not count');
  for (let n = 0; n < 3; n++) assert.equal((await applyResult(db, client, lease.jobId, lease.leaseToken, {}, false, now)).status, 422);
  assert.equal((await readJob(db, lease.jobId)).status, 'failed');
  db.sqlite.close();
});
test('no_action is valid even when existing unfinished workload is over budget', async () => {
  const { db, lesson } = await assigned();
  const next = new Date('2026-10-14T07:30:00Z');
  db.sqlite.prepare('UPDATE learner_settings SET daily_target_minutes=5').run();
  const q = await enqueue(db, {}, { learnerId: learner, kind: 'plan', purpose: 'daily' }, next);
  const [lease] = await leaseJobs(db, client, input, 'test', next),
    job = await readJob(db, q.id),
    context = JSON.parse(job.context_snapshot);
  const r = await applyResult(db, client, lease.jobId, lease.leaseToken, plan(context, null), false, next);
  assert.equal(r.outcome.subjects[0].status, 'no_action');
  assert.equal(db.sqlite.prepare('SELECT id FROM learning_lessons').get().id, lesson);
  db.sqlite.close();
});
test('normal local bypass still needs bearer and never applies to remote staging/production', async () => {
  const secret = 'a'.repeat(40),
    bindings = { APP_ENV: 'local', ENVIRONMENT: 'local', AUTOMATION_CLIENTS: JSON.stringify([{ ...client, keySha256: await sha256Hex(secret) }]) };
  const auth = () => ({ authorization: 'Bearer lhk_test-runner_' + secret });
  assert(
    'client' in (await authorizeAutomation(new Request('http://localhost/api/automation/v2/schema', { headers: auth() }), bindings, 'jobs:plan')),
  );
  for (const environment of ['staging', 'production'])
    assert.equal(
      (
        await authorizeAutomation(
          new Request('https://host.workers.dev/api/automation/v2/schema', { headers: auth() }),
          { ...bindings, ENVIRONMENT: environment },
          'jobs:plan',
        )
      ).response.status,
      503,
    );
  assert.equal((await authorizeAutomation(new Request('http://localhost/api/automation/v2/schema'), bindings, 'jobs:plan')).response.status, 401);
});
test('dispatch is authenticated with HMAC and includes only job metadata', async () => {
  let sent, queued;
  await dispatchJob(
    {
      AI_QUEUE: {
        send: async (x) => {
          queued = x;
        },
      },
      AI_DISPATCH_URL: 'https://runner.example.test/wake',
      AI_DISPATCH_SECRET: 'test-secret',
    },
    { id: 'job_test', kind: 'assess', purpose: 'submission', priority: 80 },
    now,
    async (url, init) => {
      sent = { url: String(url), ...init };
      return new Response('{}');
    },
  );
  assert.deepEqual(queued, { jobId: 'job_test', kind: 'assess', purpose: 'submission' });
  assert.match(sent.headers['X-LH-Signature'], /^sha256:[a-f0-9]{64}$|^sha256=[a-f0-9]{64}$/);
  assert(!sent.body.includes(learner));
});
test('local-only jobs remain queued for the runner without external dispatch', async () => {
  const sent = [];
  const job = await enqueue(seed(), {
    AI_LOCAL_ONLY: 'true',
    AI_QUEUE: { send: async () => { sent.push('queue'); } },
    EVENT_DISPATCHER: { dispatch: async () => { sent.push('event'); return { delivered: 1 }; } },
  }, { learnerId: learner, kind: 'plan', purpose: 'initial', subjectId: subject }, now);
  assert.equal(job.status, 'queued');
  assert.deepEqual(sent, []);
});

test('closed-only one wrong submission skips AI; open answers queue assess', async () => {
  const { db, lesson } = await assigned();
  await saveDraft(
    db,
    learner,
    lesson,
    { revision: 0, answers: { i1: { answer: '["b"]' }, i3: { answer: 'Paul möchte einen Kuchen kaufen.' } } },
    now,
  );
  const closed = await submitLesson(
    db,
    learner,
    lesson,
    { clientSubmissionId: crypto.randomUUID(), draftRevision: 1, stage: 'retrieval', itemIds: ['i1'] },
    now,
  );
  assert.equal(await queueSubmission(db, {}, learner, closed.id, now), null);
  const open = await submitLesson(
    db,
    learner,
    lesson,
    { clientSubmissionId: crypto.randomUUID(), draftRevision: 1, stage: 'guided', itemIds: ['i3'] },
    now,
  );
  const q = await queueSubmission(db, {}, learner, open.id, now);
  assert(q.id);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM skill_states').get().n, 1);
  db.sqlite.close();
});

test('open-answer assess is atomic, rubric grounded, and replay does not add grades', async () => {
  const { db, lesson } = await assigned();
  await saveDraft(db, learner, lesson, { revision: 0, answers: { i3: { answer: 'Paul möchte einen Kuchen kaufen.' } } }, now);
  const sub = await submitLesson(
    db,
    learner,
    lesson,
    { clientSubmissionId: crypto.randomUUID(), draftRevision: 1, stage: 'guided', itemIds: ['i3'] },
    now,
  );
  await queueSubmission(db, {}, learner, sub.id, now);
  const [lease] = await leaseJobs(db, client, { ...input, kinds: ['assess'] }, 'test', now),
    job = await readJob(db, lease.jobId),
    context = JSON.parse(job.context_snapshot),
    attempt = context.attempts[0];
  const result = {
    contract: 'assess-result/1',
    contextHash: context.contextHash,
    summary: 'Bài thử',
    grades: [
      {
        attemptId: attempt.attemptId,
        result: 'correct',
        score: 1,
        rubricScores: attempt.rubric.map((r) => ({ criterion: r.criterion, points: r.points, max: r.points })),
        feedback: 'Đúng trong bài thử.',
        correction: attempt.answer,
        errors: [],
        checkItem: null,
      },
    ],
    diagnosis: [],
    masteryProposals: [],
    errorPatternUpdates: [],
    reviewProposals: [],
    recheckDecision: null,
    usage: { model: 'none', inputTokens: 0, outputTokens: 0, ms: 0 },
  };
  const dry = await applyResult(db, client, job.id, lease.leaseToken, result, true, now);
  assert.equal(dry.status, 200);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM grades WHERE grader='ai'").get().n, 0);
  const applied = await applyResult(db, client, job.id, lease.leaseToken, result, false, now);
  assert.equal(applied.outcome.gradeIds.length, 1);
  assert.equal(db.sqlite.prepare('SELECT status FROM submissions WHERE id=?').get(sub.id).status, 'graded');
  assert.equal(db.sqlite.prepare('SELECT dim_application FROM skill_states').get().dim_application, 2);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM ai_apply_guards').get().n, 0);
  const replay = await applyResult(db, client, job.id, lease.leaseToken, result, false, now);
  assert.deepEqual(replay.outcome, applied.outcome);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM grades').get().n, 1);
  db.sqlite.close();
});
test('wrong evidence and missing open grades reject without any mutation', async () => {
  const { db, lesson } = await assigned();
  await saveDraft(db, learner, lesson, { revision: 0, answers: { i3: { answer: 'Paul möchte einen Kuchen kaufen.' } } }, now);
  const sub = await submitLesson(
    db,
    learner,
    lesson,
    { clientSubmissionId: crypto.randomUUID(), draftRevision: 1, stage: 'guided', itemIds: ['i3'] },
    now,
  );
  await queueSubmission(db, {}, learner, sub.id, now);
  const [lease] = await leaseJobs(db, client, { ...input, kinds: ['assess'] }, 'test', now),
    context = JSON.parse((await readJob(db, lease.jobId)).context_snapshot);
  const result = {
    contract: 'assess-result/1',
    contextHash: context.contextHash,
    summary: '',
    grades: [],
    diagnosis: [],
    masteryProposals: [],
    errorPatternUpdates: [],
    reviewProposals: [],
    recheckDecision: null,
    usage: { model: 'none', inputTokens: 0, outputTokens: 0, ms: 0 },
  };
  let x = await applyResult(db, client, lease.jobId, lease.leaseToken, result, true, now);
  assert(x.errors.some((e) => e.code === 'missing_grade'));
  const a = context.attempts[0];
  result.grades = [
    {
      attemptId: a.attemptId,
      result: 'incorrect',
      score: 0,
      rubricScores: a.rubric.map((r) => ({ criterion: r.criterion, points: 0, max: r.points })),
      feedback: 'Bài thử',
      correction: '',
      errors: [{ skillId: a.skills[0], label: 'Lỗi thử', category: 'application', evidence: 'invented quote' }],
      checkItem: null,
    },
  ];
  x = await applyResult(db, client, lease.jobId, lease.leaseToken, result, true, now);
  assert(x.errors.some((e) => e.code === 'schema'));
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM grades').get().n, 0);
  db.sqlite.close();
});
test('automatic grades are locked even when an assess job exists', async () => {
  const { db, lesson } = await assigned();
  await saveDraft(db, learner, lesson, { revision: 0, answers: { i1: { answer: '["a"]' }, i2: { answer: 'wrong' } } }, now);
  const sub = await submitLesson(
    db,
    learner,
    lesson,
    { clientSubmissionId: crypto.randomUUID(), draftRevision: 1, stage: 'retrieval', itemIds: ['i1', 'i2'] },
    now,
  );
  await queueSubmission(db, {}, learner, sub.id, now);
  const [lease] = await leaseJobs(db, client, { ...input, kinds: ['assess'] }, 'test', now),
    context = JSON.parse((await readJob(db, lease.jobId)).context_snapshot);
  const a = context.attempts[0],
    r = {
      contract: 'assess-result/1',
      contextHash: context.contextHash,
      summary: '',
      grades: [{ attemptId: a.attemptId, result: 'correct', score: 1, rubricScores: [], feedback: '', correction: '', errors: [], checkItem: null }],
      diagnosis: [],
      masteryProposals: [],
      errorPatternUpdates: [],
      reviewProposals: [],
      recheckDecision: null,
      usage: { model: 'none', inputTokens: 0, outputTokens: 0, ms: 0 },
    };
  const x = await applyResult(db, client, lease.jobId, lease.leaseToken, r, true, now);
  assert(x.errors.some((e) => e.code === 'auto_grade_locked'));
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM grades').get().n, 2);
  db.sqlite.close();
});
test('unfinished primary and existing review cannot be replaced', async () => {
  const { db } = await assigned(),
    next = new Date('2026-10-14T07:30:00Z');
  await enqueue(db, {}, { learnerId: learner, kind: 'plan', purpose: 'daily' }, next);
  const [lease] = await leaseJobs(db, client, input, 'test', next),
    context = JSON.parse((await readJob(db, lease.jobId)).context_snapshot),
    r = plan(context);
  r.subjects[0].skillChanges = [];
  const x = await applyResult(db, client, lease.jobId, lease.leaseToken, r, true, next);
  assert(x.errors.some((e) => e.code === 'not_eligible'));
  db.sqlite.close();
});
test('completion after cutoff waits; undo changes the expected open lesson and stays stale', async () => {
  const { db, lesson } = await assigned();
  db.sqlite.prepare('UPDATE learning_lessons SET completed_at=? WHERE id=?').run('2026-10-14T04:00:00Z', lesson);
  const next = new Date('2026-10-14T07:30:00Z');
  await enqueue(db, {}, { learnerId: learner, kind: 'plan', purpose: 'daily' }, next);
  const [lease] = await leaseJobs(db, client, input, 'test', next),
    context = JSON.parse((await readJob(db, lease.jobId)).context_snapshot);
  assert.equal(context.subjects[0].slot.eligibleForPrimary, false);
  db.sqlite.prepare('UPDATE learning_lessons SET completed_at=NULL WHERE id=?').run(lesson);
  const r = plan(context);
  r.subjects[0].skillChanges = [];
  const x = await applyResult(db, client, lease.jobId, lease.leaseToken, r, false, next);
  assert.equal(x.outcome.subjects[0].status, 'stale');
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM learning_lessons').get().n, 1);
  db.sqlite.close();
});
test('privacy applies to preferences, not only goals and answers', async () => {
  const db = seed();
  db.sqlite
    .prepare('UPDATE learner_settings SET preferences=?')
    .run(JSON.stringify({ style: 'Send learner@example.test a message', nested: { text: learner } }));
  const { context } = await leasePlan(db);
  assert(!JSON.stringify(context).includes('learner@example.test'));
  assert(!JSON.stringify(context).includes(learner));
  db.sqlite.close();
});
test('admin alert emails are claimed once and include no learner answers', async () => {
  const db = seed();
  db.sqlite.prepare("UPDATE user SET role='admin'").run();
  db.sqlite
    .prepare(
      "INSERT INTO ai_jobs(id,kind,purpose,trigger,learner_id,learning_day,priority,status,dedupe_key,created_at,updated_at,expires_at) VALUES('job_failed','plan','daily','scheduled',?,'2026-10-13',40,'failed','test','t','t','z')",
    )
    .run(learner);
  let sent = 0;
  const mail = async () => {
    sent++;
    return new Response('{}');
  };
  await sendAlertDigest(db, { RESEND_API_KEY: 'test', EMAIL_FROM: 'Learning Hub <test@example.test>' }, new Date('2026-10-13T01:10:00Z'), mail);
  await sendAlertDigest(db, { RESEND_API_KEY: 'test', EMAIL_FROM: 'Learning Hub <test@example.test>' }, new Date('2026-10-13T01:10:00Z'), mail);
  assert.equal(sent, 1);
  db.sqlite.close();
});

test('06:00 missing-plan email is independent of an earlier daily digest, even if cron never created a job', async () => {
  const db = seed();
  db.sqlite.prepare("UPDATE user SET role='admin'").run();
  db.sqlite
    .prepare(
      "INSERT INTO ai_jobs(id,kind,purpose,trigger,learner_id,learning_day,priority,status,dedupe_key,created_at,updated_at,expires_at) VALUES('job_failed','assess','submission','on_demand',?,'2026-10-13',80,'failed','test','t','t','z')",
    )
    .run(learner);
  let sent = 0;
  const bindings = { RESEND_API_KEY: 'test', EMAIL_FROM: 'Learning Hub <test@example.test>' },
    mail = async () => {
      sent++;
      return new Response('{}');
    };
  await sendAlertDigest(db, bindings, new Date('2026-10-13T01:10:00Z'), mail);
  assert.equal(sent, 1);
  await sendAlertDigest(db, bindings, new Date('2026-10-13T04:00:00Z'), mail);
  assert.equal(sent, 2);
  await sendAlertDigest(db, bindings, new Date('2026-10-13T04:05:00Z'), mail);
  assert.equal(sent, 2);
  assert.equal(db.sqlite.prepare("SELECT email_state FROM alert_events WHERE code='nightly-plan-missing'").get().email_state, 'sent');
  db.sqlite.close();
});
test('uncertain email transmission is not retried, including new alerts later the same day', async () => {
  const db = seed();
  db.sqlite.prepare("UPDATE user SET role='admin'").run();
  let sent = 0;
  const bindings = { RESEND_API_KEY: 'test', EMAIL_FROM: 'Learning Hub <test@example.test>' },
    mail = async () => {
      sent++;
      throw Error('uncertain');
    };
  await sendAlertDigest(db, bindings, now, mail);
  await sendAlertDigest(db, bindings, now, mail);
  assert.equal(sent, 1);
  db.sqlite.close();
});

test('large plan context is deterministically truncated below 128KB and preserves active skills', async () => {
  const db = seed();
  for (let n = 1; n < 3; n++)
    db.sqlite
      .prepare(
        "INSERT INTO subjects(id,learner_id,title,template,status,ai_enabled,goal,level,created_by,created_at,updated_at) SELECT ?,learner_id,?,'skill','active',1,goal,level,created_by,created_at,updated_at FROM subjects WHERE id=?",
      )
      .run('sub_' + n.toString().repeat(20), 'QA ' + n, subject);
  for (const s of db.sqlite.prepare('SELECT id FROM subjects').all())
    for (let i = 0; i < 120; i++)
      db.sqlite
        .prepare(
          "INSERT INTO skills(id,subject_id,learner_id,key,name,path_order,status,origin,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'user','t','t')",
        )
        .run(
          'sk_' + (await sha256Hex(s.id + ':' + i)).slice(0, 20),
          s.id,
          learner,
          'qa-' + i,
          'QA skill'.padEnd(120, 'x'),
          i,
          i === 0 ? 'active' : 'planned',
        );
  const { context } = await leasePlan(db);
  assert(Buffer.byteLength(JSON.stringify(context)) <= 128 * 1024);
  assert(context.truncated.some((x) => x.startsWith('skill:')));
  assert.equal(context.subjects.length, 3);
  assert(context.subjects.every((s) => s.skills.some((sk) => sk.status === 'active')));
  assert(!JSON.stringify(context).includes(learner));
  db.sqlite.close();
});

test('replaying a graded submission keeps it graded and reuses its diagnosis job', async () => {
  const { db, lesson } = await assigned();
  await saveDraft(db, learner, lesson, { revision: 0, answers: { i1: { answer: '["a"]' }, i2: { answer: 'falsch' } } }, now);
  const request = { clientSubmissionId: crypto.randomUUID(), draftRevision: 1, stage: 'retrieval', itemIds: ['i1', 'i2'] };
  const sub = await submitLesson(db, learner, lesson, request, now);
  assert.equal(sub.status, 'graded');
  const first = await queueSubmission(db, {}, learner, sub.id, now);
  assert(first.id);
  const replay = await submitLesson(db, learner, lesson, request, now);
  assert.equal(replay.id, sub.id);
  const again = await queueSubmission(db, {}, learner, replay.id, now);
  assert.equal(again.id, first.id);
  const row = db.sqlite.prepare('SELECT status, ai_job_id FROM submissions WHERE id=?').get(sub.id);
  assert.deepEqual({ ...row }, { status: 'graded', ai_job_id: first.id });
  db.sqlite.close();
});

test('per-learner AI budget from settings limits on-demand assess jobs', async () => {
  const db = seed();
  db.sqlite.prepare('UPDATE learner_settings SET ai_budget=? WHERE user_id=?').run(JSON.stringify({ assessPerDay: 1 }), learner);
  const a = await enqueue(db, {}, { learnerId: learner, kind: 'assess', purpose: 'submission', refId: 'subm-1' }, now);
  const b = await enqueue(db, {}, { learnerId: learner, kind: 'assess', purpose: 'submission', refId: 'subm-2' }, now);
  assert.equal(a.trigger, 'on_demand');
  assert.equal(b.trigger, 'deferred');
  db.sqlite.close();
});

test('daily queueing continues past one notebook whose job cannot be created', async () => {
  const db = seed();
  const other = 'second-learner-id';
  db.sqlite
    .prepare(
      "INSERT INTO user(id,name,email,email_verified,created_at,updated_at,role,status) VALUES(?,'Other','other@example.test',1,1,1,'learner','active')",
    )
    .run(other);
  db.sqlite
    .prepare(
      "INSERT INTO subjects(id,learner_id,title,template,status,ai_enabled,created_by,created_at,updated_at) VALUES('sub_cccccccccccccccccccc',?,'Toán','skill','active',1,?,'t','t')",
    )
    .run(other, other);
  const summary = await queueDaily(db, { AI_JOBS_DAILY_CAP: '1' }, now);
  assert.deepEqual(summary, { subjects: 2, failed: 1 });
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM ai_jobs WHERE purpose='daily'").get().n, 1);
  db.sqlite.close();
});

test('nightly refresh keeps an AI review date while evidence is unchanged and stays bounded', async () => {
  const { db, lesson } = await assigned();
  await saveDraft(db, learner, lesson, { revision: 0, answers: { i1: { answer: '["b"]' } } }, now);
  await submitLesson(db, learner, lesson, { clientSubmissionId: crypto.randomUUID(), draftRevision: 1, stage: 'retrieval', itemIds: ['i1'] }, now);
  const skill = db.sqlite.prepare('SELECT skill_id FROM skill_states').get().skill_id;
  db.sqlite.prepare("UPDATE skill_states SET next_review_day='2026-10-15', review_source='ai', updated_at='2026-10-13T00:00:00Z'").run();
  const later = new Date('2026-10-16T02:00:00Z');
  const result = await refreshSkills(db, later, 1);
  assert.deepEqual(result, { refreshed: 1, failed: 0 });
  const state = db.sqlite.prepare('SELECT next_review_day, review_source, updated_at FROM skill_states WHERE skill_id=?').get(skill);
  assert.equal(state.next_review_day, '2026-10-15');
  assert.equal(state.review_source, 'ai');
  assert.equal(state.updated_at, later.toISOString());
  assert.deepEqual(await refreshSkills(db, later, 1), { refreshed: 0, failed: 0 }, 'a skill is refreshed once a day');
  db.sqlite.close();
});

async function gradedWrong() {
  const ctx = await assigned();
  await saveDraft(ctx.db, learner, ctx.lesson, { revision: 0, answers: { i1: { answer: '["a"]' } } }, now);
  const sub = await submitLesson(
    ctx.db,
    learner,
    ctx.lesson,
    { clientSubmissionId: crypto.randomUUID(), draftRevision: 1, stage: 'retrieval', itemIds: ['i1'] },
    now,
  );
  return { ...ctx, attempt: sub.attempts[0] };
}
const disputeInput = { reason: 'answer_correct', message: 'Mình nghĩ đáp án a cũng đúng.', recheck: true };

test('a dispute takes the answer out of the rules at once and cannot be opened twice', async () => {
  const { db, attempt } = await gradedWrong();
  const before = db.sqlite.prepare('SELECT attempts_total FROM skill_states').get().attempts_total;
  const dispute = await createDispute(db, {}, learner, learner, attempt.id, { ...disputeInput, recheck: false }, now);
  assert.equal(dispute.status, 'open');
  assert.equal(db.sqlite.prepare('SELECT status FROM attempts WHERE id=?').get(attempt.id).status, 'disputed');
  assert.equal(db.sqlite.prepare('SELECT attempts_total FROM skill_states').get().attempts_total, before - 1);
  await assert.rejects(createDispute(db, {}, learner, learner, attempt.id, disputeInput, now), (e) => e.status === 409);
  await assert.rejects(createDispute(db, {}, 'someone-else', 'someone-else', attempt.id, disputeInput, now), (e) => e.status === 404);
  db.sqlite.close();
});

test('AI recheck overturning an automatic grade supersedes it, flags the key and recomputes', async () => {
  const { db, attempt } = await gradedWrong();
  const dispute = await createDispute(db, {}, learner, learner, attempt.id, disputeInput, now);
  assert.equal(dispute.status, 'rechecking');
  const [lease] = await leaseJobs(db, { ...client }, { ...input, kinds: ['assess'] }, 'test', now);
  const job = await readJob(db, lease.jobId);
  assert.equal(job.purpose, 'recheck');
  const context = JSON.parse(job.context_snapshot);
  assert.deepEqual(
    context.attempts.map((a) => a.attemptId),
    [attempt.id],
  );
  const result = {
    contract: 'assess-result/1',
    contextHash: context.contextHash,
    summary: 'Chấm lại',
    grades: [
      {
        attemptId: attempt.id,
        result: 'correct',
        score: 1,
        rubricScores: [],
        feedback: 'Đáp án a cũng đúng.',
        correction: '',
        errors: [],
        checkItem: null,
      },
    ],
    diagnosis: [],
    masteryProposals: [],
    errorPatternUpdates: [],
    reviewProposals: [],
    recheckDecision: { decision: 'overturned', explanation: 'Đáp án gốc thiếu lựa chọn a.' },
    usage: { model: 'none', inputTokens: 0, outputTokens: 0, ms: 0 },
  };
  const applied = await applyResult(db, client, job.id, lease.leaseToken, result, false, now);
  assert.equal(applied.status, 200);
  const row = db.sqlite
    .prepare('SELECT a.status, g.grader, g.result FROM attempts a JOIN grades g ON g.id=a.current_grade_id WHERE a.id=?')
    .get(attempt.id);
  assert.deepEqual({ ...row }, { status: 'graded', grader: 'ai', result: 'correct' });
  assert.equal(
    db.sqlite
      .prepare('SELECT superseded_by FROM grades WHERE id=?')
      .get(attempt.current_grade_id ?? db.sqlite.prepare('SELECT grade_id FROM disputes').get().grade_id).superseded_by,
    applied.outcome.gradeIds[0],
  );
  assert.equal(db.sqlite.prepare("SELECT flag FROM lesson_items WHERE item_id='i1'").get().flag, 'key_issue');
  assert.equal(db.sqlite.prepare('SELECT status FROM disputes').get().status, 'overturned');
  // One AI recheck per answer: the next dispute goes to a person.
  const again = await createDispute(db, {}, learner, learner, attempt.id, disputeInput, now);
  assert.equal(again.status, 'needs_human');
  db.sqlite.close();
});

test('without recheck budget the dispute waits for a person; a guardian grade is final', async () => {
  const { db, attempt } = await gradedWrong();
  db.sqlite.prepare('UPDATE learner_settings SET ai_budget=? WHERE user_id=?').run(JSON.stringify({ recheckPerDay: 0 }), learner);
  const dispute = await createDispute(db, {}, learner, learner, attempt.id, disputeInput, now);
  assert.equal(dispute.status, 'needs_human');
  const resolved = await resolveDispute(
    db,
    learner,
    dispute.id,
    { id: 'parent', asAdmin: false },
    { decision: 'set', result: 'correct', score: 1, feedback: 'Bố mẹ xem lại: đúng.', note: '' },
    now,
  );
  assert.equal(resolved.status, 'overturned');
  const row = db.sqlite.prepare('SELECT a.status, g.grader FROM attempts a JOIN grades g ON g.id=a.current_grade_id WHERE a.id=?').get(attempt.id);
  assert.deepEqual({ ...row }, { status: 'graded', grader: 'guardian' });
  await assert.rejects(
    resolveDispute(db, learner, dispute.id, { id: 'parent', asAdmin: false }, { decision: 'keep', note: '' }, now),
    (e) => e.status === 409,
  );
  db.sqlite.close();
});

test('voiding an item removes it from evidence', async () => {
  const { db, attempt } = await gradedWrong();
  const dispute = await createDispute(db, {}, learner, learner, attempt.id, { ...disputeInput, reason: 'item_wrong', recheck: false }, now);
  await escalateDispute(db, learner, dispute.id);
  await resolveDispute(db, learner, dispute.id, { id: 'admin', asAdmin: true }, { decision: 'void', note: 'Đề sai.' }, now);
  assert.equal(db.sqlite.prepare('SELECT status FROM attempts WHERE id=?').get(attempt.id).status, 'void');
  assert.equal(db.sqlite.prepare("SELECT flag FROM lesson_items WHERE item_id='i1'").get().flag, 'item_void');
  db.sqlite.close();
});

test('a question goes to its own plan job and becomes an exploration lesson in "Khám phá"', async () => {
  const db = seed();
  const request = await createRequest(
    db,
    {},
    learner,
    learner,
    parseRequest({ kind: 'explore', text: 'Warum steht das Verb am Ende?', urgency: 'tonight' }),
    now,
  );
  assert.equal(request.status, 'in_job');
  const [lease] = await leaseJobs(db, client, { ...input, kinds: ['plan'] }, 'test', now);
  const job = await readJob(db, lease.jobId);
  assert.deepEqual([job.purpose, job.trigger], ['request', 'deferred']);
  const context = JSON.parse(job.context_snapshot);
  assert.equal(context.explorations[0].requestId, request.id);
  const lesson = { ...structuredClone(fixture), kind: 'exploration' };
  const result = {
    ...plan(context),
    subjects: [],
    explorations: [{ requestId: request.id, action: 'assign', subjectId: null, lesson, reason: 'Câu hỏi hay.' }],
  };
  const applied = await applyResult(db, client, job.id, lease.leaseToken, result, false, now);
  assert.equal(applied.status, 200, JSON.stringify(applied.errors));
  assert.equal(applied.outcome.extraLessonIds.length,1);
  const saved = db.sqlite.prepare("SELECT l.slot, l.kind, s.title, s.system_kind FROM learning_lessons l JOIN subjects s ON s.id=l.subject_id").get();
  assert.deepEqual({ ...saved }, { slot: 'extra', kind: 'exploration', title: 'Khám phá', system_kind: 'explore' });
  const done = db.sqlite.prepare('SELECT status, result_lesson_id FROM learner_requests WHERE id=?').get(request.id);
  assert.equal(done.status, 'done');
  assert(done.result_lesson_id);
  db.sqlite.close();
});

test('a declined request keeps the reason for the asker; requests are rate limited', async () => {
  const db = seed();
  const request = await createRequest(
    db,
    {},
    learner,
    learner,
    parseRequest({ kind: 'extra_practice', subjectId: subject, text: 'Thêm bài Modalverb', urgency: 'now' }),
    now,
  );
  const [lease] = await leaseJobs(db, client, { ...input, kinds: ['plan'] }, 'test', now);
  const job = await readJob(db, lease.jobId);
  assert.deepEqual([job.purpose, job.trigger], ['request', 'on_demand']);
  const context = JSON.parse(job.context_snapshot);
  const result = {
    ...plan(context, null),
    explorations: [{ requestId: request.id, action: 'decline', subjectId: subject, lesson: null, reason: 'Hôm nay đã đủ bài; mai làm tiếp.' }],
  };
  result.subjects[0].action = 'no_action';
  assert.equal((await applyResult(db, client, job.id, lease.leaseToken, result, false, now)).status, 200);
  const row = db.sqlite.prepare('SELECT status, response_note FROM learner_requests WHERE id=?').get(request.id);
  assert.deepEqual({ ...row }, { status: 'declined', response_note: 'Hôm nay đã đủ bài; mai làm tiếp.' });
  for (let n = 1; n < 10; n++)
    await createRequest(db, {}, learner, learner, parseRequest({ kind: 'school_topic', subjectId: subject, text: 'Tuần này: Perfekt' }), now);
  await assert.rejects(
    createRequest(db, {}, learner, learner, parseRequest({ kind: 'note', subjectId: subject, text: 'Ít bài viết hơn' }), now),
    (e) => e.status === 429,
  );
  assert.throws(
    () => parseRequest({ kind: 'note', text: 'Không có sổ' }),
    (e) => e.status === 400,
  );
  db.sqlite.close();
});

test('roadmap saves 5–10 next steps atomically without assigning lessons; foreign skill refs are rejected',async()=>{
 const db=seed();
 db.sqlite.prepare("INSERT INTO skills(id,subject_id,learner_id,key,name,description,path_order,prerequisites,status,origin,created_at,updated_at) VALUES('sk_emails',?,?,'emails','Email','Viết email',1,'[]','active','ai','t','t')").run(subject,learner);
 const {lease,context}=await leasePlan(db),result=plan(context,null);
 result.subjects[0].roadmap=Array.from({length:5},(_,i)=>({title:`Email ${i+1}`,objective:'Xác nhận lịch',situation:'Công việc',skills:['sk_foreign'],mode:'mixed'}));
 assert.equal((await applyResult(db,client,lease.jobId,lease.leaseToken,result,true,now)).status,422);
 assert.equal(db.sqlite.prepare('SELECT roadmap FROM subjects WHERE id=?').get(subject).roadmap,'[]');
 result.subjects[0].roadmap=result.subjects[0].roadmap.map(s=>({...s,skills:['sk_emails']}));
 assert.equal((await applyResult(db,client,lease.jobId,lease.leaseToken,result,false,now)).status,200);
 const saved=JSON.parse(db.sqlite.prepare('SELECT roadmap FROM subjects WHERE id=?').get(subject).roadmap);
 assert.equal(saved.length,5);assert(saved[0].skills[0].startsWith('sk_'));
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM learning_lessons').get().n,0);
 db.sqlite.close();
});

test('legacy nightly skips an unfinished extra lesson even after the primary is complete', async () => {
  const { db, lesson } = await assigned();
  db.sqlite.prepare("UPDATE learning_lessons SET slot='extra' WHERE id=?").run(lesson);
  assert.deepEqual(await queueDaily(db, {}, now), { subjects: 0, failed: 0 });
  db.sqlite.prepare('UPDATE learning_lessons SET completed_at=? WHERE id=?').run(now.toISOString(), lesson);
  assert.deepEqual(await queueDaily(db, {}, now), { subjects: 1, failed: 0 });
  db.sqlite.close();
});

test('an over-budget request does not lease before the next Berlin day', async () => {
  const db = seed();
  db.sqlite.prepare('UPDATE learner_settings SET ai_budget=? WHERE user_id=?').run('{"requestNowPerDay":0}', learner);
  const req = await createRequest(db, {}, learner, learner, parseRequest({ kind:'extra_practice', subjectId:subject, urgency:'now' }), now);
  assert.equal(req.text,'Bài tiếp theo');
  assert.equal(req.deferred,true);
  assert.deepEqual(await leaseJobs(db, client, input, 'test', now), []);
  const next = new Date('2026-10-13T22:00:00Z');
  assert.equal((await leaseJobs(db, client, input, 'test', next)).length, 1);
  db.sqlite.close();
});

test('a practice request waits until tomorrow if there is no room for even a short lesson', async () => {
  const { db, lesson } = await assigned();
  db.sqlite.prepare('UPDATE learning_lessons SET est_minutes=90 WHERE id=?').run(lesson);
  const req = await createRequest(db, {}, learner, learner, parseRequest({ kind:'extra_practice', subjectId:subject, urgency:'now' }), now);
  assert.equal(req.deferred,true);
  assert.deepEqual(await leaseJobs(db, client, input, 'test', now), []);
  db.sqlite.close();
});

test('adaptive requests deduplicate concurrently and legacy clients cannot lease them', async () => {
  const db = seed();
  const bindings = { ADAPTIVE_PILOT_SUBJECT_ID: subject };
  const data = { subjectId: subject, mode: 'personal', clientRequestId: crypto.randomUUID(), note: 'Viết email đổi lịch' };
  const [first, second] = await Promise.all([
    createRequest(db, bindings, learner, learner, parseRequest(data), now),
    createRequest(db, bindings, learner, learner, parseRequest(data), now),
  ]);
  assert.equal(first.id, second.id);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM ai_jobs').get().n, 1);
  await assert.rejects(createRequest(db, bindings, learner, learner, parseRequest({ ...data, note: 'Viết email xin nghỉ' }), now), { status: 409 });
  assert.deepEqual(await leaseJobs(db, client, input, 'test', now), []);
  const [lease] = await leaseJobs(db, client, { ...input, capabilities: ['adaptive-plan'] }, 'test', now);
  assert.equal(lease.adaptive, true);
  const job = await readJob(db, lease.jobId);
  assert.equal(JSON.parse(job.context_snapshot).adaptive.mode, 'personal');
});

test('each custom notebook has its own nightly job key, with no pilot ID', async () => {
  const db = seed();
  db.sqlite.prepare('UPDATE subjects SET ai_enabled=0 WHERE id=?').run(subject);
  const ids = [];
  for (const title of ['Tiếng Việt', 'Toán 7']) {
    const custom = await createSubject(db, learner, learner, parseSubjectInput({ title }), now);
    ids.push(custom.id);
    db.sqlite.prepare("UPDATE subjects SET status='active',ai_enabled=1 WHERE id=?").run(custom.id);
  }
  await queueDaily(db, {}, new Date('2026-10-24T22:00:00.000Z'));
  await queueDaily(db, {}, new Date('2026-10-24T22:00:20.000Z'));
  const rows = db.sqlite.prepare('SELECT subject_id, adaptive, learning_day FROM ai_jobs ORDER BY subject_id').all();
  assert.deepEqual(rows.map(row => ({ ...row })), ids.sort().map(subjectId => ({
    subject_id: subjectId, adaptive: 1, learning_day: '2026-10-25',
  })));
});

test('adaptive personal request saves a one-item lesson and does not block the nightly job', async () => {
  const db = seed();
  const bindings = { ADAPTIVE_PILOT_SUBJECT_ID: subject };
  db.sqlite.prepare(`INSERT INTO skills(id,subject_id,learner_id,key,name,description,path_order,prerequisites,status,origin,created_at,updated_at)
    VALUES('sk_aaaaaaaaaaaaaaaaaaaa',?,?,'modalverb-infinitiv','Modalverb','',1,'[]','active','ai',?,?)`).run(subject, learner, now.toISOString(), now.toISOString());
  const request = await createRequest(db, bindings, learner, learner, parseRequest({
    subjectId: subject, mode: 'personal', note: 'Luyện modal verb khi hẹn lịch', clientRequestId: crypto.randomUUID(),
  }), now);
  const [lease] = await leaseJobs(db, client, { ...input, capabilities: ['adaptive-plan'] }, 'test', now);
  const context = JSON.parse((await readJob(db, lease.jobId)).context_snapshot);
  const result = plan(context, null);
  const lesson = { ...structuredClone(fixture), kind: 'exploration', estMinutes: 15, items: [fixture.items[0]],
    stages: [{ stage: 'retrieval', itemIds: ['i1'] }] };
  result.explorations = [{ requestId: request.id, action: 'assign', subjectId: subject, lesson, reason: 'Luyện theo tình huống đã chọn.' }];
  const checked = await applyResult(db, client, lease.jobId, lease.leaseToken, result, true, now);
  assert.equal(checked.status, 200, JSON.stringify(checked));
  const saved = await applyResult(db, client, lease.jobId, lease.leaseToken, result, false, now);
  assert.equal(saved.status, 200, JSON.stringify(saved));
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM learning_lessons WHERE slot='extra'").get().n, 1);
  await queueDaily(db, bindings, new Date('2026-10-13T22:00:00Z'));
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM ai_jobs WHERE purpose='daily'").get().n, 1);
});

test('manual Học mới advances the same roadmap that the nightly planner reads', async () => {
  const db = seed();
  const bindings = { ADAPTIVE_PILOT_SUBJECT_ID: subject };
  const skill = 'sk_aaaaaaaaaaaaaaaaaaaa';
  db.sqlite.prepare(`INSERT INTO skills(id,subject_id,learner_id,key,name,description,path_order,prerequisites,status,origin,created_at,updated_at)
    VALUES(?,?,?,'modalverb-infinitiv','Modalverb','',1,'[]','active','ai',?,?)`).run(skill, subject, learner, now.toISOString(), now.toISOString());
  db.sqlite.prepare('UPDATE subjects SET roadmap=? WHERE id=?').run(JSON.stringify(
    ['Sắp lịch', 'Xác nhận lịch'].map(title => ({ title, objective: 'Dùng động từ tình thái', situation: 'Văn phòng', skills: [skill], mode: 'new' })),
  ), subject);
  const request = await createRequest(db, bindings, learner, learner, parseRequest({
    subjectId: subject, mode: 'learn', clientRequestId: crypto.randomUUID(),
  }), now);
  const withCapability = { ...input, capabilities: ['adaptive-plan'] };
  const [lease] = await leaseJobs(db, client, withCapability, 'test', now);
  const context = JSON.parse((await readJob(db, lease.jobId)).context_snapshot);
  assert.equal(context.adaptive.step.title, 'Sắp lịch');
  const result = plan(context, null);
  result.explorations = [{ requestId: request.id, action: 'assign', subjectId: subject, lesson: { ...fixture, estMinutes: 15 }, reason: 'Bước tiếp theo.' }];
  const saved = await applyResult(db, client, lease.jobId, lease.leaseToken, result, false, now);
  assert.equal(saved.status, 200, JSON.stringify(saved));
  const midnight = new Date('2026-10-13T22:00:00Z');
  await queueDaily(db, bindings, midnight);
  const [night] = await leaseJobs(db, client, withCapability, 'test', midnight);
  const next = JSON.parse((await readJob(db, night.jobId)).context_snapshot);
  assert.equal(next.adaptive.step.title, 'Xác nhận lịch');
});

test('the first saved lesson activates a new notebook and its nightly schedule', async () => {
  const db = seed();
  const subject = (await createSubject(db, learner, learner, parseSubjectInput({
    title: 'Toán 7', goal: 'Ôn phân số để thi, thích bài tập ngắn', curriculum: 'Sách đã chọn',
  }), now)).id;
  const setupRequest = parseRequest({ subjectId: subject, mode: 'learn', clientRequestId: crypto.randomUUID() });
  await assert.rejects(createRequest(db, {}, learner, learner, setupRequest, now), { status: 409 });
  assert.equal(db.sqlite.prepare('SELECT ai_enabled FROM subjects WHERE id=?').get(subject).ai_enabled, 0);
  const job = await enqueue(db, {}, { learnerId: learner, kind: 'plan', purpose: 'initial', subjectId: subject }, now);
  const [lease] = await leaseJobs(db, client, input, 'test', now);
  assert.equal(lease.jobId, job.id);
  const context = JSON.parse((await readJob(db, job.id)).context_snapshot);
  const result = plan(context, { ...structuredClone(fixture), kind: 'diagnostic' });
  const [settings] = result.subjects;
  const firstSkill = settings.skillChanges[0];
  settings.skillChanges.push(...Array.from({ length: 7 }, (_, index) => ({
    ...firstSkill, key: 'step-' + index, name: 'Kỹ năng ' + index, pathOrder: index + 2,
  })));
  settings.roadmap = Array.from({ length: 5 }, (_, index) => ({
    title: 'Bước ' + index, objective: 'Luyện tập', situation: 'Bài tập ngắn',
    skills: ['key:' + firstSkill.key], mode: 'new',
  }));
  settings.notebookSetup = { template: 'reading', goal: 'Ôn phân số để thi', level: 'Chưa đánh giá', curriculum: 'Đề xuất khác', instructions: 'Ưu tiên bài tập ngắn.' };
  const saved = await applyResult(db, client, job.id, lease.leaseToken, result, false, now);
  assert.equal(saved.status, 200, JSON.stringify(saved));
  const notebook = db.sqlite.prepare('SELECT template,goal,opening_brief,level,curriculum,instructions,roadmap,status,ai_enabled FROM subjects WHERE id=?').get(subject);
  assert.deepEqual({ ...notebook, roadmap: JSON.parse(notebook.roadmap).length }, {
    template: 'reading', goal: 'Ôn phân số để thi', opening_brief: 'Ôn phân số để thi, thích bài tập ngắn', level: 'Chưa đánh giá',
    curriculum: 'Sách đã chọn', instructions: 'Ưu tiên bài tập ngắn.', roadmap: 5, status: 'active', ai_enabled: 1,
  });
  const midnight = new Date('2026-10-13T22:00:00Z');
  db.sqlite.prepare('UPDATE subjects SET ai_enabled=0 WHERE legacy_track IS NOT NULL').run();
  await queueDaily(db, {}, midnight);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM ai_jobs WHERE purpose='daily'").get().n, 0);
  db.sqlite.prepare('UPDATE learning_lessons SET completed_at=? WHERE subject_id=?').run(now.toISOString(), subject);
  await queueDaily(db, {}, midnight);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM ai_jobs WHERE purpose='daily' AND subject_id=? AND adaptive=1").get(subject).n, 1);
  for (const mode of ['learn', 'practice', 'personal']) {
    const request = await createRequest(db, {}, learner, learner, parseRequest({
      subjectId: subject, mode, clientRequestId: crypto.randomUUID(),
      ...(mode === 'personal' ? { note: 'Luyện theo tình huống thực tế' } : {}),
    }), now);
    assert.equal(request.mode, mode);
    assert.equal((await readJob(db, db.sqlite.prepare('SELECT job_id FROM learner_requests WHERE id=?').get(request.id).job_id)).adaptive, 1);
  }
  db.sqlite.close();
});
