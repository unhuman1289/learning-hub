import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { memoryDb } from './d1-adapter.mjs';
import { queueSubmission } from '../lib/ai-jobs/queue.ts';
import { autoGrade } from '../lib/evidence/autograde.ts';
import { evidenceStrength } from '../lib/evidence/strength.ts';
import { parseSubmission, submitLesson, readSubmission, readLessonSubmissions } from '../lib/evidence/submit.ts';
import { insertLessonV2 } from '../lib/lesson-v2/store.ts';
import { saveDraft, reveal, completeLesson } from '../lib/lesson-v2/actions.ts';
import { importLesson } from '../lib/lesson-v2/import.ts';
const fixture = JSON.parse(readFileSync(new URL('../fixtures/contracts/lesson-v2/deutsch-modalverb.json', import.meta.url), 'utf8'));
const sid = 'sub_aaaaaaaaaaaaaaaaaaaa';
async function seed() {
  const db = memoryDb();
  db.sqlite
    .prepare(
      "INSERT INTO subjects(id,learner_id,title,template,status,created_by,created_at,updated_at) VALUES(?,?,'Deutsch','skill','active','admin','t','t')",
    )
    .run(sid, 'learner');
  const id = await insertLessonV2(db, { learnerId: 'learner', subjectId: sid, day: '2026-10-11', lesson: fixture });
  return { db, id };
}
const status = async (p) => {
  try {
    await p;
    return 200;
  } catch (e) {
    return e.status;
  }
};
const input = (revision = 1, itemIds = ['i1']) => parseSubmission({ clientSubmissionId: crypto.randomUUID(), draftRevision: revision, itemIds });
test('autograde matrix: exact sets, numeric units/tolerances and German normalization (40+ cases)', () => {
  const cases = [];
  const text = { type: 'text', accepted: ['kochen'], caseSensitive: true };
  for (const answer of ['kochen', ' kochen ', 'kochen.', 'kochen!', 'kochen?', '  kochen.  ']) cases.push([text, answer, true]);
  for (const answer of ['Kochen', 'kocht', 'gekocht', '', 'ko chen', 'kochen morgen']) cases.push([text, answer, false]);
  const insensitive = { ...text, caseSensitive: false };
  for (const a of ['Kochen', 'KOCHEN', 'kochen.']) cases.push([insensitive, a, true]);
  const umlaut = { type: 'text', accepted: ['ä'], caseSensitive: false };
  cases.push([umlaut, 'a\u0308', true], [umlaut, 'Ä', true], [umlaut, 'ae', false], [umlaut, 'a', false]);
  const numeric = { type: 'numeric', value: '0.75', unit: null, tolerance: 0.001 };
  for (const a of ['0,75', '0.75', '3/4', '6/8', ' 0.75 ', '0.7505']) cases.push([numeric, a, true]);
  for (const a of ['0.8', '3/0', 'abc', '1.000,5', '0.75 kg']) cases.push([numeric, a, false]);
  cases.push([{ ...numeric, value: '-2', tolerance: 0 }, '-4/2', true], [{ ...numeric, value: '-2', tolerance: 0 }, '2', false]);
  const money = { type: 'numeric', value: '7.5', unit: '€', tolerance: 0 };
  cases.push([money, '7,50 €', true], [money, '7.5', true], [money, '7.5 $', false]);
  const choice = { type: 'choice', correct: ['a', 'c'] };
  for (const a of ['["a","c"]', '["c","a"]']) cases.push([choice, a, true]);
  for (const a of ['a', '["a"]', '["a","c","c"]', '["a","b"]', '["a","c","d"]', 'not json']) cases.push([choice, a, false]);
  assert.ok(cases.length >= 40);
  for (const [key, answer, correct] of cases) assert.equal(autoGrade(key, answer).result, correct ? 'correct' : 'incorrect', answer);
  assert.equal(autoGrade(text, 'kochen').feedback, 'Đúng.');
  assert.equal(autoGrade(text, 'kocht').feedback, 'Chưa đúng. Đọc lại đề và thử sửa nhé.');
});
test('text key normalization accepts typography variants while preserving spelling and meaning', () => {
  const cases = [
    ['nach Hause', 'nach\u00a0Hause', true],
    ['nach Hause', 'nach\u202fHause', true],
    ['"Hallo"', '„Hallo“', true],
    ['"Hallo"', '“Hallo”', true],
    ["geht's", 'geht‘s', true],
    ["geht's", 'geht’s', true],
    ['A-B', 'A‐B', true],
    ['A-B', 'A‑B', true],
    ['A-B', 'A–B', true],
    ['A-B', 'A—B', true],
    ['A-B', 'A－B', true],
    ['A-B', 'AB', false],
    ...Array.from('…,;:．！，；：？', mark => ['Hallo', 'Hallo' + mark, true]),
    ['Hallo Welt', 'Hallo, Welt', false],
    ['hòa', 'hoà', true],
    ['thuỷ', 'thủy', true],
    ['khỏe', 'khoẻ', true],
    ['HÒA', 'HOÀ'.normalize('NFD'), true],
    ['hòa', 'hóa', false],
    ['hoàn', 'hòan', false],
    ['3.5', '3,5', true],
    ['Giá -3,5 kg', 'Giá -3.5 kg', true],
    ['3.5', '3,5！', true],
    ['3.5kg', '3,5kg', false],
    ['A3.5', 'A3,5', false],
    ['1.234.5', '1.234,5', false],
    ['3.5', '35', false],
    ['Häuser', 'Hause', false],
    ['schön', 'schon', false],
    ['für', 'fur', false],
    ['Straße', 'Strase', false],
    ['Straße', 'Strasse', false],
    [['Straße', 'Strasse'], 'Strasse', true],
    ['mà', 'ma', false],
  ];
  for (const [expected, answer, correct] of cases) {
    const accepted = Array.isArray(expected) ? expected : [expected];
    const key = { type: 'text', accepted, caseSensitive: true };
    assert.equal(autoGrade(key, answer).result, correct ? 'correct' : 'incorrect',
      `${JSON.stringify(accepted)} vs ${JSON.stringify(answer)}`);
  }
});

