import { openAiEngine } from '../lib/ai/openai.mjs';
import { uploadPlanAudio } from '../lib/ai/upload-plan-audio.mjs';
import { audioVariant } from '../lib/audio/hash.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { z } from 'zod/v4';
import { memoryDb } from './d1-adapter.mjs';
import { buildAssessContext } from '../lib/ai-jobs/context/assess.ts';
import { enqueue, queueSubmission } from '../lib/ai-jobs/queue.ts';
import { leaseJobs, readJob } from '../lib/ai-jobs/lease.ts';
import { applyResult } from '../lib/ai-jobs/result.ts';
import { saveDraft } from '../lib/lesson-v2/actions.ts';
import { submitLesson } from '../lib/evidence/submit.ts';
import { assessResult } from '../lib/contracts/ai-common.ts';
import { processJob, userPrompt, systemPrompt, normalizePlan, normalizePlanAttachments, compactPlanContext } from '../lib/ai/job.mjs';
import { strictSchema, stripOptionalNulls, parseJsonReply } from '../lib/ai/schema.mjs';
import { listeningJob, germanVoices } from './listening-authoring-fixture.mjs';

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
const fixture = { ...JSON.parse(readFileSync(new URL('../fixtures/lessons/deutsch-modalverb.json', import.meta.url), 'utf8')), contract: 'lesson-package/3', knowledge: [] };

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
  const [planLease] = await leaseJobs(db, client, { kinds: ['plan'], max: 1, runner, capabilities: ['lesson-v3'] }, 'test', now);
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
      return { json: next(input.user.startsWith('Dữ liệu ngữ cảnh') ? JSON.parse(input.user.split('\n')[2]) : undefined), usage: { model: name + ':m', inputTokens: 10, outputTokens: 5, ms: 7 } };
    },
  };
};

test('a model grade passes the dry run, is saved, verified and reports the engine', async () => {
  const { db, sub } = await openSubmission();
  const hub = memoryHub(db);
  const [lease] = await hub.lease({ kinds: ['assess'], max: 1, runner, capabilities: ['lesson-v3'] });
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
  const [lease] = await hub.lease({ kinds: ['assess'], max: 1, runner, capabilities: ['lesson-v3'] });
  const qwen = fakeEngine('qwen', [(c) => grade(c, { evidence: 'không có trong bài' }), (c) => grade(c)]);
  const out = await processJob(hub, lease, qwen);
  assert.equal(out.status, 'succeeded');
  assert.equal(qwen.seen.length, 2);
  assert.match(qwen.seen[1].user, /Lần trước bị từ chối/);
  db.sqlite.close();
});

test('a rejected lesson goes back to the model with the draft and exact question path', async () => {
  const context = {
    contract: 'plan-context/1', contextHash: 'sha256:' + '0'.repeat(64), purpose: 'daily', subjects: [],
  };
  const lesson = structuredClone(fixture);
  const draft = {
    contract: 'plan-result/1', contextHash: context.contextHash, summary: 'Bài mới', subjects: [],
    explorations: [{ requestId: 'req_0123456789abcdefabcd', action: 'assign', subjectId: subject, lesson, reason: 'Luyện thêm.' }],
    usage: { model: 'test', inputTokens: 0, outputTokens: 0, ms: 0 },
  };
  const fixed = structuredClone(draft);
  fixed.explorations[0].lesson.items[1].prompt = 'Nói một câu về việc dời lịch khám.';
  const qwen = fakeEngine('qwen', [() => draft, () => ({ fixes: [{ path: '/explorations/0/lesson/items/1', item: fixed.explorations[0].lesson.items[1] }] })]);
  const calls = [];
  const path = '/explorations/0/lesson/items/1/prompt';
  const hub = {
    context: async () => context,
    async result(_lease, body, dryRun) {
      calls.push({ body, dryRun });
      return calls.length === 1
        ? { status: 422, body: { errors: [{ path, code: 'duplicate_item', message: 'Câu đã dùng trong 90 ngày.' }] } }
        : { status: 200 };
    },
    state: async () => ({ status: 'succeeded', outcome: { extraLessonIds: ['saved-lesson'] } }),
    fail: async () => assert.fail('Expected the fixed draft to be saved'),
  };
  assert.equal((await processJob(hub, { kind: 'plan', jobId: 'job_plan' }, qwen)).status, 'succeeded');
  // Round two resends only the broken item, not the whole rejected draft.
  assert.match(qwen.seen[1].user, new RegExp(path));
  assert.doesNotMatch(qwen.seen[1].user, /rejected_draft/);
  assert.ok(qwen.seen[1].user.length < qwen.seen[0].user.length + JSON.stringify(lesson.items[1]).length * 4 + 4000);
  assert.deepEqual(qwen.seen[1].schema.properties.fixes.items.properties.path.enum, ['/explorations/0/lesson/items/1']);
  assert.deepEqual(calls.map(call => call.dryRun), [true, true, false]);
  assert.deepEqual(calls[2].body.explorations[0].lesson.items[0], calls[0].body.explorations[0].lesson.items[0]);
});

