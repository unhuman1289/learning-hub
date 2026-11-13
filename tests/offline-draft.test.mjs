import assert from 'node:assert/strict';
import test from 'node:test';
import { readOfflineDraft, writeOfflineDraft } from '../app/hub/lesson-v2/offline-draft.ts';

test('offline lesson drafts remain isolated by key and expire automatically', context => {
  const data = new Map();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => data.get(key),
    removeItem: key => data.delete(key),
    setItem: (key, value) => data.set(key, value),
  } });
  context.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  });
  context.mock.method(Date, 'now', () => 1000);
  writeOfflineDraft('profile-a:lesson', 'draft');
  writeOfflineDraft('profile-a:lesson:submission', 'immutable submission');
  assert.equal(readOfflineDraft('profile-b:lesson'), undefined);
  assert.equal(readOfflineDraft('profile-a:lesson'), 'draft');
  assert.equal(readOfflineDraft('profile-a:lesson:submission'), 'immutable submission');
  writeOfflineDraft('profile-a:lesson', undefined);
  assert.equal(readOfflineDraft('profile-a:lesson'), undefined);
  Date.now.mock.mockImplementation(() => 1000 + 86400000);
  assert.equal(readOfflineDraft('profile-a:lesson:submission'), undefined);
  assert.equal(data.size, 0);
});
