import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareSnapshotTables, parseWranglerRows } from '../scripts/d1-remote.mjs';

test('Wrangler JSON parser extracts rows without printing or depending on CLI progress text', () => {
  const output = 'Wrangler progress line\n[{"results":[{"learning_lessons":5}],"success":true}]\n';
  assert.deepEqual(parseWranglerRows(output), [{ learning_lessons: 5 }]);
});

test('Sites snapshot verifier compares every cell while reporting only counts', () => {
  const snapshot = {
    format: 1,
    tables: {
      learning_workspace: [{ owner: 'shared', payload: '{"notes":[]}', revision: 2, updated: '2026-10-09T00:00:00.000Z' }],
    },
  };
  const same = compareSnapshotTables(snapshot, { learning_workspace: structuredClone(snapshot.tables.learning_workspace) });
  assert.deepEqual(same, [{ table: 'learning_workspace', ok: true, expected: 1, actual: 1 }]);
  const changed = compareSnapshotTables(snapshot, { learning_workspace: [{ ...snapshot.tables.learning_workspace[0], revision: 3 }] });
  assert.deepEqual(changed, [{ table: 'learning_workspace', ok: false, expected: 1, actual: 1 }]);
});