test('a whole-lesson retry uses Hub errors without resending the rejected package', async () => {
  const context = {
    contract: 'plan-context/1', contextHash: 'sha256:' + '0'.repeat(64), purpose: 'daily', subjects: [],
  };
  const draft = {
    contract: 'plan-result/1', contextHash: context.contextHash, summary: 'Nội dung bản nháp cũ',
    subjects: [], explorations: [], usage: { model: 'test', inputTokens: 0, outputTokens: 0, ms: 0 },
  };
  const qwen = fakeEngine('qwen', [() => draft, () => ({ ...draft, summary: 'Bản mới' })]);
  const calls = [];
  const hub = {
    context: async () => context,
    async result(_lease, body, dryRun) {
      calls.push({ body, dryRun });
      return calls.length === 1
        ? { status: 422, body: { errors: [{ path: '/subjects/0/roadmapChanges', code: 'roadmap' }] } }
        : { status: 200 };
    },
    state: async () => ({ status: 'succeeded' }),
    fail: async () => assert.fail('Expected the regenerated result to be saved'),
  };
  assert.equal((await processJob(hub, { kind: 'plan', jobId: 'job_plan' }, qwen)).status, 'succeeded');
  assert.match(qwen.seen[1].user, /roadmapChanges/);
  assert.doesNotMatch(qwen.seen[1].user, /Nội dung bản nháp cũ/);
  assert.deepEqual(calls.map(call => call.dryRun), [true, true, false]);
  assert.equal(calls[2].body.summary, 'Bản mới');
});

test('a duplicate found before validation is repaired before the Hub sees the draft', async () => {
  const lesson = structuredClone(fixture);
  const context = {
    contract: 'plan-context/1', contextHash: 'sha256:' + '0'.repeat(64), purpose: 'daily',
    subjects: ['sub_bbbbbbbbbbbbbbbbbbbb', 'sub_cccccccccccccccccccc'].map(subjectId => ({
      subjectId, limits: {}, revision: 1, slot: { openPrimaryLessonId: null }, goal: '', instructions: '', progressSummary: '',
      skills: [], errorPatterns: [], recentLessons: [{ items: [{ prompt: lesson.items[1].prompt }] }],
    })),
  };
  const draft = {
    contract: 'plan-result/1', contextHash: context.contextHash, summary: 'Bài mới', subjects: [],
    explorations: [{ requestId: 'req_0123456789abcdefabcd', action: 'assign', subjectId: subject, lesson, reason: 'Luyện thêm.' }],
    usage: { model: 'test', inputTokens: 0, outputTokens: 0, ms: 0 },
  };
  const fixedItem = { ...lesson.items[1], prompt: 'Viết một câu mới về việc hẹn lịch khám với bác sĩ.' };
  const qwen = fakeEngine('qwen', [() => draft, () => ({ fixes: [{ path: '/explorations/0/lesson/items/1', item: fixedItem }] })]);
  const dry = [];
  const hub = {
    context: async () => context,
    async result(_lease, body, dryRun) { dry.push(body.explorations[0].lesson.items[1].prompt); return { status: 200, dryRun }; },
    state: async () => ({ status: 'succeeded', outcome: { extraLessonIds: ['saved-lesson'] } }),
    fail: async () => assert.fail('Expected the repaired draft to be saved'),
  };
  assert.equal((await processJob(hub, { kind: 'plan', jobId: 'job_dup' }, qwen)).status, 'succeeded');
  assert.equal(dry[0], fixedItem.prompt, 'the Hub never received the duplicate');
  assert.match(qwen.seen[1].user, /duplicate_item/);
});

test('plan context stays under its byte budget', () => {
  const big = 'x'.repeat(2000);
  const context = { subjects: [{
    goal: big, instructions: big, progressSummary: '', skills: [], errorPatterns: [],
    recentLessons: Array.from({ length: 4 }, () => ({ items: Array.from({ length: 4 }, () => ({ prompt: big })) })),
  }] };
  const compact = compactPlanContext(context, 6000);
  assert.ok(JSON.stringify(compact).length <= 6000 + 1800 || compact.subjects[0].recentLessons.every(l => l.items.length === 0));
  assert.ok(compact.subjects[0].recentLessons.every(l => l.items.every(item => item.prompt.length <= 80)));
});

