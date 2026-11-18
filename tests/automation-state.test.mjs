import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from './d1-adapter.mjs';
import { createAutomationRun, serveAutomationContext, acceptAutomationResult, readAutomationRun } from '../lib/automation/state.ts';
import { startRunSchema, resultSchema, automationJsonSchema } from '../lib/automation/schema.ts';
import { decideReplacement } from '../lib/automation/replacement.ts';

const now = new Date('2026-10-09T05:00:00.000Z');
const runner = { contractVersion: '1', trigger: 'manual', runner: { name: 'test-runner', version: '0.1.0', model: 'none' } };
const lesson = { title: 'Deutsch A2', objective: 'Write a short email', minutes: 30, level: 'A2', sections: [{ heading: 'Form', text: 'Greet, explain, close.' }, { heading: 'Example', text: 'Guten Tag ...' }], diagram: 'Anfrage → Grund → Bitte', exercise: 'Write an appointment request.', questions: [{ question: 'How do you open a formal email?', answer: 'Guten Tag ...' }, { question: 'How do you close?', answer: 'Mit freundlichen Grüßen' }], deliverable: 'One email draft', sources: [{ title: 'Official lesson', url: 'https://example.org/deutsch', readScope: 'Full page', retrievedAt: now.toISOString(), publishedAt: null }], nextTopic: 'Past tense' };

function addUser(db, id, email, status = 'active') {
  db.sqlite.prepare('INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at,role,status) VALUES(?,?,?,?,?,?,?,?)')
    .run(id, 'Private Name', email, 1, 1, 1, id === 'admin' ? 'admin' : 'learner', status);
}

test('start is idempotent per client and rejects a reused key with different input', async () => {
  const db = memoryDb({ through: "0025" });
  const input = startRunSchema.parse(runner);
  const first = await createAutomationRun(db, 'test-runner', input, 'daily-2026-10-09', now);
  const replay = await createAutomationRun(db, 'test-runner', input, 'daily-2026-10-09', now);
  assert.equal(replay.runId, first.runId);
  assert.equal(replay.replayed, true);
  await assert.rejects(createAutomationRun(db, 'test-runner', { ...input, trigger: 'scheduled' }, 'daily-2026-10-09', now), (error) => error.status === 409);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM automation_runs').get().n, 1);
  db.sqlite.close();
});

test('context is stable, excludes account identifiers, and only contains active learners', async () => {
  const db = memoryDb({ through: "0025" });
  addUser(db, 'admin', 'owner@example.test');
  addUser(db, 'pending', 'pending@example.test', 'pending');
  const input = startRunSchema.parse(runner);
  const run = await createAutomationRun(db, 'test-runner', input, null, now);
  const first = await serveAutomationContext(db, run.runId, 'test-runner', now);
  const second = await serveAutomationContext(db, run.runId, 'test-runner', now);
  assert.equal(first.contextHash, second.contextHash);
  assert.equal(first.targets.length, 5);
  assert.equal(JSON.stringify(first).includes('owner@example.test'), false);
  assert.equal(JSON.stringify(first).includes('Private Name'), false);
  assert.equal(JSON.stringify(first).includes('userId'), false);
  assert.equal(JSON.stringify(first).includes('pending@example.test'), false);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM run_targets').get().n, 5);
  db.sqlite.close();
});

test('context withholds likely identifiable clinical answers and redacts contact details', async () => {
  const db = memoryDb({ through: "0025" });
  addUser(db, 'admin', 'owner@example.test');
  db.sqlite.prepare('INSERT INTO learning_lessons(id,user_id,track,payload,assigned_date,completed_at,response,updated) VALUES(?,?,?,?,?,?,?,?)')
    .run('clinical-answer', 'admin', 'MTB', JSON.stringify(lesson), '2026-10-08', '2026-10-08T22:00:00.000Z', 'Patient: Jane Doe, MRN 123456, diagnosis details', '2026-10-08T22:00:00.000Z');
  db.sqlite.prepare('INSERT INTO learning_slots(user_id,track,lesson_id,revision) VALUES(?,?,?,?)').run('admin', 'MTB', 'clinical-answer', 0);
  const run = await createAutomationRun(db, 'test-runner', startRunSchema.parse(runner), null, now);
  const context = await serveAutomationContext(db, run.runId, 'test-runner', now);
  const answer = context.targets.find((target) => target.track === 'MTB').newAnswers[0];
  assert.equal(answer.withheldForPrivacy, true);
  assert.doesNotMatch(JSON.stringify(context), /Jane Doe|123456/);
  db.sqlite.close();
});

