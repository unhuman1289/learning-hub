import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { itemPolicy } from '../lib/subjects/item-kinds.ts';
import { normalizeLesson, normalizePlan } from '../integrations/home-runner/job.mjs';
import { validateLessonPackage } from '../lib/lesson-v2/validate.ts';

import { normalizeNumericKeyValue, numericKeyValuePattern, parseNumericAnswer } from '../lib/lesson-v2/numeric.ts';

import { memoryDb } from '../tests/d1-adapter.mjs';
import { createSubject } from '../lib/subjects/service.ts';
import { parseSubjectInput } from '../lib/subjects/policy.ts';
import { createRequest, parseRequest } from '../lib/requests/service.ts';
import { enqueue } from '../lib/ai-jobs/queue.ts';
import { leaseJobs, readJob } from '../lib/ai-jobs/lease.ts';
import { applyResult } from '../lib/ai-jobs/result.ts';

async function replayOpening(raw) {
  const db = memoryDb();
  try {
    const now = new Date('2026-11-14T15:00:00Z');
    const learner = 'q2-demo';
    db.sqlite.prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at,role,status) VALUES(?,'Demo','q2@example.test',1,1,1,'learner','active')").run(learner);
    const client = { id: 'replay', scopes: ['jobs:plan'], learnerIds: [learner], purposes: ['initial'], triggers: ['on_demand'] };
    const notebook = await createSubject(db, learner, learner, parseSubjectInput({ title: 'Toán 7', goal: 'Ôn cộng phân số lớp 7' }), now);
    // Match the failure condition: an ordinary unfinished lesson fills the cap.
    db.sqlite.prepare("INSERT INTO subjects(id,learner_id,title,template,status,created_by,created_at,updated_at) VALUES('other',?,'Sổ mẫu','skill','active',?,'t','t')").run(learner, learner);
    db.sqlite.prepare("INSERT INTO learning_lessons(id,user_id,subject_id,payload,assigned_date,updated,package_version,template,kind,slot,est_minutes) VALUES('ordinary',?,'other','{}','2026-11-14','t','3','skill','new','primary',68)").run(learner);
    const job = await enqueue(db, {}, { learnerId: learner, kind: 'plan', purpose: 'initial', subjectId: notebook.id }, now);
    const [lease] = await leaseJobs(db, client, {
      kinds: ['plan'], max: 1, capabilities: ['lesson-v3', 'roadmap-v2'],
      runner: { name: 'replay', version: '1', model: 'none' },
    }, 'local', now);
    const persisted = await readJob(db, job.id);
    const context = JSON.parse(persisted.context_snapshot);
    const payload = normalizePlan({
      ...raw, contextHash: persisted.context_hash, usage: { model: 'fixture', inputTokens: 0, outputTokens: 0, ms: 0 },
      subjects: raw.subjects.map(subject => ({
        ...subject, subjectId: notebook.id, expectedRevision: context.subjects[0].revision,
        expectedOpenPrimaryLessonId: null,
      })),
    });
    assert(context.policy.openMinutesNow >= context.policy.maxOpenMinutes);
    const saved = await applyResult(db, client, job.id, lease.leaseToken, payload, false, now);
    assert.equal(saved.status, 200, JSON.stringify(saved));
    assert.equal(saved.outcome.subjects[0].lessonIds.length, 1);
    assert.equal(db.sqlite.prepare('SELECT count(*) n FROM roadmap_steps WHERE subject_id=?').get(notebook.id).n, 5);
    return saved;
  } finally {
    db.sqlite.close();
  }
}

