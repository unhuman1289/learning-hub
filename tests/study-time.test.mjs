import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {
  addSecondsSql, readDaySql, readTargetSql, setTargetSql, toStudyDay,
  validReportSeconds, validTargetMinutes, isStudyTrack, DEFAULT_TARGET_MINUTES,
} from '../lib/study-sql.ts';

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../drizzle/0006_study_time.sql', import.meta.url), 'utf8').replaceAll('--> statement-breakpoint', ''));
  return db;
}

test('study seconds add up per account, Berlin day and notebook', () => {
  const db = database();
  const add = (user, day, track, seconds) => db.prepare(addSecondsSql).run(user, day, track, seconds, `${day}T10:00:00.000Z`);
  add('vu', '2026-10-09', 'AI', 30);
  add('vu', '2026-10-09', 'AI', 45);
  add('vu', '2026-10-09', 'Deutsch', 60);
  add('vu', '2026-10-08', 'AI', 120);
  add('ly', '2026-10-09', 'AI', 90);
  const day = toStudyDay('2026-10-09', db.prepare(readDaySql).all('vu', '2026-10-09'), db.prepare(readTargetSql).get('vu')?.target);
  assert.deepEqual(day, {day: '2026-10-09', targetMinutes: DEFAULT_TARGET_MINUTES, seconds: {AI: 75, Deutsch: 60}});
  assert.deepEqual(db.prepare(readDaySql).all('ly', '2026-10-09').map(row => ({...row})), [{track: 'AI', seconds: 90}]);
});

test('a day never holds more than 24 hours for one notebook', () => {
  const db = database();
  db.prepare('INSERT INTO study_time (user_id, day, track, seconds, updated) VALUES (?,?,?,?,?)').run('vu', '2026-10-09', 'AI', 86_390, 'x');
  db.prepare(addSecondsSql).run('vu', '2026-10-09', 'AI', 120, 'y');
  assert.equal(db.prepare(readDaySql).get('vu', '2026-10-09').seconds, 86_400);
});

test('daily target defaults to 60 minutes and is stored per account', () => {
  const db = database();
  assert.equal(toStudyDay('2026-10-09', [], db.prepare(readTargetSql).get('vu')?.target).targetMinutes, 60);
  db.prepare(setTargetSql).run('vu', 90, 'a');
  db.prepare(setTargetSql).run('vu', 45, 'b');
  assert.equal(db.prepare(readTargetSql).get('vu').target, 45);
  assert.equal(db.prepare(readTargetSql).get('ly'), undefined);
});

test('reports and targets are validated before they reach the database', () => {
  assert.equal(validReportSeconds(30), true);
  assert.equal(validReportSeconds(0), false);
  assert.equal(validReportSeconds(121), false);
  assert.equal(validReportSeconds(2.5), false);
  assert.equal(validTargetMinutes(60), true);
  assert.equal(validTargetMinutes(4), false);
  assert.equal(validTargetMinutes(721), false);
  assert.equal(isStudyTrack('Bột'), true);
  assert.equal(isStudyTrack('Chemistry'), false);
});
