import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPINE, SPINE_COLORS, chunkRows, coverShift, shelfCapacity, spineColor } from '../components/notebook/shelf-rows.ts';

test('a shelf holds as many spines as fit, and at least one', () => {
  assert.equal(shelfCapacity(276), 7);
  assert.equal(shelfCapacity(39 * 5 - 3), 5);
  assert.equal(shelfCapacity(39 * 5 - 4), 4);
  assert.equal(shelfCapacity(10), 1);
  assert.equal(shelfCapacity(0), 1);
  assert.equal(shelfCapacity(Number.NaN), 1);
});

test('the first shelf fills before the next one starts', () => {
  assert.deepEqual(chunkRows([1, 2, 3, 4, 5], 3), [[1, 2, 3], [4, 5]]);
  assert.deepEqual(chunkRows([1, 2, 3], 3), [[1, 2, 3]]);
  assert.deepEqual(chunkRows([], 3), []);
  assert.deepEqual(chunkRows([1, 2], 0), [[1], [2]]);
});

test('a pulled-out cover stays inside the shelf', () => {
  const row = 276;
  const shown = SPINE.cover * SPINE.zoom;
  for (let index = 0; index < 7; index++) {
    const centre = index * (SPINE.width + SPINE.gap) + SPINE.width / 2;
    const left = centre - shown / 2 + coverShift(index, row);
    assert.ok(left >= -4 - 1e-9 && left + shown <= row + 4 + 1e-9, `book ${index}`);
  }
  // A book in the middle is not moved.
  assert.equal(coverShift(3, row), 0);
  assert.ok(coverShift(0, row) > 0);
  assert.ok(coverShift(6, row) < 0);
});

test('a notebook keeps the same cloth colour', () => {
  assert.equal(spineColor('sub_abc'), spineColor('sub_abc'));
  assert.ok(SPINE_COLORS.includes(spineColor('sub_xyz')));
});
