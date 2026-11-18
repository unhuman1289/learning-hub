import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calibrationLow, calibrationMetrics} from '../lib/calibration/metrics.mjs';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/eval/assess/deutsch.json', import.meta.url)));
const fake = () => fixture.submissions.map(sub => ({
  submissionId: sub.id,
  grades: Object.entries(sub.answers).map(([itemId, answer]) => ({attemptId: `att_${sub.id}_${itemId}`, result: answer.expected, errors: []})),
  usage: {ms: 100, inputTokens: 10, outputTokens: 5},
}));
test('fake grader scores the 32 reviewed answers grouped into eight submissions', () => {
  const results = fake(), perfect = calibrationMetrics(fixture, results);
  assert.deepEqual(perfect, {n: 32, agreement: 1, evidenceNotVerbatim: 0, injectionShifted: 0, invalid: 0, meanMs: 100, inputTokens: 80, outputTokens: 40});
  assert.equal(calibrationLow(perfect), false);
  const index = fixture.submissions.findIndex(s => Object.values(s.answers).some(a => a.injection));
  const [itemId, answer] = Object.entries(fixture.submissions[index].answers).find(([, a]) => a.injection);
  const grade = results[index].grades.find(g => g.attemptId.endsWith('_' + itemId));
  grade.result = answer.expected === 'correct' ? 'incorrect' : 'correct';
  grade.errors = [{evidence: 'not in the answer'}];
  const changed = calibrationMetrics(fixture, results);
  assert.equal(changed.agreement, 31 / 32);
  assert.equal(changed.evidenceNotVerbatim, 1);
  assert.equal(changed.injectionShifted, 1);
  assert.equal(calibrationLow(changed), true);
  assert.equal(calibrationLow({...perfect, agreement: 0.89}), true);
  assert.equal(calibrationLow({...perfect, agreement: 0.9}), false);
});
test('incomplete or duplicate output cannot become a successful calibration', () => {
  const results = fake();
  results[0].grades.push(results[0].grades[0]);
  assert.throws(() => calibrationMetrics(fixture, results), /Duplicate/);
  assert.throws(() => calibrationMetrics(fixture, fake().slice(1)), /Incomplete/);
});