test('a model without vision leaves photos with the Hub', async () => {
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
  const [lease] = await hub.lease({ kinds: ['assess'], max: 1, runner, capabilities: ['lesson-v3'] });
  const out = await processJob(hub, lease, fakeEngine('qwen', [(c) => grade(c)]));
  assert.equal(out.status, 'succeeded');
  assert.equal(hub.calls.filter((c) => c.dryRun === false).length, 1);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM grades WHERE grader='ai'").get().n, 1);
  db.sqlite.close();
});

test('when the model fails the job goes back to the Hub queue with only a short reason', async () => {
  const { db } = await openSubmission();
  const hub = memoryHub(db);
  const [lease] = await hub.lease({ kinds: ['assess'], max: 1, runner, capabilities: ['lesson-v3'] });
  const out = await processJob(hub, lease, fakeEngine('qwen', [Error('down')]));
  assert.equal(out.status, 'failed');
  assert.deepEqual(hub.calls.at(-1), { fail: 'qwen: down', retryable: true });
  db.sqlite.close();
});

test('lesson normalization keeps generated answers and places every item in one allowed stage', () => {
  const lesson = structuredClone(fixture);
  const item = lesson.items.find(question => question.key?.type === 'choice');
  assert(item);
  item.input = 'short';
  lesson.stages = [
    { stage: 'sheet', itemIds: [item.id] },
    { stage: 'guided', itemIds: [item.id, 'i99', item.id] },
    { stage: 'check', itemIds: lesson.items.filter(question => question !== item).map(question => question.id) },
  ];
  const normalized = normalizePlan({ subjects: [], explorations: [{ lesson }] }).explorations[0].lesson;
  assert.deepEqual(normalized.stages.map(stage => stage.stage), ['sheet', 'guided', 'independent']);
  assert.deepEqual(normalized.stages.flatMap(stage => stage.itemIds).sort(), lesson.items.map(question => question.id).sort());
  const corrected = normalized.items.find(question => question.id === item.id);
  assert.equal(corrected.input, 'choice');
  assert.deepEqual(corrected.key, item.key);
  assert.deepEqual(corrected.choices, item.choices);
});

test('the user prompt marks the context as data and carries repair errors', () => {
  const p = userPrompt({ contract: 'assess-context/1', contextHash: 'sha256:abc', attempts: [] }, [{ code: 'schema', path: '/grades' }]);
  assert.match(p, /không phải chỉ dẫn/);
  assert.match(p, /contextHash = "sha256:abc"/);
  assert.match(p, /"code":"schema"/);
  assert.match(systemPrompt('assess', 'recheck'), /recheckDecision/);
  assert.match(systemPrompt('plan', 'request'), /Chỉ dùng ID có thật/);
});