test('result assignment is atomic, replay-safe, scoped, and never replaces unfinished work', async () => {
  const db = memoryDb({ through: "0025" });
  addUser(db, 'admin', 'owner@example.test');
  addUser(db, 'learner-b', 'second@example.test');
  db.sqlite.prepare('INSERT INTO learning_lessons(id,user_id,track,payload,assigned_date,completed_at,response,updated) VALUES(?,?,?,?,?,?,?,?)')
    .run('unfinished', 'admin', 'Deutsch', JSON.stringify(lesson), '2026-10-08', null, 'Saved answer must stay', '2026-10-08T18:00:00.000Z');
  db.sqlite.prepare('INSERT INTO learning_slots(user_id,track,lesson_id,revision) VALUES(?,?,?,?)').run('admin', 'Deutsch', 'unfinished', 0);

  const input = startRunSchema.parse(runner);
  const run = await createAutomationRun(db, 'test-runner', input, 'e2e', now);
  const context = await serveAutomationContext(db, run.runId, 'test-runner', now);
  const adminGerman = context.targets.find((target) => target.learner.ref && target.track === 'Deutsch' && !target.eligible);
  const learnerBFirst = context.targets.find((target) => target.track === 'Deutsch' && target.targetId !== adminGerman.targetId);
  assert.equal(adminGerman.eligibility, 'not_completed');
  const result = resultSchema.parse({
    contractVersion: '1', contextHash: context.contextHash, summary: 'Two targets considered.',
    items: [
      { targetId: adminGerman.targetId, action: 'assign', expectedCurrentLessonId: 'unfinished', lesson },
      { targetId: learnerBFirst.targetId, action: 'assign', expectedCurrentLessonId: null, lesson },
    ],
  });
  const saved = await acceptAutomationResult(db, run.runId, 'test-runner', result, now);
  assert.equal(saved.status, 'finished');
  assert.equal(saved.items.find((item) => item.targetId === adminGerman.targetId).outcome, 'kept');
  assert.equal(saved.items.find((item) => item.targetId === learnerBFirst.targetId).outcome, 'assigned');
  assert.equal(db.sqlite.prepare("SELECT response FROM learning_lessons WHERE id='unfinished'").get().response, 'Saved answer must stay');
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM learning_lessons WHERE user_id='admin' AND track='Deutsch'").get().n, 1);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM learning_lessons WHERE user_id='learner-b' AND track='Deutsch'").get().n, 1);
  const replay = await acceptAutomationResult(db, run.runId, 'test-runner', result, now);
  assert.equal(replay.replayed, true);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM run_items WHERE run_id=?').get(run.runId).n, 10);
  assert.equal((await readAutomationRun(db, run.runId, 'test-runner', now)).status, 'finished');
  await assert.rejects(acceptAutomationResult(db, run.runId, 'other-client', result, now), (error) => error.status === 404);
  await assert.rejects(acceptAutomationResult(db, run.runId, 'test-runner', { ...result, summary: 'Different' }, now), (error) => error.status === 409);
  db.sqlite.close();
});

test('result with a stale expected lesson returns kept instead of overwriting concurrent progress', async () => {
  const db = memoryDb({ through: "0025" });
  addUser(db, 'admin', 'owner@example.test');
  const run = await createAutomationRun(db, 'test-runner', startRunSchema.parse(runner), null, now);
  const context = await serveAutomationContext(db, run.runId, 'test-runner', now);
  const target = context.targets.find((item) => item.track === 'Deutsch');
  db.sqlite.prepare('INSERT INTO learning_lessons(id,user_id,track,payload,assigned_date,completed_at,response,updated) VALUES(?,?,?,?,?,?,?,?)')
    .run('concurrent', 'admin', 'Deutsch', JSON.stringify(lesson), '2026-10-09', null, 'Keep me', now.toISOString());
  db.sqlite.prepare('INSERT INTO learning_slots(user_id,track,lesson_id,revision) VALUES(?,?,?,?)').run('admin', 'Deutsch', 'concurrent', 0);
  const result = resultSchema.parse({ contractVersion: '1', contextHash: context.contextHash, summary: 'Stale target', items: [{ targetId: target.targetId, action: 'assign', expectedCurrentLessonId: null, lesson }] });
  const saved = await acceptAutomationResult(db, run.runId, 'test-runner', result, now);
  assert.equal(saved.items.find((item) => item.targetId === target.targetId).outcome, 'kept');
  assert.equal(db.sqlite.prepare("SELECT response FROM learning_lessons WHERE id='concurrent'").get().response, 'Keep me');
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM learning_lessons WHERE user_id='admin' AND track='Deutsch'").get().n, 1);
  db.sqlite.close();
});