test('ambiguous numbers ask for clarification without saving a submission or consuming an attempt', async () => {
  const { db, id } = await seed();
  const item = structuredClone(fixture.items[0]);
  item.input = 'short';
  item.key = { type: 'numeric', value: '1000', unit: null, tolerance: 0 };
  db.sqlite.prepare('UPDATE lesson_items SET payload=? WHERE lesson_id=? AND item_id=?')
    .run(JSON.stringify(item), id, item.id);
  const request = { ...input(0, [item.id]), answers: { [item.id]: { answer: '1.000' } } };
  await assert.rejects(submitLesson(db, 'learner', id, request), {
    status: 422,
    message: 'Bạn muốn viết 1000 hay 1?',
  });
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM submissions').get().n, 0);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM grades').get().n, 0);
  const saved = await submitLesson(db, 'learner', id, {
    ...request,
    answers: { [item.id]: { answer: '1000' } },
  });
  assert.equal(saved.attempts[0].result, 'correct');
  assert.equal(saved.attempts[0].attempt_no, 1);
});

test('evidence strength distinguishes help, retry, solution and ungradable', () => {
  assert.equal(evidenceStrength('correct', 'none', 1), 'E3');
  assert.equal(evidenceStrength('correct', 'none', 2), 'E2');
  assert.equal(evidenceStrength('partial', 'none', 1), 'E2');
  assert.equal(evidenceStrength('correct', 'hint1', 1), 'E1');
  assert.equal(evidenceStrength('correct', 'solution', 1), 'E0');
  assert.equal(evidenceStrength('ungradable', 'none', 1), null);
});
test('submission auto-grades closed items, leaves open pending, preserves retries and replays', async () => {
  const { db, id } = await seed();
  await saveDraft(db, 'learner', id, { revision: 0, answers: { i1: { answer: '["b"]' }, i3: { answer: 'Paul möchte einen Kuchen kaufen.' } } });
  const x = input(1, ['i1', 'i3']);
  const a = await submitLesson(db, 'learner', id, x);
  assert.equal(a.status, 'deferred');
  assert.equal(a.attempts[0].result, 'correct');
  assert.equal(a.attempts[1].status, 'pending');
  const replay = await submitLesson(db, 'learner', id, x);
  assert.equal(replay.id, a.id);
  assert.equal(replay.replayed, true);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM attempts').get().n, 2);
  assert.equal(await status(submitLesson(db, 'learner', id, { ...x, stage: 'guided' })), 409);
  assert.equal(await status(readSubmission(db, 'other', a.id)), 404);
  const next = await submitLesson(db, 'learner', id, input());
  assert.equal(next.attempts[0].attempt_no, 2);
  assert.equal(next.attempts[0].retry_of, a.attempts[0].id);
  assert.equal(next.attempts[0].strength, 'E2');
  db.sqlite.close();
});
test('a retry after the first hidden correction does not count as worked with the solution', async () => {
  const { db, id } = await seed();
  await saveDraft(db, 'learner', id, { revision: 0, answers: { i1: { answer: '["a"]' } } });
  const wrong = await submitLesson(db, 'learner', id, input(1, ['i1']));
  assert.equal(wrong.attempts[0].result, 'incorrect');
  await saveDraft(db, 'learner', id, { revision: 1, answers: { i1: { answer: '["b"]' } } });
  const retry = await submitLesson(db, 'learner', id, input(2, ['i1']));
  assert.equal(retry.attempts[0].result, 'correct');
  assert.equal(wrong.attempts[0].correctionHidden, true);
  assert.equal(retry.attempts[0].support, 'none');
  assert.equal(retry.attempts[0].strength, 'E2');
  db.sqlite.close();
});
test('ownership, stage, stale draft and photo ownership failures write nothing', async () => {
  const { db, id } = await seed();
  await saveDraft(db, 'learner', id, { revision: 0, answers: { i1: { answer: '["b"]' } } });
  assert.equal(await status(submitLesson(db, 'other', id, input())), 404);
  assert.equal(await status(submitLesson(db, 'learner', id, input(0))), 409);
  assert.equal(await status(submitLesson(db, 'learner', id, { ...input(), stage: 'guided' })), 400);
  await saveDraft(db, 'learner', id, { revision: 1, answers: { i5: { answer: 'My answer', attachmentIds: ['img_aaaaaaaaaaaaaaaaaaaa'] } } });
  assert.equal(await status(submitLesson(db, 'learner', id, input(2, ['i5']))), 400);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM submissions').get().n, 0);
  db.sqlite.close();
});
test('support is copied from server reveal, not from submitted fields', async () => {
  const { db, id } = await seed();
  await saveDraft(db, 'learner', id, { revision: 0, answers: { i2: { answer: 'Lena kann heute Suppe kochen.' } } });
  await reveal(db, 'learner', id, 'i2', 'solution');
  const result = await submitLesson(db, 'learner', id, input(1, ['i2']));
  assert.equal(result.attempts[0].support, 'solution');
  assert.equal(result.attempts[0].strength, 'E0');
  assert.throws(() => parseSubmission({ ...input(), support: 'none' }));
  db.sqlite.close();
});
test('rate limit is per learner and replay remains allowed at limit', async () => {
  const { db, id } = await seed();
  await saveDraft(db, 'learner', id, { revision: 0, answers: { i1: { answer: '["b"]' } } });
  const firstInput = input(),
    first = await submitLesson(db, 'learner', id, firstInput);
  for (let i = 1; i < 30; i++) await submitLesson(db, 'learner', id, input());
  assert.equal(await status(submitLesson(db, 'learner', id, input())), 429);
  assert.equal((await submitLesson(db, 'learner', id, firstInput)).id, first.id);
  db.sqlite.close();
});
test('import validates paths and keeps unfinished lessons; completion can be undone without losing answers', async () => {
  const { db, id } = await seed();
  assert.ok((await importLesson(db, { learnerId: 'learner', subjectId: sid, reviewed: true, lesson: {} })).issues[0].path !== undefined);
  assert.equal(await status(importLesson(db, { learnerId: 'learner', subjectId: sid, reviewed: true, lesson: fixture })), 409);
  await saveDraft(db, 'learner', id, { revision: 0, answers: { i1: { answer: '["b"]' } } });
  db.sqlite.prepare("UPDATE learning_lessons SET completed_at='2026-10-11T01:00:00Z' WHERE id=?").run(id);
  const assigned = await importLesson(
    db,
    { learnerId: 'learner', subjectId: sid, reviewed: true, lesson: fixture },
    new Date('2026-10-12T07:00:00Z'),
  );
  assert.match(assigned.lessonId, /^les_/);
  assert.equal(JSON.parse(db.sqlite.prepare('SELECT draft FROM learning_lessons WHERE id=?').get(id).draft).i1.answer, '["b"]');
  db.sqlite.prepare('UPDATE learning_lessons SET completed_at=NULL WHERE id=?').run(assigned.lessonId);
  assert.equal(db.sqlite.prepare('PRAGMA foreign_key_check').all().length, 0);
  db.sqlite.close();
});