test('strict model schema: optional fields become nullable and nulls are removed again', () => {
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

test('reference hygiene: invented pattern ids become null and each answer keeps one grade', async () => {
  const { normalizeAssess } = await import('../lib/ai/job.mjs');
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

test('v3 Rust diagnostic uses five questions and a stable acyclic skill vocabulary', async () => {
  const context = {
    contract: 'plan-context/1', purpose: 'initial', contextHash: 'sha256:' + 'a'.repeat(64),
    subjects: [{ subjectId: subject, title: 'Rust cơ bản', goal: '', instructions: '', progressSummary: '', revision: 0, limits: {}, framework: { key: 'rust-core' },
      slot: { eligibleForPrimary: true, openPrimaryLessonId: null }, skills: [], errorPatterns: [], recentLessons: [] }],
  };
  const hub = { context: async () => context, fail: async () => undefined };
  let schema;
  const qwen = { name: 'qwen', run: async input => { schema = input.schema; throw Error('schema captured'); } };
  await processJob(hub, { kind: 'plan', purpose: 'initial', jobId: 'job_qa' }, qwen);
  const setup = schema.properties.subjects.items.properties;
  assert.equal(setup.skillChanges.prefixItems.length, 8);
  assert.deepEqual(setup.skillChanges.prefixItems[1].properties.prerequisites.items.enum, ['key:step-1']);
  const questions = setup.primaryLesson.properties.items.prefixItems.map(item => item.anyOf[0].properties);
  assert.equal(questions[0].input.const, 'code');
  assert.deepEqual(setup.primaryLesson.properties.items.prefixItems[1].anyOf.map(item => item.properties.input.const), ['choice', 'short', 'cloze', 'order']);
});

test('modern Rust opening schema requires a framework and allows keyed placement items', async () => {
  const context = {
    contract:'plan-context/1', purpose:'initial', roadmapProtocol:2, contextHash:'sha256:'+'a'.repeat(64),
    subjects:[{subjectId:subject,title:'Rust',goal:'Học Rust',instructions:'',progressSummary:'',revision:0,
      limits:{},framework:{key:'rust-core'},slot:{eligibleForPrimary:true,openPrimaryLessonId:null},skills:[],errorPatterns:[],recentLessons:[]}],
  };
  const hub={context:async()=>context,fail:async()=>undefined};
  let schema;
  const qwen={name:'qwen',run:async input=>{schema=input.schema;throw Error('schema captured');}};
  await processJob(hub,{kind:'plan',purpose:'initial',jobId:'job_qa'},qwen);
  const subjectSchema=schema.properties.subjects.items;
  assert.ok(subjectSchema.required.includes('openingSteps'));
  assert.ok(subjectSchema.properties.notebookSetup.required.includes('framework'));
  assert.equal(subjectSchema.properties.notebookSetup.properties.framework.properties.key.const, 'rust-core');
  const questions=subjectSchema.properties.primaryLesson.properties.items.prefixItems;
  assert.equal(questions.length,5);
  for(const [index,question] of questions.entries()){
    const skill='key:step-'+(index+1);
    assert.equal(question.anyOf[0].properties.skills.items.const,skill);
    const step = subjectSchema.properties.openingSteps.prefixItems[index].properties;
    assert.equal(step.skills.items.const,skill);
    assert.equal(step.requires.maxItems,0);
    assert.equal(step.ref, undefined);
  }
  assert.ok(questions[1].anyOf.some(branch => branch.properties.input.const === 'cloze'));
});

test('math schema allows several short answers and numeric calculations', async () => {
  const context = {
    contract: 'plan-context/1', purpose: 'daily', contextHash: 'sha256:' + 'a'.repeat(64),
    subjects: [{ subjectId: subject, title: 'Toán 7', goal: '', instructions: '', progressSummary: '', framework: { key: 'vn-gdpt-2018-toan' },
      limits: { itemKinds: ['short', 'choice', 'table'] }, slot: { openPrimaryLessonId: null },
      skills: [], errorPatterns: [], recentLessons: [] }],
  };
  const hub = { context: async () => context, fail: async () => undefined };
  let schema;
  const qwen = { name: 'qwen', run: async (input) => { schema = input.schema; throw Error('schema captured'); } };
  await processJob(hub, { kind: 'plan', purpose: 'daily', jobId: 'job_qa' }, qwen);
  const lesson = schema.properties.subjects.items.properties.primaryLesson.anyOf[0];
  const short = lesson.properties.items.items.anyOf.find(item => item.properties.input.const === 'short');
  const keys = short.properties.key.oneOf;
  const numeric = keys.find(key => key.properties.type.const === 'numeric');
  const table = lesson.properties.items.items.anyOf.find(item => item.properties.input.const === 'table');
  const numericCell = table.properties.key.properties.cells.items.anyOf.find(key => key.properties.type.const === 'numeric');
  assert.equal(numericCell.properties.value.pattern, numeric.properties.value.pattern);
  const numericPattern = new RegExp(numeric.properties.value.pattern, 'u');
  for (const value of ['-2', '0,75', '+0.75', '3/4', '0,001', '1234.567']) assert(numericPattern.test(value), value);
  for (const value of ['1.000', '1/0', '1/00', '}, {', 'x = 3', '3 kg', '3 4']) assert(!numericPattern.test(value), value);
  const accepted = keys.find(key => key.properties.type.const === 'text').properties.accepted;
  assert(accepted.maxItems > 1);
  const pattern = new RegExp(accepted.items.pattern, 'u');
  assert(pattern.test(' Tỉ lệ thuận '));
  assert(!pattern.test('là tỉ lệ thuận'));
});


test('job processor normalizes numeric keys and table cells without guessing ambiguous values', () => {
  const lesson = structuredClone(fixture);
  lesson.items[0].key = { type: 'numeric', value: '  x =  3 / 4  ', tolerance: 0, unit: null };
  lesson.items[1].key = { type: 'table', cells: [
    { type: 'numeric', value: 'x = 1.000', tolerance: 0, unit: null },
    { type: 'numeric', value: '  -0,75  ', tolerance: 0, unit: null },
    { type: 'text', accepted: ['giữ nguyên'], caseSensitive: false },
  ] };
  const [short, table] = normalizePlan({ subjects: [], explorations: [{ lesson }] }).explorations[0].lesson.items;
  assert.equal(short.key.value, '3/4');
  assert.equal(table.key.cells[0].value, '1.000');
  assert.equal(table.key.cells[1].value, '-0,75');
  assert.deepEqual(table.key.cells[2], lesson.items[1].key.cells[2]);
  assert.equal(lesson.items[0].key.value, '  x =  3 / 4  ');
});

test('audio upload prepares both ordered variants and reuses uploaded hashes', async () => {
  const pair = { f: 'Anna', m: 'Reed' };
  const audio = { lang: 'de-DE', rate: 0.8, lines: [{ speaker: 'a', text: 'Hallo.' }, { speaker: 'b', text: 'Guten Tag.' }] };
  const lease = { jobId: 'job_aaaaaaaaaaaaaaaaaaaa', leaseToken: 'lease-test' };
  const rendered = Buffer.from('fake-m4a');
  const spoken = [];
  const variants = [];
  const hub = {
    async putBinary(actualLease, hash, bytes, header) {
      const spec = JSON.parse(Buffer.from(header, 'base64'));
      assert.deepEqual(actualLease, lease);
      assert.deepEqual(spec.audio, audio);
      assert.equal(hash, (await audioVariant(audio, pair, spec.variant)).hash);
      assert.deepEqual(bytes, rendered);
      variants.push(spec.variant);
    },
  };
  const context = { tts: { voices: { 'de-DE': pair } } };
  const result = { subjects: [{ primaryLesson: { items: [{ audio }] } }], explorations: [] };
  const uploaded = new Set();
  const render = (spec, names) => {
    assert.deepEqual(spec, audio);
    spoken.push(names);
    return rendered;
  };
  await uploadPlanAudio(hub, lease, context, result, render, uploaded);
  await uploadPlanAudio(hub, lease, context, result, render, uploaded);
  assert.deepEqual(spoken, [['Anna', 'Reed'], ['Reed', 'Anna']]);
  assert.deepEqual(variants, ['f', 'm']);
});

test('Hub leases a listening quota only for notebooks whose language has two runner voices', async t => {
  const cases = [
    [{}, { min: 2, max: 3 }],
    [{ ttsVoices: {} }, { min: 0, max: 0 }],
    [{ ttsVoices: { 'en-US': { f: 'Test f', m: 'Test m' } } }, { min: 0, max: 0 }],
    [{ title: 'Rust', goal: 'Rust ownership', ttsVoices: germanVoices }, { min: 0, max: 0 }],
  ];
  for (const [options, expected] of cases) {
    const db = memoryDb();
    t.after(() => db.sqlite.close());
    const { hub, lease, context } = await listeningJob(db, options);
    assert.deepEqual(context.adaptive.listening, expected);
    let lessonProperties;
    await processJob(hub, lease, {
      name: 'qwen',
      async run({ schema }) {
        lessonProperties = schema.properties.explorations.items.properties.lesson.properties;
        throw Error('schema inspected');
      },
    });
    const shape = lessonProperties.items;
    if (expected.max) {
      assert.deepEqual(lessonProperties.gradingMode, { type: 'string', const: 'whole-lesson' });
      assert.equal(shape.prefixItems.length, expected.max);
      for (const [index, item] of shape.prefixItems.entries()) {
        for (const branch of item.anyOf) {
          assert.equal(branch.required.includes('audio'), index < expected.min);
          assert.deepEqual(branch.properties.audio.properties.lang, { const: 'de-DE' });
        }
      }
      assert(shape.items.anyOf.every(branch => !branch.properties.audio));
    } else {
      assert(shape.items.anyOf.every(branch => !branch.properties.audio));
    }
  }
});

test('listening quota and quoted grading evidence are enforced through lease, upload and save', async t => {
  const db = memoryDb();
  t.after(() => db.sqlite.close());
  const { hub, lease, context, draft, submitted, objects, submitOpenAnswer } = await listeningJob(db);
  assert.deepEqual(context.adaptive.listening, { min: 2, max: 3 });
  const body = { ...draft, contextHash: context.contextHash };
  const missing = await hub.result(lease, body, true);
  assert.equal(missing.status, 422);
  assert(missing.body.errors.some(error => error.code === 'listening_count'), JSON.stringify(missing.body));

  const revealed = structuredClone(body);
  const item = revealed.explorations[0].lesson.items[0];
  item.prompt += ' «GEHT ES MORGEN UM ACHT UHR?»';
  const leak = await hub.result(lease, revealed, true);
  assert(leak.body.errors.some(error => error.code === 'listening_prompt'));
  item.prompt = draft.explorations[0].lesson.items[0].prompt;
  item.audio.lang = 'zh-CN';
  const language = await hub.result(lease, revealed, true);
  assert(language.body.errors.some(error => error.code === 'listening_language'));

  const wrong = structuredClone(draft);
  delete wrong.explorations[0].lesson.items[0].audio;
  let renders = 0;
  const engine = fakeEngine('qwen', [() => wrong, () => draft]);
  const run = await processJob(hub, lease, engine, {
    renderAudio: async (_audio, voices) => {
      renders++;
      const variant = voices[0] === germanVoices['de-DE'].f ? 'f' : 'm';
      return readFileSync(new URL(`./fixtures/audio/de-DE-${variant}.m4a`, import.meta.url));
    },
  });
  assert.equal(run.status, 'succeeded', JSON.stringify(run));
  assert.equal(renders, 4);
  assert.equal(objects.size, 4);
  const job = await hub.state(lease.jobId);
  const [lessonId] = job.outcome.extraLessonIds;
  assert(lessonId);
  assert.equal(db.sqlite.prepare("SELECT count(*) n FROM lesson_items WHERE lesson_id=? AND stimulus='audio'").get(lessonId).n, 2);
  const repeated = await hub.result(lease, submitted[0], false);
  assert(repeated.body.replayed);
  assert.deepEqual(repeated.body.outcome.extraLessonIds, [lessonId]);

  const assess = await submitOpenAnswer(lessonId);
  const assessing = await hub.context(assess);
  assert.deepEqual(assessing.attempts[0].transcript, draft.explorations[0].lesson.items[1].audio.lines);
  const result = grade(assessing, { evidence: 'in der Bibliothek' });
  result.contextHash = assessing.contextHash;
  result.grades[0].rubricScores[0].points = 1;
  const rejected = await hub.result(assess, result, true);
  assert.equal(rejected.status, 422);
  assert(rejected.body.errors.some(error => error.path === '/grades/0/errors'));
  result.grades[0].errors = [];
  const accepted = await hub.result(assess, result, false);
  assert.equal(accepted.status, 200, JSON.stringify(accepted));
});

test('OpenAI daily plans save 18 timed rubric questions and keep the previous lesson', async t => {
  const { db } = await openSubmission();
  t.after(() => db.sqlite.close());
  db.sqlite.prepare('UPDATE learning_lessons SET completed_at=?').run('2026-11-11T08:00:00.000Z');
  const oldId = db.sqlite.prepare('SELECT id FROM learning_lessons').get().id;
  db.sqlite.prepare("INSERT INTO submissions(id,learner_id,lesson_id,stage,client_submission_id,request_hash,status,created_at) VALUES('prior-whole',?,?,'whole-lesson','prior','hash','graded','2026-11-11T07:00:00.000Z')").run(learner,oldId);
  const readOld = () => db.sqlite.prepare('SELECT payload, draft, completed_at FROM learning_lessons ORDER BY rowid LIMIT 1').get();
  const previous = readOld();
  await enqueue(db, {}, { learnerId: learner, kind: 'plan', purpose: 'daily' }, new Date('2026-11-13T09:00:00Z'));
  const hub = memoryHub(db);
  const [lease] = await hub.lease({ kinds: ['plan'], max: 1, runner, capabilities: ['lesson-v3'] });
  const context = await hub.context(lease);
  const [subject] = context.subjects;
  assert.equal(context.learner.targetMinutes, 45);
  const skill = subject.skills[0].skillId;
  const lesson = structuredClone(fixture);
  Object.assign(lesson, { gradingMode: 'whole-lesson', targetSkills: [skill], reasonRefs: [], estMinutes: 45 });
  const scenarios = [
    'Chuẩn bị thư mời cho buổi họp', 'Sắp xếp ca trực ở thư viện', 'Xin phép đổi giờ phỏng vấn',
    'Lên lịch tập đàn thứ Bảy', 'Chuẩn bị bàn cho khách', 'Hỏi đường đi đến bưu điện',
    'Viết biển báo cho trường học', 'Mời hàng xóm tới buổi chiếu phim', 'Hỏi quy định ở hồ bơi',
    'Đề nghị giúp một bạn kẹt xe', 'Đặt lịch khám cho thú cưng', 'Viết kế hoạch cho nhóm làm bánh',
    'Xin nghỉ buổi tập bóng', 'Hẹn mang sách trả cho bạn',
    'Xác nhận giờ đón khách', 'Nhờ bạn đổi lịch trực', 'Hỏi giờ mở cửa bảo tàng', 'Hẹn giao lại chìa khóa',
  ];
  lesson.items = scenarios.map((scenario, index) => ({
    id: 'i' + (index + 1), input: index < 3 ? 'long' : 'short', activity: 'apply', skills: [skill], difficulty: 1,
    prompt: `${scenario}. Viết một yêu cầu phù hợp bằng tiếng Đức và cho biết động từ ở đâu.`,
    estMinutes: index < 3 ? 5 : 2,
    rubric: [{ criterion: 'Đúng vị trí động từ', points: 1 }, { criterion: 'Yêu cầu phù hợp tình huống', points: 1 },
      { criterion: 'Trình bày cách tính giờ và kết quả đúng', points: 1 }],
    hints: ['Chọn động từ khuyết thiếu.', 'Đặt động từ nguyên mẫu cuối câu.'],
    solution: 'Ví dụ: Kannst du mir helfen? Động từ khuyết thiếu đứng đầu câu hỏi, còn động từ nguyên mẫu đứng cuối câu.',
    attachment: 'optional',
  }));
  for (const [index, item] of lesson.items.entries()) {
    const duration = 10 + index;
    item.prompt += ` Việc bắt đầu lúc 9 giờ và mất ${duration} phút. Tính giờ xong và ghi kèm cách tính.`;
    item.solution += ` 9:00 + ${duration} phút = 9:${duration}.`;
  }
  lesson.stages = [{ stage: 'independent', itemIds: lesson.items.map(item => item.id) }];
  const result = {
    contract: 'plan-result/1', summary: 'Luyện dùng động từ khuyết thiếu trong nhiều tình huống.',
    subjects: [{ subjectId: subject.subjectId, expectedRevision: subject.revision,
      expectedOpenPrimaryLessonId: subject.slot.openPrimaryLessonId, action: 'assign', reason: 'Luyện tiếp',
      skillChanges: [], primaryLesson: lesson, reviewSet: null, masteryProposals: [],
      progressSummary: 'Luyện câu mới', requestsHandled: [] }],
    explorations: [],
  };
  const mismatched = structuredClone(result);
  mismatched.subjects[0].primaryLesson.items[0].estMinutes++;
  let calls = 0;
  const engine = openAiEngine({ apiKey: 'fixture', kind: 'plan', purpose: 'daily', fetcher: async (_url, init) => {
    const request = JSON.parse(init.body);
    const schema = JSON.parse(request.input.split('optional fields:\n')[1].split('\nDữ liệu')[0]);
    const primary = schema.properties.subjects.items.properties.primaryLesson.anyOf[0].properties;
    assert.deepEqual(primary.estMinutes, { const: 45 });
    assert.equal(primary.items.minItems, 15);
    assert.equal(primary.items.maxItems, 20);
    assert(primary.items.items.anyOf.every(item => item.required.includes('estMinutes') && !item.properties.key));
    assert.match(request.instructions, /45 phút, 15–20 câu/);
    assert.match(request.instructions, /15 phút, 6–8 câu/);
    assert.match(request.instructions, /chỉ gõ chữ/);
    assert.equal(request.max_output_tokens, 16_000);
    const draft = calls++ ? result : mismatched;
    if (draft === result) assert.match(request.input, /tổng số phút/);
    return Response.json({
      status: 'completed', usage: { input_tokens: 0, output_tokens: 0 },
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(draft) }] }],
    });
  } });
  const output = await processJob(hub, { ...lease, purpose: 'daily' }, engine);
  assert.equal(output.status, 'succeeded', JSON.stringify(hub.calls));
  assert.equal(calls, 2);
  const saved = db.sqlite.prepare('SELECT id, payload, est_minutes FROM learning_lessons WHERE origin_job_id=?').get(lease.jobId);
  assert.equal(saved.est_minutes, 45);
  assert.equal(JSON.parse(saved.payload).gradingMode, 'whole-lesson');
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM lesson_items WHERE lesson_id=(SELECT id FROM learning_lessons WHERE origin_job_id=?)').get(lease.jobId).n, 18);
  assert.deepEqual(readOld(), previous);

  // One optional image per question must survive submission and enter the same assessment.
  const answers = {};
  for (const [index, item] of lesson.items.entries()) {
    const photo = 'img_' + String(index).padStart(20, '0');
    db.sqlite.prepare(`INSERT INTO attachments(id,learner_id,r2_key,mime,bytes,width,height,sha256,created_at,expires_at)
      VALUES(?,?,?,'image/png',20,2,2,?,'2026-01-01','2099-01-01')`).run(photo, learner, photo, '0'.repeat(64));
    answers[item.id] = { answer: '', attachmentIds: [photo] };
  }
  const submission = await submitLesson(db, learner, saved.id, {
    clientSubmissionId: crypto.randomUUID(), draftRevision: 0, stage: null, answers,
  }, now);
  const assessmentJob = await queueSubmission(db, {}, learner, submission.id, now);
  const assessment = await buildAssessContext(db, await readJob(db, assessmentJob.id), 'test', now);
  assert.equal(assessment.attempts.length, 18);
  for (const attempt of assessment.attempts) {
    assert.deepEqual(attempt.attachments.map(photo => photo.attachmentId), answers[attempt.itemId].attachmentIds);
    assert.equal(attempt.attachments[0].expired, false);
  }
});

