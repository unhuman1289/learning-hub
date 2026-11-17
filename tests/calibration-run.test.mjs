import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runCalibration} from '../lib/calibration/run.mjs';
const fixture = JSON.parse(readFileSync(new URL('../fixtures/eval/assess/deutsch.json', import.meta.url)));

test('synthetic submissions pass through the real assess pipeline and supplied Luna prompt', async () => {
  let calls = 0;
  const engine = {name: 'openai', vision: false, async run({system, user}) {
    assert.equal(system, 'Luna prompt');
    const context = JSON.parse(user.split('\n')[2]);
    const submission = fixture.submissions[calls++];
    const grades = context.attempts.map(a => ({attemptId: a.attemptId, result: submission.answers[a.itemId].expected,
      score: 1, rubricScores: [], feedback: '', correction: '', errors: [], checkItem: null}));
    return {json: {contract: 'assess-result/1', summary: '', grades, diagnosis: [], masteryProposals: [],
      errorPatternUpdates: [], reviewProposals: [], recheckDecision: null}, usage: {model: 'fake-luna', inputTokens: 10, outputTokens: 5, ms: 20}};
  }};
  const metrics = await runCalibration(fixture, 'job_00000000000000000000', engine, 'Luna prompt');
  assert.equal(calls, 8);
  assert.equal(metrics.n, 32);
  assert.equal(metrics.agreement, 1);
  assert.equal(metrics.inputTokens, 80);
});