test('v2 completion and undo preserve draft/grades and stale timestamps are rejected', async () => {
  const { db, id } = await seed();
  await saveDraft(db, 'learner', id, { revision: 0, answers: { i1: { answer: '["b"]' } } });
  const submitted = await submitLesson(db, 'learner', id, input());
  const row = db.sqlite.prepare('SELECT updated FROM learning_lessons WHERE id=?').get(id);
  const done = await completeLesson(db, 'learner', id, true, row.updated, new Date('2026-10-12T01:00:00Z'));
  assert.equal(done.completedAt, '2026-10-12T01:00:00.000Z');
  assert.equal(await status(completeLesson(db, 'learner', id, false, row.updated)), 409);
  await completeLesson(db, 'learner', id, false, done.updated, new Date('2026-10-12T02:00:00Z'));
  assert.equal(db.sqlite.prepare('SELECT completed_at FROM learning_lessons WHERE id=?').get(id).completed_at, null);
  assert.equal((await readSubmission(db, 'learner', submitted.id)).attempts[0].result, 'correct');
  assert.equal(JSON.parse(db.sqlite.prepare('SELECT draft FROM learning_lessons WHERE id=?').get(id).draft).i1.answer, '["b"]');
  db.sqlite.close();
});
test('all authored fixture packages meet the v2 contract', async () => {
  const { readdirSync } = await import('node:fs');
  const { validateLessonPackage } = await import('../lib/lesson-v2/validate.ts');
  for (const file of readdirSync('fixtures/lessons').filter((x) => x.endsWith('.json'))) {
    const checked = validateLessonPackage(JSON.parse(readFileSync('fixtures/lessons/' + file, 'utf8')));
    assert.deepEqual(checked.issues, [], file);
  }
});

