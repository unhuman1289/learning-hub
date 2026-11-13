import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { buildRestoreSql } from '../lib/backup-contract.mjs';
import { legacyTrackDefaults, insertSubjectSql, listSubjectsSql, newSubjectId, DEFAULT_LIMITS } from '../lib/subjects/sql.ts';
import { memoryDb } from './d1-adapter.mjs';

const migrations = readdirSync(new URL('../drizzle/', import.meta.url)).filter((f) => f.endsWith('.sql')).sort();
const read = (file) => readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8');

function databaseBefore0007() {
  const db = new DatabaseSync(':memory:');
  for (const file of migrations.filter((f) => f < '0007')) db.exec(read(file));
  return db;
}

function seedLegacy(db) {
  for (const id of ['vu', 'ly']) db.prepare('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at,role,status) VALUES(?,?,?,1,1,1,?,?)').run(id, id, id + '@example.test', id === 'vu' ? 'admin' : 'learner', 'active');
  const lesson = db.prepare('INSERT INTO learning_lessons(id,user_id,track,payload,assigned_date,completed_at,response,updated) VALUES(?,?,?,?,?,?,?,?)');
  lesson.run('vu-de-1', 'vu', 'Deutsch', '{"title":"A2"}', '2026-10-01', '2026-10-01T20:00:00Z', 'Antwort', 't');
  lesson.run('vu-de-2', 'vu', 'Deutsch', '{"title":"A2b"}', '2026-10-02', null, '', 't');
  lesson.run('vu-mtb', 'vu', 'MTB', '{"title":"VAF"}', '2026-10-01', null, 'Notiz', 't');
  lesson.run('ly-cardio', 'ly', 'Cardio', '{"title":"MR"}', '2026-10-01', null, '', 't');
  lesson.run('ly-bot', 'ly', 'Bột', '{"title":"Ngủ"}', '2026-10-01', null, '', 't');
  db.prepare('INSERT INTO learning_slots(user_id,track,lesson_id,revision) VALUES(?,?,?,0)').run('vu', 'Deutsch', 'vu-de-2');
  db.prepare("INSERT INTO learner_settings(user_id,daily_target_minutes,updated) VALUES('vu',45,'t')").run();
}

const snapshot = (db) => db.prepare('SELECT * FROM learning_lessons ORDER BY id').all();

test('0007 creates one notebook per (learner, legacy track) and leaves lessons untouched', () => {
  const db = databaseBefore0007();
  seedLegacy(db);
  const lessonsBefore = snapshot(db);
  db.exec(read('0007_subjects.sql'));
  assert.deepEqual(snapshot(db), lessonsBefore);
  const rows = db.prepare('SELECT learner_id, title, template, sensitivity, legacy_track, status, ai_enabled, created_by FROM subjects ORDER BY learner_id, title').all().map((row) => ({ ...row }));
  assert.deepEqual(rows.map((row) => `${row.learner_id}:${row.title}`), ['ly:Bột', 'ly:Cardio', 'vu:Deutsch', 'vu:MTB']);
  for (const row of rows) {
    assert.equal(row.legacy_track, row.title);
    assert.equal(row.template, legacyTrackDefaults[row.legacy_track].template);
    assert.equal(row.sensitivity, legacyTrackDefaults[row.legacy_track].sensitivity);
    assert.equal(row.status, 'active');
    assert.equal(row.ai_enabled, 0);
    assert.equal(row.created_by, 'migration');
  }
  assert.match(db.prepare('SELECT id FROM subjects LIMIT 1').get().id, /^sub_[0-9a-f]{20}$/);
  assert.equal(JSON.parse(db.prepare('SELECT limits FROM subjects LIMIT 1').get().limits).maxDifficulty, DEFAULT_LIMITS.maxDifficulty);
  const settings = { ...db.prepare("SELECT * FROM learner_settings WHERE user_id='vu'").get() };
  assert.deepEqual(settings, { user_id: 'vu', daily_target_minutes: 45, updated: 't', role: 'adult', display_name: null, explain_language: 'vi', preferences: '{}', ai_budget: null });
  db.close();
});

