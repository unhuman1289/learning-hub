import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { memoryDb } from './d1-adapter.mjs';
import { insertLessonV2, itemView, readLessonV2 } from '../lib/lesson-v2/store.ts';
import { parseDraft, reveal, saveDraft, snooze } from '../lib/lesson-v2/actions.ts';
import { validateLessonPackage } from '../lib/lesson-v2/validate.ts';
import { parseSubmission, submitLesson } from '../lib/evidence/submit.ts';
import { todayFor } from '../lib/today.ts';
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


test('one request saves the draft and submits, with idempotent replay and revision checks', async () => {
  const { db, id } = await seeded();
  const input = {
    clientSubmissionId: '00000000-0000-4000-8000-000000000001',
    draftRevision: 0, itemIds: ['i2'], answers: { i2: { answer: 'Lena kann heute Suppe kochen.' } },
  };
  const bad = { ...input, answers: { ...input.answers, i99: { answer: 'other item' } } };
  assert.equal(await status(submitLesson(db, 'ech', id, parseSubmission(bad))), 400);
  assert.equal((await readLessonV2(db, 'ech', id)).draftRevision, 0);
  const first = await submitLesson(db, 'ech', id, parseSubmission(input));
  const replay = await submitLesson(db, 'ech', id, parseSubmission(input));
  assert.equal(replay.id, first.id);
  assert.equal(replay.replayed, true);
  assert.equal(first.attempts[0].answer, input.answers.i2.answer);
  const lesson = await readLessonV2(db, 'ech', id);
  assert.equal(lesson.draftRevision, 1);
  assert.deepEqual(lesson.draft, input.answers);
  assert.equal(await status(submitLesson(db, 'ech', id, parseSubmission({
    ...input, clientSubmissionId: '00000000-0000-4000-8000-000000000002',
  }))), 409);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM submissions').get().n, 1);
  db.sqlite.close();
});


test('today reads its four independent datasets in one concurrent round', async () => {
  const { db } = await seeded();
  const pending = [];
  const hold = read => new Promise(resolve => pending.push(() => resolve(read())));
  const counted = {
    prepare(sql) {
      return {
        bind(...args) {
          const stmt = db.prepare(sql).bind(...args);
          return { first: () => hold(() => stmt.first()), all: () => hold(() => stmt.all()) };
        },
      };
    },
  };
  const today = todayFor(counted, 'ech', new Date('2026-10-12T12:00:00Z'), 'ly');
  assert.equal(pending.length, 4);
  pending.forEach(release => release());
  assert.equal((await today).items.length, 1);
  db.sqlite.close();
});

test('desk marks only saved AI feedback for the learner and unfinished lesson', async () => {
  const { db, id } = await seeded();
  const submitted = await submitLesson(db, 'ech', id, parseSubmission({ clientSubmissionId: crypto.randomUUID(), draftRevision: 0, itemIds: ['i2'], answers: { i2: { answer: 'Test' } } }));
  const attempt = submitted.attempts[0].id;
  db.sqlite.prepare("INSERT INTO ai_jobs(id,kind,purpose,trigger,learner_id,learning_day,priority,status,dedupe_key,created_at,updated_at,expires_at) VALUES('job_aaaaaaaaaaaaaaaaaaaa','assess','submission','on_demand','ech','2026-10-12',1,'queued','test','t','t','2099')").run();
  db.sqlite.prepare("INSERT INTO grades(id,attempt_id,grader,job_id,result,score,feedback,correction,created_at) VALUES('gr_test',?,'ai','job_aaaaaaaaaaaaaaaaaaaa','correct',1,'Tốt','','t')").run(attempt);
  db.sqlite.prepare("UPDATE attempts SET current_grade_id='gr_test',status='graded' WHERE id=?").run(attempt);
  const read = async learner => (await todayFor(db,learner,new Date('2026-10-12T12:00:00Z'),'ly')).items;
  assert.equal((await read('ech'))[0].hasFeedback,false);
  db.sqlite.prepare("UPDATE ai_jobs SET status='succeeded' WHERE id='job_aaaaaaaaaaaaaaaaaaaa'").run();
  assert.equal((await read('ech'))[0].hasFeedback,true);
  assert.equal((await read('other')).length,0);
  db.sqlite.prepare("UPDATE learning_lessons SET completed_at='2026-10-12T13:00:00Z' WHERE id=?").run(id);
  assert.equal((await read('ech')).length,0);
});
