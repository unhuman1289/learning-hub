import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { memoryDb } from './d1-adapter.mjs';
import { insertLessonV2, itemView, readLessonV2 } from '../lib/lesson-v2/store.ts';
import { parseDraft, reveal, saveDraft, snooze } from '../lib/lesson-v2/actions.ts';
import { validateLessonPackage } from '../lib/lesson-v2/validate.ts';
import { resolveLearner } from '../lib/access.ts';

const fixture = validateLessonPackage(JSON.parse(readFileSync(new URL('../fixtures/contracts/lesson-v2/deutsch-modalverb.json', import.meta.url), 'utf8'))).lesson;
const status = async (promise) => { try { await promise; } catch (error) { return error.status; } return 200; };

async function seeded() {
  const db = memoryDb();
  db.sqlite.prepare("INSERT INTO subjects(id,learner_id,title,template,status,created_by,created_at,updated_at) VALUES('sub_aaaaaaaaaaaaaaaaaaaa','ech','Deutsch','skill','active','ly','t','t')").run();
  db.sqlite.prepare("INSERT INTO learner_settings(user_id,daily_target_minutes,updated,role) VALUES('ech',45,'t','child')").run();
  db.sqlite.prepare("INSERT INTO guardians VALUES('ly','ech','vu','t')").run();
  const id = await insertLessonV2(db, { learnerId: 'ech', subjectId: 'sub_aaaaaaaaaaaaaaaaaaaa', day: '2026-10-12', lesson: fixture });
  return { db, id };
}

test('drafts save with revisions; stale saves get 409; unknown items and oversized answers are refused', async () => {
  const { db, id } = await seeded();
  assert.deepEqual(await saveDraft(db, 'ech', id, parseDraft({ revision: 0, answers: { i2: { answer: 'Lena kann heute Suppe kochen.' } } })), { revision: 1 });
  assert.equal(await status(saveDraft(db, 'ech', id, parseDraft({ revision: 0, answers: { i2: { answer: 'älter' } } }))), 409);
  await saveDraft(db, 'ech', id, parseDraft({ revision: 1, answers: { i2: { answer: 'neu' }, i5: { answer: 'Am Samstag …', attachmentIds: ['img_0123456789abcdef0123'] } } }));
  const view = await readLessonV2(db, 'ech', id);
  assert.equal(view.draftRevision, 2);
  assert.deepEqual(view.draft, { i2: { answer: 'neu' }, i5: { answer: 'Am Samstag …', attachmentIds: ['img_0123456789abcdef0123'] } });
  assert.equal(await status(saveDraft(db, 'ech', id, parseDraft({ revision: 2, answers: { i9: { answer: 'x' } } }))), 400);
  assert.equal(await status(saveDraft(db, 'vu', id, parseDraft({ revision: 2, answers: {} }))), 404);
  assert.throws(() => parseDraft({ revision: 2, answers: { i1: { answer: 'x'.repeat(8001) } } }), (e) => e.status === 400);
  assert.throws(() => parseDraft({ revision: 2, answers: { i1: { answer: 'x', attachmentIds: ['../etc'] } } }), (e) => e.status === 400);
  db.sqlite.close();
});

test('reveal records support before returning content and never lowers it', async () => {
  const { db, id } = await seeded();
  assert.deepEqual(await reveal(db, 'ech', id, 'i3', 'hint1'), { support: 'hint1', hints: ['möchten với er/sie/es là dạng nào?'] });
  assert.deepEqual(await reveal(db, 'ech', id, 'i3', 'hint2'), { support: 'hint2', hints: ['möchten với er/sie/es là dạng nào?', 'möchte ở vị trí 2, kaufen ra cuối câu.'] });
  const solution = await reveal(db, 'ech', id, 'i3', 'solution');
  assert.equal(solution.solution, 'Paul möchte einen Kuchen kaufen.');
  assert.equal((await reveal(db, 'ech', id, 'i3', 'hint1')).support, 'solution', 'asking for hint 1 later keeps "solution"');
  assert.deepEqual(JSON.parse(db.sqlite.prepare('SELECT support FROM learning_lessons WHERE id=?').get(id).support), { i3: 'solution' });
  assert.equal(await status(reveal(db, 'ech', id, 'i1', 'hint1')), 400, 'no hints on this item');
  assert.equal(await status(reveal(db, 'ech', id, 'i2', 'hint2')), 400, 'only one hint here');
  assert.equal(await status(reveal(db, 'ech', id, 'i3', 'everything')), 400);
  assert.equal(await status(reveal(db, 'ech', id, 'i9', 'hint1')), 404);
  db.sqlite.close();
});

test('snooze hides a lesson until the next Berlin day', async () => {
  const { db, id } = await seeded();
  assert.deepEqual(await snooze(db, 'ech', id, new Date('2026-10-12T22:30:00Z')), { snoozedUntil: '2026-10-14' }, '00:30 Berlin on the 13th → the 14th');
  assert.deepEqual(await snooze(db, 'ech', id, new Date('2026-10-12T10:00:00Z')), { snoozedUntil: '2026-10-13' });
  db.sqlite.close();
});

test('guardians read the lesson but cannot draft, reveal or snooze for the child', async () => {
  const { db, id } = await seeded();
  const req = (method = 'GET') => new Request(`https://hub.example/api/lessons/${id}?learner=ech`, { method });
  assert.equal(await resolveLearner(db, { id: 'ly' }, req(), 'read_work'), 'ech');
  for (const action of ['edit_work']) assert.equal((await resolveLearner(db, { id: 'ly' }, req('PUT'), action)).status, 404);
  assert.equal((await resolveLearner(db, { id: 'bot' }, req(), 'read_work')).status, 404);
  db.sqlite.close();
});

test('distractor error labels stay hidden until the item is graded', () => {
  const fixture = JSON.parse(readFileSync(new URL('../fixtures/lessons/deutsch-modalverb.json', import.meta.url), 'utf8'));
  const item = fixture.items.find((candidate) => candidate.choices?.some((choice) => choice.errorLabel));
  assert(item);
  assert(!JSON.stringify(itemView(item, 'retrieval', undefined, false)).includes('errorLabel'));
  assert(JSON.stringify(itemView(item, 'retrieval', undefined, true)).includes('errorLabel'));
});
