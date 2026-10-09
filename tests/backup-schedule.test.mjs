import { test } from 'node:test';
import assert from 'node:assert/strict';
import { berlinBackupDay, isBerlinBackupTime } from '../lib/backup-schedule.mjs';

test('daily backup chooses exactly 03:00 Berlin across winter, summer and DST changes', () => {
  assert.equal(isBerlinBackupTime('2026-01-15T02:00:00.000Z'), true);
  assert.equal(isBerlinBackupTime('2026-01-15T01:00:00.000Z'), false);
  assert.equal(isBerlinBackupTime('2026-06-15T01:00:00.000Z'), true);
  assert.equal(isBerlinBackupTime('2026-06-15T02:00:00.000Z'), false);
  assert.equal(isBerlinBackupTime('2026-03-29T01:00:00.000Z'), true);
  assert.equal(isBerlinBackupTime('2026-10-25T02:00:00.000Z'), true);
  assert.equal(berlinBackupDay('2026-10-25T02:00:00.000Z'), '2026-10-25');
  assert.equal(isBerlinBackupTime('invalid'), false);
});
