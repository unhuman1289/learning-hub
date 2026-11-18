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
  const {details, ...summary} = perfect;
  assert.equal(details.length, 32);
  assert.deepEqual(summary, {n: 32, agreement: 1, evidenceNotVerbatim: 0, injectionShifted: 0, invalid: 0, meanMs: 100, inputTokens: 80, outputTokens: 40});
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

test('per-item details retain matches, mismatches, criterion differences and invalid submissions',()=>{
 const results=fake();
 const first=fixture.submissions[0], [itemId,answer]=Object.entries(first.answers)[0];
 const rubric=fixture.items[itemId].rubric;
 const grade=results[0].grades[0];
 grade.rubricScores=rubric.map((r,i)=>({criterion:r.criterion,points:i?0:r.points,max:r.points}));
 const enriched=structuredClone(fixture);enriched.submissions[0].answers[itemId].expectedRubricScores=rubric.map(r=>r.points);
 let metrics=calibrationMetrics(enriched,results),detail=metrics.details.find(d=>d.fixtureId===first.id && d.itemId===itemId);
 assert.equal(detail.expectedResult,answer.expected);assert.equal(detail.modelResult,answer.expected);assert.equal(detail.fixtureAnswer,answer.answer);
 assert.equal(detail.rubricScores[0].expectedPoints,rubric[0].points);assert.equal(detail.rubricScores[0].modelPoints,rubric[0].points);
 assert.equal(detail.rubricScores[1].expectedPoints,rubric[1].points);assert.equal(detail.rubricScores[1].modelPoints,0);
 grade.result=answer.expected==='correct'?'incorrect':'correct';
 metrics=calibrationMetrics(enriched,results);detail=metrics.details.find(d=>d.fixtureId===first.id && d.itemId===itemId);
 assert.notEqual(detail.expectedResult,detail.modelResult);
 results[1]={...results[1],grades:[],invalid:true,errorCode:'contract_error:invalid_type:/grades'};
 metrics=calibrationMetrics(enriched,results);const invalid=metrics.details.filter(d=>d.fixtureId===fixture.submissions[1].id);
 assert.equal(invalid.length,Object.keys(fixture.submissions[1].answers).length);assert.ok(invalid.every(d=>d.modelResult===null && d.errorCode==='contract_error:invalid_type:/grades'));
 assert.ok(metrics.details.find(d=>d.fixtureId===first.id && d.itemId!==itemId).rubricScores.every(r=>r.expectedPoints===null));
});
