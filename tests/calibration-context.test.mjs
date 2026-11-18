import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calibrationContext} from '../lib/calibration/context.mjs';
import {contextHash} from '../lib/ai-jobs/context/common.ts';
const fixture = JSON.parse(readFileSync(new URL('../fixtures/eval/assess/deutsch.json', import.meta.url)));
test('reviewed fixture becomes eight valid submission contexts without expected answers', async () => {
  assert.equal(fixture.submissions.length, 8);
  let count = 0;
  for (const sub of fixture.submissions) {
    const context = await calibrationContext(fixture, sub, 'job_00000000000000000000');
    const {contextHash: hash, ...withoutHash} = context;
    assert.equal(hash, await contextHash(withoutHash));
    assert.equal(context.attempts.length, Object.keys(sub.answers).length);
    for (const attempt of context.attempts) {
      assert.equal(attempt.answer, sub.answers[attempt.itemId].answer);
      assert.equal(Object.hasOwn(attempt, 'expected'), false);
      count++;
    }
  }
  assert.equal(count, 32);
});
