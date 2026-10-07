// Temporary acceptance probe for plan 0.2. Removed after GitHub reports failure.
import {test} from 'node:test';
import assert from 'node:assert/strict';
test('CI acceptance: a wrong test must make the pull request red',()=>{
  assert.equal(1,2,'Intentional CI acceptance failure; never merge this probe');
});