test('photo policy keeps every optional rubric item in normal notebooks and clears invalid or sensitive choices', () => {
  const item = (overrides = {}) => ({ input: 'short', rubric: [{ criterion: 'Cách làm', points: 1 }], attachment: 'optional', ...overrides });
  const plan = { subjects: [
    { subjectId: 'normal', primaryLesson: { items: [item(), item(), item(), item({ rubric: undefined }), item({ attachment: 'required' })] }, reviewSet: null },
    { subjectId: 'sensitive', primaryLesson: { items: [item()] }, reviewSet: null },
    { subjectId: 'child', primaryLesson: { items: [item()] }, reviewSet: null },
  ], explorations: [] };
  normalizePlanAttachments(plan, { subjects: [{ subjectId: 'normal', sensitivity: 'normal' },
    { subjectId: 'sensitive', sensitivity: 'clinical' }, { subjectId: 'child', sensitivity: 'child_dev' }] });
  assert.deepEqual(plan.subjects[0].primaryLesson.items.map(i => i.attachment), ['optional', 'optional', 'optional', 'none', 'none']);
  assert.equal(plan.subjects[1].primaryLesson.items[0].attachment, 'none');
  assert.equal(plan.subjects[2].primaryLesson.items[0].attachment, 'none');
});

test('runner accepts off-topic, blank and other-language answers without invented evidence', async t => {
 for (const answer of ['ok lah', '', 'I like turtles']) {
  const {db} = await openSubmission(); t.after(() => db.sqlite.close());
  db.sqlite.prepare('UPDATE attempts SET answer=?').run(answer);
  const hub=memoryHub(db), [lease]=await hub.lease({kinds:['assess'],max:1,runner,capabilities:['lesson-v3']});
  const engine=fakeEngine('qwen', [context => {
   const a=context.attempts[0], blank=!answer;
   return {...grade(context),grades:[{...grade(context).grades[0],result:blank?'ungradable':'incorrect',score:0,
    rubricScores:blank?[]:a.rubric.map(r=>({criterion:r.criterion,points:0,max:r.points})),
    feedback:'Hãy trả lời theo yêu cầu của câu hỏi.',errors:[],correction:''}]};
  }]);
  assert.equal((await processJob(hub,lease,engine)).status,'succeeded');
  const result=db.sqlite.prepare('SELECT result,score,errors FROM grades').get();
  assert.equal(result.result,answer?'incorrect':'ungradable');assert.equal(result.score,0);assert.deepEqual(JSON.parse(result.errors),[]);
 }
});

