import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gradeDictation } from '../lib/evidence/dictation.ts';
import { autoGrade } from '../lib/evidence/autograde.ts';
import { insertLessonV2, itemView, readLessonV2 } from '../lib/lesson-v2/store.ts';
import { validateLessonPackage } from '../lib/lesson-v2/validate.ts';
import { itemPolicy } from '../lib/subjects/item-kinds.ts';
import { DEFAULT_LIMITS } from '../lib/subjects/sql.ts';
import { parseSubmission, submitLesson } from '../lib/evidence/submit.ts';
import { memoryDb } from './d1-adapter.mjs';

const german = { type: 'dictation', text: 'Wir gehen nach Hause.', ignore: ['case', 'punctuation'] };
const chinese = { type: 'dictation', text: '你好', pinyin: 'ni3 hao3', ignore: ['case', 'punctuation'] };

test('German dictation uses word edit distance and reports aligned errors', () => {
  assert.deepEqual(gradeDictation(german, '  wir GEHEN   nach hause!  '), {
    result: 'correct', score: 1, wer: 0, missing: [], extra: [], wrong: [],
  });
  const missing = gradeDictation(german, 'Wir gehen Hause.');
  assert.deepEqual(missing, { result: 'partial', score: 0.75, wer: 0.25, missing: ['nach'], extra: [], wrong: [] });
  const extra = gradeDictation(german, 'Wir gehen heute nach Hause.');
  assert.deepEqual(extra, { result: 'partial', score: 0.75, wer: 0.25, missing: [], extra: ['heute'], wrong: [] });
  const wrong = gradeDictation(german, 'Wir fahren zur Hause.');
  assert.equal(wrong.result, 'incorrect');
  assert.deepEqual(wrong.wrong, [{ expected: 'gehen', actual: 'fahren' }, { expected: 'nach', actual: 'zur' }]);
  assert.equal(gradeDictation({ ...german, ignore: [] }, 'Wir gehen nach Hause').wer, 0.25);
  assert.equal(gradeDictation({ ...german, ignore: [] }, 'wir gehen nach Hause.').wer, 0.25);
});

test('German ß and ss are distinct unless the key explicitly lists them as variants', () => {
  const key = { ...german, text: 'daß' };
  assert.equal(gradeDictation(key, 'dass').result, 'incorrect');
  assert.equal(gradeDictation({ ...key, variants: [['dass', 'daß']] }, 'DASS').result, 'correct');
  assert.equal(gradeDictation({ ...key, text: 'Straße', variants: [['dass', 'daß']] }, 'Strasse').result, 'incorrect');
});

test('Chinese dictation compares Han characters or normalized pinyin syllables', () => {
  for (const answer of ['你好！', '你 好', 'nǐ hǎo', 'nǐ，hǎo', 'NI3 HAO3', 'ni3hao3'])
    assert.equal(gradeDictation(chinese, answer).result, 'correct', answer);
  assert.deepEqual(gradeDictation(chinese, '你号').wrong, [{ expected: '好', actual: '号' }]);
  assert.deepEqual(gradeDictation(chinese, 'ni3 hao4').wrong, [{ expected: 'hao3', actual: 'hao4' }]);
  const daughter = { ...chinese, text: '女儿', pinyin: 'nü3 er2' };
  for (const answer of ['nǚ’ér', 'nu:3 er2', 'nv3 er2'])
    assert.equal(gradeDictation(daughter, answer).result, 'correct', answer);
});

const original = JSON.parse(readFileSync(new URL('../fixtures/contracts/lesson-v2/deutsch-modalverb.json', import.meta.url)));
const audio = { lang: 'de-DE', rate: 0.8, maxPlays: 3, transcript: 'after_answer',
  lines: [{ speaker: 'a', text: 'Wir gehen nach Hause.' }] };
const item = {
  ...original.items[0], id: 'i1', input: 'short', difficulty: 1, attachment: 'none',
  choices: undefined, rubric: undefined, prompt: 'Chép lại câu em nghe.', key: german, audio,
};

function lesson(items) {
  const numbered = items.map((question, index) => ({ ...question, id: 'i' + (index + 1) }));
  return { ...original, contract: 'lesson-package/3', knowledge: [], items: numbered,
    stages: [{ stage: 'independent', itemIds: numbered.map(question => question.id) }] };
}

