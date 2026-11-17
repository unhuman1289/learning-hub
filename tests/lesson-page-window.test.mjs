import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lessonPageWindow } from '../app/hub/lesson/page-window.ts';

test('window follows question groups and excludes intro and summary', () => {
  const groups = [[1, 2], [3], [4, 5], [6]];
  assert.deepEqual(lessonPageWindow(groups, 2), [[1, 2], [3]]);
  assert.deepEqual(lessonPageWindow(groups, 3), [[1, 2], [3], [4, 5]]);
  assert.deepEqual(lessonPageWindow(groups, 6), [[4, 5], [6]]);
  assert.deepEqual(lessonPageWindow(groups, 0), []);
  assert.deepEqual(lessonPageWindow(groups, 7), []);
});