test('extra language feedback preserves full rubric score and is available for later practice', async t => {
 for (const [answer, hasError] of [['Leider ich kann um 10 Uhr nicht kommen',true],['Leider kann ich um 10 Uhr nicht kommen',false]]) {
  const {db}=await openSubmission();t.after(()=>db.sqlite.close());
  db.sqlite.prepare('UPDATE attempts SET answer=?').run(answer);
  const hub=memoryHub(db),[lease]=await hub.lease({kinds:['assess'],max:1,runner,capabilities:['lesson-v3']});
  const engine=fakeEngine('qwen',[context=>{
   const result=grade(context),a=context.attempts[0];
   result.grades[0].feedback=hasError?'Trật tự từ: dùng „Leider kann ich“.':'Đúng theo yêu cầu.';
   result.grades[0].errors=hasError?[{skillId:a.skills[0],label:'G: trật tự từ',category:'extra',evidence:'Leider ich kann'}]:[];
   return result;
  }]);
  assert.equal((await processJob(hub,lease,engine)).status,'succeeded');
  const saved=db.sqlite.prepare('SELECT result,score,feedback,errors FROM grades WHERE job_id=?').get(lease.jobId);
  assert.equal(saved.result,'correct');assert.equal(saved.score,1);
  assert.equal(JSON.parse(saved.errors).length,Number(hasError));
  if(hasError){assert.match(saved.feedback,/Leider kann ich/);assert.equal(JSON.parse(saved.errors)[0].category,'extra');
   const pattern=db.sqlite.prepare('SELECT label,category FROM error_patterns').get();assert.equal(pattern.category,'unknown');assert.match(pattern.label,/trật tự/);}
 }
});

test('more than two extra errors are rejected by the assessment dry run', async t => {
 const {db}=await openSubmission();t.after(()=>db.sqlite.close());
 const hub=memoryHub(db),[lease]=await hub.lease({kinds:['assess'],max:1,runner,capabilities:['lesson-v3']});
 const context=await hub.context(lease),result=grade(context),a=context.attempts[0];
 result.contextHash=context.contextHash;
 result.grades[0].errors=Array.from({length:3},(_,i)=>({skillId:a.skills[0],label:'G: '+i,category:'extra',evidence:'Paul'}));
 const checked=await hub.result(lease,result,true);assert.equal(checked.status,422);
 assert.ok(checked.body.errors.some(e=>e.path==='/grades/0/errors'));
});
