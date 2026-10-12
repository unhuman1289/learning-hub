import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validateLessonPackage } from '../lib/lesson-v2/validate.ts';
import { parseNumericAnswer } from '../lib/lesson-v2/numeric.ts';

const dir = new URL('../fixtures/contracts/lesson-v2/', import.meta.url);
const fixtures = Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => [f.replace('.json', ''), JSON.parse(readFileSync(new URL(f, dir), 'utf8'))]));
const clone = (name) => structuredClone(fixtures[name]);
const codes = (input, options) => validateLessonPackage(input, options).issues.map((issue) => issue.code);

test('every fixture is a valid lesson-package/2', () => {
  assert.ok(Object.keys(fixtures).length >= 4);
  for (const [name, lesson] of Object.entries(fixtures)) {
    const result = validateLessonPackage(lesson, { sensitivity: name.startsWith('mtb') ? 'clinical' : 'normal', maxDifficulty: 3 });
    assert.deepEqual(result.issues, [], name);
  }
});

const invalid = {
  'wrong contract': ['deutsch-modalverb', (l) => { l.contract = 'lesson-package/1'; }, 'schema'],
  'unknown field': ['deutsch-modalverb', (l) => { l.goal = 'AI may not set goals'; }, 'schema'],
  'item without key or rubric': ['deutsch-modalverb', (l) => { delete l.items[2].rubric; }, 'schema'],
  'choice key not among choices': ['deutsch-modalverb', (l) => { l.items[0].key.correct = ['c']; }, 'schema'],
  'choice input with text key': ['deutsch-modalverb', (l) => { l.items[0].key = { type: 'text', accepted: ['b'], caseSensitive: false }; }, 'schema'],
  'choices on a short item': ['deutsch-modalverb', (l) => { l.items[1].choices = [{ id: 'a', text: 'x' }, { id: 'b', text: 'y' }]; }, 'schema'],
  'several long text answers': ['deutsch-modalverb', (l) => { l.items[1].key.accepted = ['Lena kann heute Suppe kochen.', 'Heute kann Lena Suppe kochen.']; }, 'schema'],
  'numeric key not a number': ['toan7-ti-le-thuc', (l) => { l.items[0].key.value = 'sáu'; }, 'schema'],
  'difficulty above the notebook limit': ['toan7-ti-le-thuc', (l) => { l.items[2].difficulty = 5; }, 'difficulty_limit'],
  'stage refers to a missing item': ['deutsch-modalverb', (l) => { l.stages[0].itemIds.push('i9'); }, 'unknown_reference'],
  'item placed in two stages': ['deutsch-modalverb', (l) => { l.stages[2].itemIds.push('i1'); }, 'schema'],
  'item in no stage': ['deutsch-modalverb', (l) => { l.stages[3].itemIds = []; }, 'schema'],
  'items in the sheet stage': ['deutsch-modalverb', (l) => { l.stages[1].itemIds = ['i5']; l.stages[3].itemIds = []; }, 'schema'],
  'reading stage in a skill lesson': ['deutsch-modalverb', (l) => { l.stages[1].stage = 'read'; }, 'schema'],
  'check stage from the planner': ['deutsch-modalverb', (l) => { l.stages[3].stage = 'check'; }, 'schema'],
  'new skill lesson without sheet': ['deutsch-modalverb', (l) => { l.sheet = null; }, 'schema'],
  'too few items': ['deutsch-modalverb', (l) => { l.items = l.items.slice(0, 2); l.stages = [{ stage: 'retrieval', itemIds: ['i1', 'i2'] }]; }, 'schema'],
  'review set too long': ['review-deutsch', (l) => { l.estMinutes = 30; }, 'schema'],
  'review set with guided stage': ['review-deutsch', (l) => { l.stages[1].stage = 'guided'; }, 'schema'],
  'reading lesson without sources': ['mtb-vaf-reading', (l) => { l.sources = []; }, 'schema'],
  'reading lesson without output': ['mtb-vaf-reading', (l) => { l.output = null; }, 'schema'],
  'source over http': ['mtb-vaf-reading', (l) => { l.sources[0].url = 'http://example.org/x'; }, 'schema'],
  'identifier in a clinical lesson': ['mtb-vaf-reading', (l) => { l.sections[0].text += ' Max Mustermann, geb. 12.03.1961.'; }, 'privacy'],
  'phone number in a prompt': ['deutsch-modalverb', (l) => { l.items[4].prompt += ' Gọi +49 451 1234567.'; }, 'privacy'],
};

for (const [name, [fixture, mutate, code]] of Object.entries(invalid)) {
  test(`rejects: ${name}`, () => {
    const lesson = clone(fixture);
    mutate(lesson);
    assert.ok(codes(lesson, { maxDifficulty: 3, sensitivity: fixture.startsWith('mtb') ? 'clinical' : 'normal' }).includes(code), name);
  });
}

test('titled names pass in normal notebooks but not in clinical ones', () => {
  const lesson = clone('mtb-vaf-reading');
  lesson.sections[0].text += ' Frau Schneider fragt nach dem Befund.';
  assert.deepEqual(codes(lesson, { sensitivity: 'normal' }), []);
  assert.deepEqual(codes(lesson, { sensitivity: 'clinical' }), ['privacy']);
});

test('oversized packages are rejected before parsing', () => {
  const lesson = clone('deutsch-modalverb');
  lesson.items[4].solution = 'x'.repeat(100 * 1024);
  assert.deepEqual(codes(lesson), ['size_limit']);
});

test('numeric answers: comma decimals, fractions, units', () => {
  const cases = [['0,75', 0.75, ''], ['0.75', 0.75, ''], ['3/4', 0.75, ''], ['7,50 €', 7.5, '€'], ['-2', -2, ''], ['2,5 giờ', 2.5, 'giờ'], ['12 / 4', 3, '']];
  for (const [raw, value, unit] of cases) assert.deepEqual(parseNumericAnswer(raw), { value, unit }, raw);
  for (const raw of ['', 'sáu', '1/0', '1 1/2', '1.000,5', '1.000', '3/']) assert.equal(parseNumericAnswer(raw), null, raw);
});