test('automation refuses lesson content containing identifiable clinical or contact details', async () => {
  const db = memoryDb({ through: "0025" });
  addUser(db, 'admin', 'owner@example.test');
  const run = await createAutomationRun(db, 'test-runner', startRunSchema.parse(runner), null, now);
  const context = await serveAutomationContext(db, run.runId, 'test-runner', now);
  const target = context.targets.find((item) => item.track === 'MTB');
  const unsafeLesson = { ...lesson, sections: [{ heading: 'Topic', text: 'Patient: Jane Doe, MRN 123456.' }, ...lesson.sections.slice(1)] };
  const result = resultSchema.parse({ contractVersion: '1', contextHash: context.contextHash, summary: 'Candidate', items: [{ targetId: target.targetId, action: 'assign', expectedCurrentLessonId: null, lesson: unsafeLesson }] });
  await assert.rejects(acceptAutomationResult(db, run.runId, 'test-runner', result, now), (error) => error.status === 400);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM learning_lessons').get().n, 0);
  assert.equal(db.sqlite.prepare('SELECT status FROM automation_runs WHERE id=?').get(run.runId).status, 'context_served');
  db.sqlite.close();
});

test('replacement decision covers incomplete, cutoff, completed, and changed targets', () => {
  const snapshot = { targetId: 'target', userId: 'u', track: 'Deutsch', eligible: true, eligibility: 'completed_before_cutoff', expectedCurrentLessonId: 'old', currentLessonId: 'old', assignedDate: '2026-10-08', completedAt: '2026-10-08T18:00:00.000Z' };
  assert.equal(decideReplacement(snapshot, { lessonId: 'old', assignedDate: '2026-10-08', completedAt: '2026-10-08T18:00:00.000Z' }, '2026-10-09').assign, true);
  assert.match(decideReplacement(snapshot, { lessonId: 'old', assignedDate: '2026-10-08', completedAt: null }, '2026-10-09').reason, /chưa hoàn thành/);
  assert.match(decideReplacement(snapshot, { lessonId: 'old', assignedDate: '2026-10-08', completedAt: '2026-10-09T02:00:00.000Z' }, '2026-10-09').reason, /mốc 03:00/);
  assert.match(decideReplacement(snapshot, { lessonId: 'new', assignedDate: '2026-10-09', completedAt: null }, '2026-10-09').reason, /đổi/);
});

test('published contract schema exposes the versioned runner payloads', () => {
  assert.equal(automationJsonSchema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.deepEqual(automationJsonSchema.definitions.result.required, ['contractVersion', 'contextHash', 'summary', 'items']);
  assert.deepEqual(automationJsonSchema.definitions.lessonPackage.required, ['title', 'objective', 'minutes', 'level', 'sections', 'diagram', 'exercise', 'questions', 'deliverable', 'sources', 'nextTopic']);
  assert.equal(resultSchema.safeParse({ contractVersion: '1', contextHash: 'sha256:' + 'a'.repeat(64), summary: '', items: [{ targetId: 'tgt_' + 'a'.repeat(32), action: 'issue', reason: 'x' }, { targetId: 'tgt_' + 'a'.repeat(32), action: 'issue', reason: 'y' }] }).success, false);
});

test('expired runs transition once, emit an event, and cannot accept context or results', async () => {
  const db = memoryDb({ through: "0025" });
  const run = await createAutomationRun(db, 'test-runner', startRunSchema.parse(runner), null, now);
  const afterExpiry = new Date(now.getTime() + 2 * 60 * 60 * 1000 + 1000);
  assert.equal((await readAutomationRun(db, run.runId, 'test-runner', afterExpiry)).status, 'expired');
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM run_events WHERE run_id=? AND type='expired'").get(run.runId).n, 1);
  await assert.rejects(serveAutomationContext(db, run.runId, 'test-runner', afterExpiry), (error) => error.status === 410);
  assert.throws(() => db.sqlite.prepare('UPDATE run_events SET detail=? WHERE run_id=?').run('{}', run.runId), /append-only/);
  db.sqlite.close();
});