test('backup round trip retains fractional grades, retries and foreign keys', async () => {
  const { backupColumns, buildRestoreSql } = await import('../lib/backup-contract.mjs');
  const { db, id } = await seed();
  await saveDraft(db, 'learner', id, { revision: 0, answers: { i1: { answer: '["b"]' } } });
  await submitLesson(db, 'learner', id, input());
  await submitLesson(db, 'learner', id, input());
  db.sqlite.prepare("UPDATE grades SET score=0.75,result='partial'").run();
  const snapshot = {
    format: 4,
    tables: Object.fromEntries(Object.keys(backupColumns).map((t) => [t, db.sqlite.prepare("SELECT 1 FROM sqlite_schema WHERE name=?").get(t) ? db.sqlite.prepare(`SELECT * FROM ${t}`).all() : []])),
  };
  const restored = memoryDb();
  restored.sqlite.exec('PRAGMA foreign_keys=ON');
  restored.sqlite.exec(buildRestoreSql(snapshot));
  assert.equal(restored.sqlite.prepare('SELECT score FROM grades LIMIT 1').get().score, 0.75);
  assert.equal(restored.sqlite.prepare('SELECT count(*) n FROM attempts').get().n, 2);
  assert.equal(restored.sqlite.prepare('PRAGMA foreign_key_check').all().length, 0);
  db.sqlite.close();
  restored.sqlite.close();
});

