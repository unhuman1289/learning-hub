import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isBerlinCalibrationTime} from '../lib/calibration-schedule.mjs';

test('weekly calibration selects Sunday 03:30 Berlin through both DST transitions', () => {
  for (const stamp of ['2026-01-18T02:30:00Z', '2026-07-19T01:30:00Z', '2026-03-29T01:30:00Z', '2026-10-25T02:30:00Z']) {
    const at = Date.parse(stamp);
    assert.equal(isBerlinCalibrationTime(at), true, stamp);
    for (const delta of [-3600000, -60000, 60000, 3600000]) assert.equal(isBerlinCalibrationTime(at + delta), false);
  }
  assert.equal(isBerlinCalibrationTime('2026-01-19T02:30:00Z'), false);
  assert.equal(isBerlinCalibrationTime('invalid'), false);
});