test('0007 constraints reject invalid notebooks, skills, guardians and requests', () => {
  const db = memoryDb({ through: "0025" }).sqlite;
  const now = '2026-10-12T10:00:00.000Z';
  const insert = (id, learner, title, template = 'skill') => db.prepare(insertSubjectSql).run(id, learner, title, template, 'normal', '', '', '', JSON.stringify(DEFAULT_LIMITS), 3, 'setup', null, learner, now, now);
  insert('sub_a', 'ech', 'Toán 7');
  assert.throws(() => insert('sub_b', 'ech', 'Toán 7'), /UNIQUE/);
  insert('sub_c', 'vu', 'Toán 7');
  assert.throws(() => insert('sub_d', 'ech', 'Hóa 7', 'video'), /CHECK/);
  assert.throws(() => insert('sub_e', 'ech', ''), /CHECK/);
  assert.throws(() => db.prepare("UPDATE subjects SET weight=9 WHERE id='sub_a'").run(), /CHECK/);
  assert.throws(() => db.prepare("UPDATE subjects SET legacy_track='Physik' WHERE id='sub_a'").run(), /CHECK/);
  assert.throws(() => db.prepare("INSERT INTO guardians VALUES('vu','vu','admin',?)").run(now), /CHECK/);
  db.prepare("INSERT INTO guardians VALUES('vu','ech','admin',?)").run(now);
  const skill = db.prepare("INSERT INTO skills(id,subject_id,learner_id,key,name,origin,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)");
  skill.run('sk_1', 'sub_a', 'ech', 'ti-le-thuc', 'Tỉ lệ thức', 'user', now, now);
  assert.throws(() => skill.run('sk_2', 'sub_a', 'ech', 'ti-le-thuc', 'Trùng', 'user', now, now), /UNIQUE/);
  assert.throws(() => skill.run('sk_3', 'sub_a', 'ech', 'x', 'X', 'robot', now, now), /CHECK/);
  assert.throws(() => db.prepare("INSERT INTO learner_requests(id,learner_id,kind,text,created_by,created_at) VALUES('r1','ech','gossip','?','ech',?)").run(now), /CHECK/);
  assert.throws(() => db.prepare("INSERT INTO learner_settings(user_id,daily_target_minutes,updated,role) VALUES('x',60,?,'robot')").run(now), /CHECK/);
  assert.equal(db.prepare(listSubjectsSql).all('ech').length, 1);
  assert.match(newSubjectId(), /^sub_[0-9a-f]{20}$/);
  db.close();
});

test('backups carry the new tables and older format-3 snapshots still restore', () => {
  const old = { format: 3, tables: {
    learning_workspace: [], learning_lessons: [], learning_slots: [], learning_runs: [], runs: [], legacy_run_items: [],
    automation_runs: [], run_targets: [], run_items: [], run_events: [], backup_events: [], study_time: [],
    learner_settings: [{ user_id: 'vu', daily_target_minutes: 45, updated: 't' }],
  } };
  const copy = memoryDb({ through: "0025" }).sqlite;
  copy.exec(buildRestoreSql(old));
  assert.equal(copy.prepare("SELECT role FROM learner_settings WHERE user_id='vu'").get().role, 'adult');
  const now = 't';
  copy.prepare(insertSubjectSql).run('sub_x', 'vu', 'Deutsch B2', 'skill', 'normal', 'B2', 'A2', '', JSON.stringify(DEFAULT_LIMITS), 3, 'active', null, 'vu', now, now);
  copy.prepare("INSERT INTO guardians VALUES('vu','ech','admin',?)").run(now);
  const tables = {};
  for (const table of ['learning_workspace', 'learning_lessons', 'learning_slots', 'learning_runs', 'runs', 'legacy_run_items', 'automation_runs', 'run_targets', 'run_items', 'run_events', 'backup_events', 'study_time', 'learner_settings', 'guardians', 'subjects', 'skills', 'learner_requests']) {
    tables[table] = copy.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map((row) => ({ ...row }));
  }
  const restored = memoryDb({ through: "0025" }).sqlite;
  restored.exec(buildRestoreSql({ format: 3, tables }));
  for (const [table, rows] of Object.entries(tables)) assert.deepEqual(restored.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map((row) => ({ ...row })), rows, table);
  copy.close(); restored.close();
});
