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
import { recordListeningPlay, recordSupport, reveal, revealListening } from '../lib/lesson-v2/actions.ts';
import { setListeningVoice, updateSettings } from '../lib/learners/settings.ts';
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

test('joined pinyin uses the longest valid syllables and preserves tones', () => {
  const cases = [
    ['你好', 'ni3 hao3', ['nǐhǎo', 'ni3hao3', 'nǐhǎo'.normalize('NFD')]],
    ['谢谢', 'xie4 xie5', ['xièxie', 'xie4xie5', 'xie4xie0']],
    ['中国', 'zhong1 guo2', ['Zhōngguó', 'zhong1guo2']],
    ['女儿', 'nü3 er2', ['nǚér', 'nu:3er2']],
    ['先', 'xian1', ['xiān']],
  ];
  for (const [text, pinyin, answers] of cases) {
    for (const answer of answers)
      assert.equal(gradeDictation({ ...chinese, text, pinyin }, answer).result, 'correct', answer);
  }
  assert.deepEqual(gradeDictation(chinese, 'nǐhào').wrong, [{ expected: 'hao3', actual: 'hao4' }]);
  assert.equal(gradeDictation({ ...chinese, text: '中国', pinyin: 'zhong1 guo2', ignore: [] }, 'Zhōngguó').result, 'incorrect');
  assert.equal(gradeDictation({ ...chinese, text: '西安', pinyin: 'xi1 an1' }, 'xī’ān').result, 'correct');
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
  const stored = { ...item, audio: { ...audio, hashF: 'female-hash', hashM: 'male-hash', durationMs: 2400, storageKey: 'private' } };
  const { lines, ...metadata } = audio;
  for (const [support, graded] of [[undefined, false], ['solution', false], [undefined, true]]) {
    const view = itemView(stored, 'independent', support, graded);
    assert.deepEqual(view.audio, { ...metadata, src: { f: '/api/audio/female-hash', m: '/api/audio/male-hash' }, durationMs: 2400 });
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

async function listeningLesson(t, items = [item]) {
  const db = memoryDb();
  const learnerId = 'listening-demo';
  const subjectId = 'sub_88888888888888888888';
  const now = new Date('2026-11-14T12:00:00Z');
  const stamp = now.toISOString();
  t.after(() => db.sqlite.close());
  db.sqlite.prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at,role,status) VALUES(?,?,?,1,1,1,'learner','active')")
    .run(learnerId, 'Học thử', 'listening@example.test');
  db.sqlite.prepare("INSERT INTO subjects(id,learner_id,title,template,status,limits,created_by,created_at,updated_at) VALUES(?,?,?,'skill','active',?,?,?,?)")
    .run(subjectId, learnerId, 'Deutsch thử', JSON.stringify(DEFAULT_LIMITS), learnerId, stamp, stamp);
  const parsed = validateLessonPackage(lesson([item]), { adaptive: true });
  assert.deepEqual(parsed.issues, []);
  const id = await insertLessonV2(db, { learnerId, subjectId, day: '2026-11-14', lesson: lesson(items), now });
  return { db, id, learnerId, subjectId, now };
}

test('D1 submission saves dictation feedback and partial credit', async t => {
  const { db, id, learnerId, now } = await listeningLesson(t);
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
});

const attempt = (db, itemId) => ({ ...db.sqlite.prepare('SELECT support,stimulus FROM attempts WHERE item_id=?').get(itemId) });
const submit = (db, learnerId, id, now, itemId, draftRevision) => submitLesson(db, learnerId, id, parseSubmission({
  clientSubmissionId: crypto.randomUUID(), draftRevision, itemIds: [itemId],
  answers: { [itemId]: { answer: german.text } },
}), now);

test('slow, excess plays and transcript use monotonic support without authored hints', async t => {
  const listen = { ...item, hints: [], audio: { ...audio, maxPlays: 1 } };
  const { db, id, learnerId, now } = await listeningLesson(t, [listen, listen, listen, listen, listen]);
  const play = (itemId, slow) => recordListeningPlay(db, learnerId, id, itemId, slow);
  const open = (itemId, level) => revealListening(db, learnerId, id, itemId, level);
  await assert.rejects(reveal(db, learnerId, id, 'i1', 'hint1'), { status: 400 });
  assert.deepEqual(await open('i1', 'slow'), { support: 'hint1' });
  const concurrent = await Promise.all([play('i2'), play('i2')]);
  assert.deepEqual(concurrent.map(result => result.plays).sort(), [1, 2]);
  assert.equal(concurrent.find(result => result.plays === 2).support, 'hint1');
  assert.deepEqual(await open('i2', 'transcript'), { transcript: german.text, support: 'hint2' });
  assert.equal((await play('i2', true)).support, 'hint2');
  assert.equal((await play('i3')).support, undefined);
  assert.equal((await play('i4', true)).support, 'hint1');
  await Promise.all([
    recordSupport(db, learnerId, id, 'i5', 'hint1'),
    recordSupport(db, learnerId, id, 'i5', 'solution'),
  ]);
  assert.equal(await recordSupport(db, learnerId, id, 'i5', 'hint2'), 'solution');

  assert.deepEqual((await readLessonV2(db, learnerId, id)).listen_log, { i2: 3, i3: 1, i4: 1 });
  await submit(db, learnerId, id, now, 'i2', 0);
  await submit(db, learnerId, id, now, 'i3', 1);
  assert.equal((await open('i3', 'transcript')).transcript, german.text);
  assert.equal((await readLessonV2(db, learnerId, id)).items[2].revealed.hints.length, 0);
  const support = JSON.parse(db.sqlite.prepare('SELECT support FROM learning_lessons WHERE id=?').get(id).support);
  assert.equal(support.i3, undefined);
  assert.deepEqual(attempt(db, 'i2'), { support: 'hint2', stimulus: 'audio' });
  assert.deepEqual(attempt(db, 'i3'), { support: 'none', stimulus: 'audio' });

  await updateSettings(db, learnerId, { preferences: { replaceAudioWithText: true } }, now);
  await submit(db, learnerId, id, now, 'i4', 2);
  assert.deepEqual(attempt(db, 'i4'), { support: 'hint1', stimulus: 'text' });
  await updateSettings(db, learnerId, { preferences: { replaceAudioWithText: false } }, now);
  await submit(db, learnerId, id, now, 'i1', 3);
  assert.deepEqual(attempt(db, 'i1'), { support: 'hint1', stimulus: 'text' });
});

test('voice saves only its preference alongside child role and accessibility choice', async t => {
  const { db, learnerId, now } = await listeningLesson(t);
  await updateSettings(db, learnerId, { dailyTargetMinutes: 30, preferences: { replaceAudioWithText: true } }, now);
  db.sqlite.prepare("UPDATE learner_settings SET role='child' WHERE user_id=?").run(learnerId);
  await setListeningVoice(db, learnerId, 'm', now);
  const row = db.sqlite.prepare('SELECT role,daily_target_minutes,preferences FROM learner_settings WHERE user_id=?').get(learnerId);
  assert.equal(row.role, 'child');
  assert.equal(row.daily_target_minutes, 30);
  assert.deepEqual(JSON.parse(row.preferences), { replaceAudioWithText: true, listeningVoice: 'm' });
});

test('recomputation saves secure listening from real graded submissions on separate Berlin days', async t => {
  const { db, id, learnerId, subjectId } = await listeningLesson(t, [{ ...item, skills: ['listening-skill'] }, { ...item, skills: ['listening-skill'] }]);
  db.sqlite.prepare(`INSERT INTO skills(id,subject_id,learner_id,key,name,origin,created_at,updated_at)
     VALUES('listening-skill',?,?,'listen','Nghe','user','t','t')`).run(subjectId, learnerId);
  const state = () => JSON.parse(db.sqlite.prepare("SELECT listening FROM skill_states WHERE skill_id='listening-skill'").get().listening);
  await recordListeningPlay(db, learnerId, id, 'i1');
  await submit(db, learnerId, id, new Date('2026-10-24T21:59:59Z'), 'i1', 0);
  assert.deepEqual(state(), { level: 'emerging', days: ['2026-10-24'] });
  await recordListeningPlay(db, learnerId, id, 'i2');
  await submit(db, learnerId, id, new Date('2026-10-24T22:00:00Z'), 'i2', 1);
  assert.deepEqual(state(), { level: 'secure', days: ['2026-10-24', '2026-10-25'] });
});