test('desk v2 summaries are scoped, omit private keys and respect snooze/archive', async () => {
  const { readCurrentV2 } = await import('../lib/lesson-v2/daily.ts');
  const { db, id } = await seed();
  const visible = await readCurrentV2(db, 'learner', '2026-10-13');
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, id);
  assert.equal(JSON.stringify(visible).includes('accepted'), false);
  assert.equal((await readCurrentV2(db, 'other', '2026-10-13')).length, 0);
  db.sqlite.prepare("UPDATE learning_lessons SET snoozed_until='2026-10-14' WHERE id=?").run(id);
  assert.equal((await readCurrentV2(db, 'learner', '2026-10-13')).length, 0);
  db.sqlite.prepare('UPDATE learning_lessons SET snoozed_until=NULL WHERE id=?').run(id);
  db.sqlite.prepare("UPDATE subjects SET status='archived' WHERE id=?").run(sid);
  assert.equal((await readCurrentV2(db, 'learner', '2026-10-13')).length, 0);
  db.sqlite.close();
});
test('support or draft race while nộp writes neither attempts nor grades', async () => {
  const { db, id } = await seed();
  await saveDraft(db, 'learner', id, { revision: 0, answers: { i1: { answer: '["b"]' } } });
  const batch = db.batch;
  db.batch = async (statements) => {
    db.sqlite.prepare('UPDATE learning_lessons SET draft_revision=draft_revision+1 WHERE id=?').run(id);
    return batch(statements);
  };
  assert.equal(await status(submitLesson(db, 'learner', id, input())), 409);
  for (const table of ['submissions', 'attempts', 'grades']) assert.equal(db.sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n, 0);
  db.sqlite.close();
});

test('import privacy scans instructions, rubric, knowledge sheet notes and source descriptions', async () => {
  const { validateLessonPackage } = await import('../lib/lesson-v2/validate.ts');
  const mutations = [
    (x) => (x.items[0].instructions = 'Patient ID: 448812'),
    (x) => (x.items[0].explanation = 'Contact person@hospital.example'),
    (x) => (x.items[2].rubric[0].description = 'Fall-Nr. 448812'),
    (x) => (x.sheet.examples[0].note = 'Patient: Max Mustermann'),
    (x) => x.sheet.checklist.push('Patient ID: 448812'),
    (x) =>
      x.sources.push({
        title: 'Record',
        url: 'https://example.com/paper',
        readScope: 'Fall-Nr. 448812',
        retrievedAt: '2026-10-13T10:00:00Z',
        publishedAt: null,
      }),
  ];
  for (const change of mutations) {
    const x = structuredClone(fixture);
    change(x);
    assert.ok(validateLessonPackage(x, { sensitivity: 'clinical' }).issues.some((i) => i.code === 'privacy'));
  }
  assert.equal(validateLessonPackage(fixture, { sensitivity: 'clinical' }).lesson !== null, true);
});