test('lesson views expose only allowlisted audio metadata, even after grading or revealing support', () => {
  const stored = { ...item, audio: { ...audio, hash: 'hub-hash', durationMs: 2400, storageKey: 'private' } };
  const { lines, ...metadata } = audio;
  for (const [support, graded] of [[undefined, false], ['solution', false], [undefined, true]]) {
    const view = itemView(stored, 'independent', support, graded);
    assert.deepEqual(view.audio, { ...metadata, hash: 'hub-hash', durationMs: 2400 });
    assert.ok(!JSON.stringify(view.audio).includes(lines[0].text));
    assert.ok(!('key' in view));
  }
});

test('listening validates bands, answer types and dialogue privacy', () => {
  const check = (...items) => validateLessonPackage(lesson(items), { adaptive: true }).issues;
  const turn = count => ({ speaker: 'a', text: Array(count).fill('Wort').join(' ') });
  const withAudio = (difficulty, rate, lines) => ({ ...item, difficulty, audio: { ...audio, rate, lines } });
  assert.deepEqual(check(withAudio(1, 0.8, [turn(8), turn(8), turn(8), turn(6)])), []);
  assert.ok(check(withAudio(1, 0.8, [turn(9)])).some(issue => issue.path === '/items/0/audio/lines/0/text'));
  assert.ok(check(withAudio(1, 0.8, [turn(8), turn(8), turn(8), turn(7)]))
    .some(issue => issue.path === '/items/0/audio/lines'));
  for (const band of [2, 3]) {
    assert.deepEqual(check(withAudio(band, 0.9, [turn(15)])), []);
    assert.ok(check(withAudio(band, 0.9, [turn(16)])).some(issue => issue.code === 'size_limit'));
  }
  assert.deepEqual(check(withAudio(4, 1, [turn(16)])), []);
  assert.ok(check(withAudio(4, 0.9, [turn(8)])).some(issue => issue.path === '/items/0/audio/rate'));
  const privacy = withAudio(1, 0.8, [{ speaker: 'a', text: 'Schreib an test@example.com.' }]);
  assert.ok(check(privacy).some(issue => issue.code === 'privacy'));
  assert.ok(check(item, item, item).some(issue => issue.code === 'size_limit'));
  const open = { ...item, input: 'long', key: undefined,
    rubric: [{ criterion: 'Đúng ý', points: 1 }, { criterion: 'Rõ ràng', points: 1 }] };
  assert.ok(check(open, { ...item, audio: undefined }).some(issue => issue.path === '/items'));
  assert.deepEqual(check(open, item), []);
  assert.ok(itemPolicy('de-cefr').kinds.includes('order'));
  assert.ok(itemPolicy('zh-hsk').kinds.includes('order'));
});

test('D1 submission saves dictation feedback and partial credit', async () => {
  const db = memoryDb();
  const learnerId = 'listening-demo';
  const subjectId = 'sub_88888888888888888888';
  const now = new Date('2026-11-14T12:00:00Z');
  const stamp = now.toISOString();
  try {
    db.sqlite.prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at,role,status) VALUES(?,?,?,1,1,1,'learner','active')")
      .run(learnerId, 'Học thử', 'listening@example.test');
    db.sqlite.prepare("INSERT INTO subjects(id,learner_id,title,template,status,limits,created_by,created_at,updated_at) VALUES(?,?,?,'skill','active',?,?,?,?)")
      .run(subjectId, learnerId, 'Deutsch thử', JSON.stringify(DEFAULT_LIMITS), learnerId, stamp, stamp);
    const parsed = validateLessonPackage(lesson([item]), { adaptive: true });
    assert.deepEqual(parsed.issues, []);
    const id = await insertLessonV2(db, { learnerId, subjectId, day: '2026-11-14', lesson: parsed.lesson, now });
    const before = await readLessonV2(db, learnerId, id);
    assert.ok(!('lines' in before.items[0].audio));
    assert.ok(!('solution' in before.items[0].revealed));
    const submitted = await submitLesson(db, learnerId, id, parseSubmission({
      clientSubmissionId: crypto.randomUUID(), draftRevision: 0,
      answers: { i1: { answer: 'Wir gehen Hause.' } },
    }), now);
    assert.equal(submitted.status, 'graded');
    assert.equal(submitted.attempts[0].result, 'partial');
    assert.equal(submitted.attempts[0].score, 0.75);
    assert.match(submitted.attempts[0].feedback, /Thiếu: nach/);
    assert.equal(autoGrade({ ...german, text: 'Wort' }, 'viele andere ganz falsche Wörter').score, 0);
  } finally {
    db.sqlite.close();
  }
});
