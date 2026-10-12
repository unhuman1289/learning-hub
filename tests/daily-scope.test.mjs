import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from './d1-adapter.mjs';
import { readDailyFor } from '../lib/daily-view.ts';

function insertLesson(db, { id, userId, track = 'Deutsch', date = '2026-10-08', response = '' }) {
  db.sqlite.prepare('INSERT INTO learning_lessons (id,user_id,track,payload,assigned_date,response,updated) VALUES(?,?,?,?,?,?,?)')
    .run(id, userId, track, JSON.stringify({ title: id }), date, response, `${date}T00:00:00.000Z`);
}

test('daily reads return only the signed-in learner lessons, answers and history', async () => {
  const db = memoryDb();
  insertLesson(db, { id: 'a-active', userId: 'learner-a', response: 'private answer A' });
  insertLesson(db, { id: 'a-history', userId: 'learner-a', date: '2026-10-07', response: 'old answer A' });
  insertLesson(db, { id: 'b-active', userId: 'learner-b', response: 'private answer B' });
  db.sqlite.prepare('INSERT INTO learning_slots (user_id,track,lesson_id) VALUES(?,?,?)').run('learner-a', 'Deutsch', 'a-active');
  db.sqlite.prepare('INSERT INTO learning_slots (user_id,track,lesson_id) VALUES(?,?,?)').run('learner-b', 'Deutsch', 'b-active');

  const a = await readDailyFor(db, 'learner-a');
  const b = await readDailyFor(db, 'learner-b');
  assert.deepEqual(a.active.map((lesson) => lesson.id), ['a-active']);
  assert.deepEqual(a.history.map((lesson) => [lesson.id, lesson.response]), [['a-history', 'old answer A']]);
  assert.deepEqual(b.active.map((lesson) => [lesson.id, lesson.response]), [['b-active', 'private answer B']]);
  assert.deepEqual(b.history, []);
  assert.deepEqual(b.runs, []);
  assert.equal(b.lastRun, null);
  assert.equal(b.backup.lastCreatedAt, null);

  const attemptedCrossUserWrite = db.sqlite.prepare('UPDATE learning_lessons SET response=? WHERE user_id=? AND id=?').run('tampered', 'learner-a', 'b-active');
  assert.equal(attemptedCrossUserWrite.changes, 0);
  db.sqlite.close();
});