test('two-step correction: the fix stays hidden after a first wrong answer until a retry or the solution (D21)', async () => {
  const { hiddenCorrection } = await import('../lib/evidence/submit.ts');
  const first = { item_id: 'i3', result: 'incorrect', attempt_no: 1, support: 'none', correction: 'Paul möchte einen Kuchen kaufen.' };
  assert.deepEqual(hiddenCorrection(first, {}), { correction: null, correctionHidden: true });
  assert.deepEqual(hiddenCorrection({ ...first, result: 'partial' }, {}), { correction: null, correctionHidden: true });
  assert.deepEqual(hiddenCorrection({ ...first, result: 'correct' }, {}), { correctionHidden: false });
  assert.deepEqual(hiddenCorrection({ ...first, attempt_no: 2 }, {}), { correctionHidden: false });
  assert.deepEqual(hiddenCorrection(first, { i3: 'solution' }), { correctionHidden: false });
  assert.deepEqual(hiddenCorrection(first, { i3: 'hint2' }), { correction: null, correctionHidden: true });
  assert.deepEqual(hiddenCorrection({ ...first, result: null }, {}), { correctionHidden: false });
});

test('whole-lesson mode rejects per-question submission and skips revealed short answers', async () => {
  const { db } = await seed();
  const lesson = {
    ...fixture,
    contract: 'lesson-package/3',
    knowledge: [],
    gradingMode: 'whole-lesson',
    items: fixture.items.map(item => ({
      ...item,
      key: undefined,
      choices: undefined,
      input: 'short',
      attachment: 'none',
      hints: ['Hãy đọc lại câu.'],
      rubric: [{ criterion: 'Đúng ý', points: 1 }],
    })),
  };
  const id = await insertLessonV2(db, { learnerId: 'learner', subjectId: sid, day: '2026-10-12', slot: 'extra', lesson });
  assert.equal(await status(submitLesson(db, 'learner', id, input(0))), 400);
  const first = lesson.items[0].id;
  const second = lesson.items[1].id;
  await reveal(db, 'learner', id, first, 'solution');
  await reveal(db, 'learner', id, second, 'hint1');
  const answers = Object.fromEntries(lesson.items.slice(1).map(item => [item.id, { answer: 'Antwort' }]));
  const packet = parseSubmission({ clientSubmissionId: crypto.randomUUID(), draftRevision: 0, answers });
  const submitted = await submitLesson(db, 'learner', id, packet);
  assert.equal(submitted.attempts.length, lesson.items.length);
  assert.equal(submitted.attempts.find(attempt => attempt.item_id === first).score, 0);
  assert.equal(submitted.attempts.find(attempt => attempt.item_id === second).support, 'hint1');
  assert.equal(submitted.attempts.find(attempt => attempt.item_id === second).status, 'pending');
  assert.equal((await submitLesson(db, 'learner', id, packet)).replayed, true);

  const skippedId = await insertLessonV2(db, { learnerId: 'learner', subjectId: sid, day: '2026-10-13', slot: 'extra', lesson });
  for (const item of lesson.items) await reveal(db, 'learner', skippedId, item.id, 'solution');
  const skipped = await submitLesson(db, 'learner', skippedId, parseSubmission({
    clientSubmissionId: crypto.randomUUID(), draftRevision: 0,
  }));
  assert.equal(skipped.status, 'graded');
  assert.ok(skipped.attempts.every(attempt => attempt.result === 'incorrect' && attempt.score === 0));
  assert.equal(await queueSubmission(db, {}, 'learner', skipped.id), null);
});

test('whole lesson accepts blanks without creating attempts for them', async () => {
  const { db } = await seed();
  const lesson = { ...fixture, contract: 'lesson-package/3', knowledge: [], gradingMode: 'whole-lesson' };
  const id = await insertLessonV2(db, { learnerId: 'learner', subjectId: sid, day: '2026-10-14', slot: 'extra', lesson });
  const item = lesson.items.find(i => i.input === 'short');
  const submission = await submitLesson(db, 'learner', id, parseSubmission({ clientSubmissionId: crypto.randomUUID(), draftRevision: 0, answers: { [item.id]: { answer: 'Antwort' } } }));
  assert.deepEqual(submission.attempts.map(a => a.item_id), [item.id]);
  const allBlank = await insertLessonV2(db, { learnerId: 'learner', subjectId: sid, day: '2026-10-15', slot: 'extra', lesson });
  const empty = await submitLesson(db, 'learner', allBlank, parseSubmission({ clientSubmissionId: crypto.randomUUID(), draftRevision: 0 }));
  assert.equal(empty.attempts.length, 0);
});

