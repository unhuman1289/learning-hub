import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canImportWithEmptyWorkspacePlaceholder, compareSnapshotTables, parseWranglerRows } from '../scripts/d1-remote.mjs';

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

test('import accepts only the exact empty shared-workspace placeholder created on first login', () => {
  const snapshot = { format: 1, tables: { learning_workspace: [{ owner: 'old-owner', payload: 'null', revision: 0, updated: 'old' }] } };
  const counts = { learning_workspace: 1 };
  const placeholder = { total: 1, emptyShared: 1, updated: 'new' };
  assert.equal(canImportWithEmptyWorkspacePlaceholder(snapshot, counts, placeholder), true);
  assert.equal(canImportWithEmptyWorkspacePlaceholder({
    format: 1, tables: { learning_workspace: [{ ...snapshot.tables.learning_workspace[0], payload: '{"notes":["data"]}' }] },
  }, counts, placeholder), false);
  assert.equal(canImportWithEmptyWorkspacePlaceholder(snapshot, { ...counts, learning_lessons: 1 }, placeholder), false);
  assert.equal(canImportWithEmptyWorkspacePlaceholder(snapshot, { ...counts, learning_workspace: 2 }, placeholder), false);
});

test('legacy snapshot verification includes the selected admin owner for migrated lesson and slot rows', () => {
  const snapshot = {
    format: 1,
    tables: {
      learning_lessons: [{ id: 'lesson-1', track: 'Deutsch', payload: '{"title":"A2"}', assigned_date: '2026-10-08', completed_at: null, response: 'saved', updated: '2026-10-08T00:00:00.000Z' }],
      learning_slots: [{ track: 'Deutsch', lesson_id: 'lesson-1', revision: 2 }],
    },
  };
  const actual = {
    learning_lessons: [{ ...snapshot.tables.learning_lessons[0], user_id: 'admin-id' }],
    learning_slots: [{ ...snapshot.tables.learning_slots[0], user_id: 'admin-id' }],
  };
  assert.deepEqual(compareSnapshotTables(snapshot, actual, { legacyOwnerId: 'admin-id' }), [
    { table: 'learning_lessons', ok: true, expected: 1, actual: 1 },
    { table: 'learning_slots', ok: true, expected: 1, actual: 1 },
  ]);
  assert.deepEqual(compareSnapshotTables(snapshot, actual, { legacyOwnerId: 'wrong-owner' }).map((table) => table.ok), [false, false]);
});

test('format-2 run_items are compared against the renamed legacy_run_items table', () => {
  const snapshot = {
    format: 2,
    tables: {
      runs: [{ id: 'run-1', day: '2026-10-08', status: 'finished', started_at: 'a', finished_at: 'b', summary: '', error: null, origin: 'manual', request_hash: null }],
      run_items: [{ run_id: 'run-1', user_id: 'admin', track: 'Deutsch', outcome: 'kept', reason: 'not finished', previous_lesson_id: 'lesson-1', lesson_id: null, sources: '[]' }],
    },
  };
  const actual = {
    runs: structuredClone(snapshot.tables.runs),
    legacy_run_items: structuredClone(snapshot.tables.run_items),
  };
  assert.deepEqual(compareSnapshotTables(snapshot, actual), [
    { table: 'runs', ok: true, expected: 1, actual: 1 },
    { table: 'run_items', ok: true, expected: 1, actual: 1 },
  ]);
});
