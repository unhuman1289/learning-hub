import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

const sql = (name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8');
const baseMigrations = readdirSync(new URL('../drizzle/', import.meta.url))
  .filter((file) => file.endsWith('.sql') && /^000[0-3]_/.test(file))
  .sort();

function applyBase(db) {
  for (const migration of baseMigrations) db.exec(sql(migration));
}

function seedAdmin(db) {
  db.prepare('INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at,role,status) VALUES(?,?,?,?,?,?,?,?)')
    .run('admin-vu', 'Admin', 'admin@example.invalid', 1, 1, 1, 'admin', 'active');
}

test('0004 backfills the active family lessons to admin without changing IDs, answers or slots', () => {
  const db = new DatabaseSync(':memory:');
  applyBase(db);
  seedAdmin(db);
  db.prepare('INSERT INTO learning_lessons(id,track,payload,assigned_date,completed_at,response,updated) VALUES(?,?,?,?,?,?,?)')
    .run('lesson-de', 'Deutsch', '{"title":"A2"}', '2026-10-08', '2026-10-08T00:30:00Z', 'Antwort ä\nmit Zitat \'', '2026-10-08T00:30:00Z');
  db.prepare('INSERT INTO learning_lessons(id,track,payload,assigned_date,completed_at,response,updated) VALUES(?,?,?,?,?,?,?)')
    .run('lesson-cardio', 'Cardio', '{"title":"Valve"}', '2026-10-07', null, 'draft', '2026-10-08T00:00:00Z');
  db.prepare('INSERT INTO learning_slots(track,lesson_id,revision) VALUES(?,?,?)').run('Deutsch', 'lesson-de', 3);
  db.prepare('INSERT INTO learning_slots(track,lesson_id,revision) VALUES(?,?,?)').run('Cardio', 'lesson-cardio', 1);

  db.exec(sql('0004_learner_scope.sql'));
  const lesson = db.prepare('SELECT id,user_id,track,payload,assigned_date,completed_at,response,updated FROM learning_lessons WHERE id=?').get('lesson-de');
  assert.deepEqual({ ...lesson }, {
    id: 'lesson-de', user_id: 'admin-vu', track: 'Deutsch', payload: '{"title":"A2"}',
    assigned_date: '2026-10-08', completed_at: '2026-10-08T00:30:00Z', response: "Antwort ä\nmit Zitat '", updated: '2026-10-08T00:30:00Z',
  });
  assert.deepEqual({ ...db.prepare('SELECT user_id,track,lesson_id,revision FROM learning_slots WHERE track=?').get('Deutsch') }, {
    user_id: 'admin-vu', track: 'Deutsch', lesson_id: 'lesson-de', revision: 3,
  });

  db.prepare('INSERT INTO learning_lessons (id,user_id,track,payload,assigned_date,updated) VALUES(?,?,?,?,?,?)')
    .run('learner-two-de', 'learner-two', 'Deutsch', '{"title":"A2"}', '2026-10-08', '2026-10-08T03:00:00Z');
  db.prepare('INSERT INTO learning_slots (user_id,track,lesson_id) VALUES(?,?,?)')
    .run('learner-two', 'Deutsch', 'learner-two-de');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM learning_slots WHERE track=?').get('Deutsch').n, 2);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  db.close();
});

test('0004 refuses to attach existing lessons when no admin owner exists and rolls back atomically', () => {
  const db = new DatabaseSync(':memory:');
  applyBase(db);
  db.prepare('INSERT INTO learning_lessons(id,track,payload,assigned_date,completed_at,response,updated) VALUES(?,?,?,?,?,?,?)')
    .run('legacy', 'Deutsch', '{"title":"Legacy"}', '2026-10-08', null, 'answer', '2026-10-08T00:00:00Z');
  db.exec('BEGIN');
  assert.throws(() => db.exec(sql('0004_learner_scope.sql')), /NOT NULL/);
  db.exec('ROLLBACK');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM learning_lessons').get().n, 1);
  assert.equal(db.prepare('PRAGMA table_info(learning_lessons)').all().some((column) => column.name === 'user_id'), false);
  db.close();
});