test('whole lesson submits a photo for grading', async () => {
  const { db } = await seed();
  const lesson = { ...fixture, contract: 'lesson-package/3', knowledge: [], gradingMode: 'whole-lesson' };
  const id = await insertLessonV2(db, { learnerId: 'learner', subjectId: sid, day: '2026-10-16', slot: 'extra', lesson });
  const item = lesson.items.find(i => i.input === 'short');
  db.sqlite.prepare("UPDATE lesson_items SET payload=json_set(payload,'$.attachment','optional') WHERE lesson_id=? AND item_id=?").run(id, item.id);
  const photo = 'img_aaaaaaaaaaaaaaaaaaaa';
  db.sqlite.prepare("INSERT INTO attachments(id,learner_id,r2_key,mime,bytes,width,height,sha256,created_at,expires_at) VALUES(?,?,'test','image/png',20,2,2,?,'2026-01-01','2099-01-01')").run(photo,'learner','0'.repeat(64));
  const submission = await submitLesson(db, 'learner', id, parseSubmission({ clientSubmissionId: crypto.randomUUID(), draftRevision: 0, answers: { [item.id]: { answer: '', attachmentIds: [photo] } } }));
  assert.equal(submission.attempts.length,1);
  assert.equal(submission.attempts[0].status,'pending');
  assert.deepEqual(submission.attempts[0].attachmentIds,[photo]);
  const history = await readLessonSubmissions(db, 'learner', id);
  assert.deepEqual(history[0].attempts[0].attachmentIds, [photo]);
});

test('legacy drafts submit closed and open answers together without rewriting past attempts', async () => {
  const { db, id } = await seed();
  const answers = {
    i1: { answer: '["b"]' },
    i2: { answer: 'Lena kann heute Suppe kochen.' },
    i3: { answer: 'Paul möchte einen Kuchen kaufen.' },
  };
  await saveDraft(db, 'learner', id, { revision: 0, answers });
  const old = await submitLesson(db, 'learner', id, input());
  const snapshot = db.sqlite.prepare('SELECT payload,draft,draft_revision FROM learning_lessons WHERE id=?');
  const before = snapshot.get(id);
  const packet = parseSubmission({
    clientSubmissionId: crypto.randomUUID(), draftRevision: 1, stage: null, itemIds: null,
  });
  const submitted = await submitLesson(db, 'learner', id, packet);

  assert.equal(submitted.stage, null);
  assert.deepEqual(submitted.attempts.map(({ item_id, result, status }) => [item_id, result, status]), [
    ['i2', 'correct', 'graded'],
    ['i3', null, 'pending'],
  ]);
  assert.equal((await submitLesson(db, 'learner', id, packet)).replayed, true);
  assert.equal(await status(submitLesson(db, 'learner', id, { ...packet, clientSubmissionId: crypto.randomUUID() })), 409);
  const job = await queueSubmission(db, {}, 'learner', submitted.id);
  db.sqlite.prepare("UPDATE ai_jobs SET status='failed' WHERE id=?").run(job.id);
  const retry = await submitLesson(db, 'learner', id, { ...packet, clientSubmissionId: crypto.randomUUID() });
  assert.deepEqual(retry.attempts.map(({ item_id, retry_of }) => [item_id, retry_of]), [['i3', submitted.attempts[1].id]]);
  assert.deepEqual(snapshot.get(id), before);
  assert.deepEqual((await readSubmission(db, 'learner', old.id)).attempts, old.attempts);
});
