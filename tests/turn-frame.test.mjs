import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { hubLongFrame } from './e2e/turn-frame.mjs';

test('only long frames with an overlapping Hub script during the turn block', () => {
  const script = { sourceURL: 'https://hub.test/_next/static/chunks/lesson.js', startTime: 110, duration: 20 };
  const frame = { startTime: 100, duration: 51, scripts: [script] };
  const matches = value => hubLongFrame(value, 105, 145, 'https://hub.test');
  assert.equal(matches(frame), true);
  assert.equal(matches({ ...frame, duration: 50 }), false);
  assert.equal(matches({ ...frame, startTime: 150 }), false);
  assert.equal(matches({ ...frame, scripts: [{ ...script, sourceURL: 'https://other.test/_next/static/a.js' }] }), false);
  assert.equal(matches({ ...frame, scripts: [{ ...script, sourceURL: 'https://hub.test/api/lesson' }] }), false);
  assert.equal(matches({ ...frame, scripts: [{ ...script, startTime: 150 }] }), false);
  assert.equal(matches({ ...frame, scripts: [] }), false);
});
