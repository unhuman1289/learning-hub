import test from 'node:test';
import assert from 'node:assert/strict';
import { submitAfterPhoto } from '../app/hub/lesson/photo-submit.ts';
test('checking waits for the pending photo and submits once', async () => {
 let finish; const upload = new Promise(resolve => { finish = resolve; }); let count = 0;
 const pending = submitAfterPhoto(upload, () => count++);
 assert.equal(count, 0); finish(); assert.equal(await pending, true); assert.equal(count, 1);
});
test('a failed upload does not submit', async () => {
 let count = 0;
 assert.equal(await submitAfterPhoto(Promise.reject(new Error('offline')), () => count++), false);
 assert.equal(count, 0);
});