async function replayRequest(raw, expectedSteps) {
  const db = memoryDb();
  try {
    const now = new Date('2026-11-14T15:00:00Z');
    const learner = 'phone-demo';
    db.sqlite.prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at,role,status) VALUES(?,'Demo','phone@example.test',1,1,1,'learner','active')").run(learner);
    const client = { id: 'replay', scopes: ['jobs:plan'], learnerIds: [learner], purposes: ['request'], triggers: ['on_demand'] };
    const notebook = await createSubject(db, learner, learner, parseSubjectInput({ title: 'Deutsch', goal: 'Deutsch A1, W-Fragen' }), now);
    db.sqlite.prepare("UPDATE subjects SET status='active' WHERE id=?").run(notebook.id);
    db.sqlite.prepare(`INSERT INTO skills(id,subject_id,learner_id,key,name,description,path_order,prerequisites,status,origin,created_at,updated_at)
      VALUES('sk_replay',?,?,'w-fragen','W-Fragen','',1,'[]','active','ai',?,?)`).run(notebook.id, learner, now.toISOString(), now.toISOString());
    const requested = await createRequest(db, {}, learner, learner, parseRequest({ subjectId: notebook.id, mode: 'learn', clientRequestId: crypto.randomUUID() }), now);
    const [lease] = await leaseJobs(db, client, {
      kinds: ['plan'], max: 1, capabilities: ['lesson-v3', 'adaptive-plan', 'roadmap-v2'],
      runner: { name: 'replay', version: '1', model: 'none' },
    }, 'local', now);
    const persisted = await readJob(db, lease.jobId);
    const context = JSON.parse(persisted.context_snapshot);
    assert.equal(context.adaptive.roadmapTask, 'replan');
    const payload = normalizePlan({
      ...raw, contextHash: persisted.context_hash, usage: { model: 'fixture', inputTokens: 0, outputTokens: 0, ms: 0 },
      subjects: raw.subjects.map(subject => ({
        ...subject, subjectId: notebook.id, expectedRevision: context.subjects[0].revision,
      })),
      explorations: raw.explorations.map(exploration => ({ ...exploration, requestId: requested.id, subjectId: notebook.id })),
    });
    const saved = await applyResult(db, client, lease.jobId, lease.leaseToken, payload, false, now);
    assert.equal(saved.status, 200, JSON.stringify(saved));
    const [lessonId] = saved.outcome.extraLessonIds;
    assert(lessonId);
    assert.equal(db.sqlite.prepare('SELECT result_lesson_id FROM learner_requests WHERE id=?').get(requested.id).result_lesson_id, lessonId);
    assert.equal(db.sqlite.prepare('SELECT count(*) n FROM roadmap_steps WHERE subject_id=?').get(notebook.id).n, expectedSteps);
    console.log('đã lưu bài Xin bài; số bước mới:', expectedSteps);
  } finally {
    db.sqlite.close();
  }
}

const numericPattern = new RegExp(numericKeyValuePattern);
const folder = new URL('../tests/fixtures/qwen/', import.meta.url);
const fixtures = readdirSync(folder).filter(name => name.endsWith('.json')).sort();
assert(fixtures.length, 'Thiếu fixture Qwen.');
for (const name of fixtures) {
  const fixture = JSON.parse(readFileSync(new URL(name, folder), 'utf8'));
  if (fixture.requestCapture) {
    await replayRequest(fixture.requestCapture, fixture.expectedSteps);
    continue;
  }
  if (fixture.openingCapture) {
    const result = await replayOpening(fixture.openingCapture);
    console.log(name, result.status, "đã lưu bài chẩn đoán và 5 bước");
    continue;
  }
  if (fixture.numericCaptures) {
    const rawValues = fixture.numericCaptures.flatMap(capture => Object.values(capture.items));
    assert.equal(rawValues.length, 20);
    for (const raw of rawValues) {
      assert(!numericPattern.test(raw), JSON.stringify(raw));
      assert.equal(parseNumericAnswer(normalizeNumericKeyValue(raw)), null, JSON.stringify(raw));
    }
    for (const { raw, normalized, valid } of fixture.normalizationCases) {
      assert.equal(normalizeNumericKeyValue(raw), normalized);
      assert.equal(numericPattern.test(normalized), valid, normalized);
      assert.equal(Boolean(parseNumericAnswer(normalized)), valid, normalized);
    }
    console.log(name, rawValues.length, 'giá trị bị từ chối;', fixture.normalizationCases.length, 'ca chuẩn hoá đã kiểm');
    continue;
  }
  const options = { aiSizes: true, adaptive: true, frameworkKey: fixture.frameworkKey, itemKinds: itemPolicy(fixture.frameworkKey).kinds };
  const before = validateLessonPackage(fixture.lesson, { ...options, aiSizes: false });
  const after = validateLessonPackage(normalizeLesson(fixture.lesson), options);
  console.log(name, before.lesson ? 'hợp lệ' : 'bị từ chối', '→', after.lesson ? 'hợp lệ' : 'bị từ chối');
  for (const issue of after.issues.slice(0, 6)) console.log(' ', issue.path, issue.code, issue.message);
  if (fixture.expectedRubricItem) {
    const item = after.lesson?.items.find(item => item.id === fixture.expectedRubricItem);
    const original = fixture.lesson.items.find(item => item.id === fixture.expectedRubricItem);
    assert(before.issues.some(issue => issue.path.endsWith('/key/accepted')));
    assert(item?.rubric?.length >= 2 && !item.key, `${name} cần chuyển sang rubric`);
    assert.equal(item.solution, original.solution);
    assert.equal(item.input, original.input);
    assert.equal(item.prompt, original.prompt);
    assert.equal(fixture.lesson.items.filter(item => item.key).length - 1, after.lesson.items.filter(item => item.key).length);
    console.log('  rubric', item.id, 'giữ đề và lời giải mẫu');
  }
  if (fixture.expectedIssues?.length) {
    for (const path of fixture.expectedIssues)
      assert(after.issues.some(issue => issue.path === path), `${name} cần báo lỗi tại ${path}`);
  } else if (fixture.expectedIssues) {
    assert(after.lesson, `${name} cần qua kiểm tra sau khi sửa tự động`);
  }
}
