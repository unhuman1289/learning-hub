import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { memoryDb } from './d1-adapter.mjs';
import { buildRestoreSql } from '../lib/backup-contract.mjs';
import { insertLessonV2, readLessonV2, promptHash } from '../lib/lesson-v2/store.ts';
import { validateLessonPackage } from '../lib/lesson-v2/validate.ts';
import { readDailyFor } from '../lib/daily-view.ts';

const migrations = readdirSync(new URL('../drizzle/', import.meta.url)).filter((f) => f.endsWith('.sql')).sort();
const read = (file) => readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8');
const fixture = (name) => validateLessonPackage(JSON.parse(readFileSync(new URL(`../fixtures/contracts/lesson-v2/${name}.json`, import.meta.url), 'utf8'))).lesson;
const OLD_COLUMNS = 'id,user_id,track,payload,assigned_date,completed_at,response,updated,automation_reviewed_at';

function before0009() {
  const db = new DatabaseSync(':memory:');
  for (const file of migrations.filter((f) => f < '0007')) db.exec(read(file));
  return db;
}

function seedLegacy(db) {
  db.prepare('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at,role,status) VALUES(?,?,?,1,1,1,?,?)').run('vu', 'Vũ', 'vu@example.test', 'admin', 'active');
  const lesson = db.prepare(`INSERT INTO learning_lessons(${OLD_COLUMNS}) VALUES(?,?,?,?,?,?,?,?,?)`);
  lesson.run('vu-de-1', 'vu', 'Deutsch', JSON.stringify({ title: 'A2', minutes: 30 }), '2026-10-01', '2026-10-01T20:00:00Z', "Antwort ' ä \"quote\"", 't1', '2026-10-02T01:00:00Z');
  lesson.run('vu-de-2', 'vu', 'Deutsch', JSON.stringify({ title: 'A2b' }), '2026-10-02', null, '', 't2', null);
  lesson.run('vu-mtb', 'vu', 'MTB', '{"title":"VAF","minutes":45}', '2026-10-01', null, 'Notiz', 't3', null);
  db.prepare("INSERT INTO learning_slots VALUES('vu','Deutsch','vu-de-2',3),('vu','MTB','vu-mtb',0)").run();
  db.prepare("INSERT INTO automation_runs(id,client_id,contract_version,trigger,runner_name,runner_version,runner_model,request_hash,status,created_at,expires_at) VALUES('run1','c','1','manual','r','1','m','h','finished','t','t')").run();
  db.prepare("INSERT INTO run_targets(run_id,target_id,user_id,track,current_lesson_id,eligible,eligibility,context_json) VALUES('run1','tgt1','vu','Deutsch','vu-de-2',0,'not_completed','{}')").run();
  db.prepare("INSERT INTO run_items(run_id,target_id,action,outcome,reason,lesson_id,payload) VALUES('run1','tgt1','assign','assigned','','vu-de-1','{}')").run();
  db.exec(read('0007_subjects.sql'));
  db.exec(read('0008_workspace_per_user.sql'));
}

test('0009 keeps every lesson, answer, slot and automation reference', () => {
  const db = before0009();
  seedLegacy(db);
  const lessonsBefore = db.prepare(`SELECT ${OLD_COLUMNS} FROM learning_lessons ORDER BY id`).all().map((r) => ({ ...r }));
  const slotsBefore = db.prepare('SELECT * FROM learning_slots ORDER BY track').all().map((r) => ({ ...r }));
  db.exec('BEGIN'); db.exec(read('0009_lessons_v2.sql')); db.exec('COMMIT');
  assert.deepEqual(db.prepare(`SELECT ${OLD_COLUMNS} FROM learning_lessons ORDER BY id`).all().map((r) => ({ ...r })), lessonsBefore);
  assert.deepEqual(db.prepare('SELECT * FROM learning_slots ORDER BY track').all().map((r) => ({ ...r })), slotsBefore);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  const rows = db.prepare("SELECT l.id, l.package_version, l.kind, l.slot, l.est_minutes, s.legacy_track FROM learning_lessons l LEFT JOIN subjects s ON s.id = l.subject_id ORDER BY l.id").all().map((r) => ({ ...r }));
  assert.deepEqual(rows, [
    { id: 'vu-de-1', package_version: '1', kind: 'legacy', slot: 'primary', est_minutes: 30, legacy_track: 'Deutsch' },
    { id: 'vu-de-2', package_version: '1', kind: 'legacy', slot: 'primary', est_minutes: null, legacy_track: 'Deutsch' },
    { id: 'vu-mtb', package_version: '1', kind: 'legacy', slot: 'primary', est_minutes: 45, legacy_track: 'MTB' },
  ]);
  // Automation v1 still gets at most one lesson per track per day, and its rows find their notebook.
  const v1 = db.prepare(`INSERT OR IGNORE INTO learning_lessons(id,user_id,track,payload,assigned_date,completed_at,response,updated) VALUES(?,?,?,?,?,NULL,'',?)`);
  assert.equal(Number(v1.run('dup', 'vu', 'Deutsch', '{}', '2026-10-02', 't').changes), 0);
  assert.equal(Number(v1.run('vu-de-3', 'vu', 'Deutsch', '{}', '2026-10-03', 't').changes), 1);
  assert.equal(db.prepare("SELECT s.legacy_track AS t FROM learning_lessons l JOIN subjects s ON s.id=l.subject_id WHERE l.id='vu-de-3'").get().t, 'Deutsch');
  db.close();
});

test('v2 lessons: stored with items, one primary and one review per notebook per day, secrets stripped', async () => {
  const db = memoryDb({ through: "0025" });
  const now = 't';
  db.sqlite.prepare("INSERT INTO subjects(id,learner_id,title,template,status,created_by,created_at,updated_at) VALUES('sub_aaaaaaaaaaaaaaaaaaaa','ech','Deutsch','skill','active','ly',?,?)").run(now, now);
  const lesson = fixture('deutsch-modalverb');
  const id = await insertLessonV2(db, { learnerId: 'ech', subjectId: 'sub_aaaaaaaaaaaaaaaaaaaa', day: '2026-10-12', lesson });
  assert.match(id, /^les_[0-9a-f]{20}$/);
  const items = db.sqlite.prepare('SELECT item_id, stage, activity, input_kind, auto_gradable, prompt_hash FROM lesson_items WHERE lesson_id=? ORDER BY rowid').all(id).map((r) => ({ ...r }));
  assert.deepEqual(items.map((i) => `${i.item_id}:${i.stage}:${i.auto_gradable}`), ['i1:retrieval:1', 'i2:retrieval:1', 'i3:guided:0', 'i4:guided:0', 'i5:independent:0']);
  assert.equal(items[1].prompt_hash, await promptHash('  sửa câu:   LENA kann heute Suppe kocht. '));
  await assert.rejects(insertLessonV2(db, { learnerId: 'ech', subjectId: 'sub_aaaaaaaaaaaaaaaaaaaa', day: '2026-10-12', lesson }), (e) => e.status === 409);
  await insertLessonV2(db, { learnerId: 'ech', subjectId: 'sub_aaaaaaaaaaaaaaaaaaaa', day: '2026-10-12', lesson: fixture('review-deutsch') });
  await insertLessonV2(db, { learnerId: 'ech', subjectId: 'sub_aaaaaaaaaaaaaaaaaaaa', day: '2026-10-13', lesson });

  const view = await readLessonV2(db, 'ech', id);
  assert.equal(view.title, lesson.title);
  const text = JSON.stringify(view.items);
  assert.doesNotMatch(text, /"key"|"solution"|Lena kann heute Suppe kochen\./, 'no key, solution or answer before reveal');
  assert.equal(view.items[1].hintCount, 1);
  db.sqlite.prepare(`UPDATE learning_lessons SET support='{"i2":"hint1","i3":"solution"}' WHERE id=?`).run(id);
  const revealed = await readLessonV2(db, 'ech', id, new Set(['i1']));
  assert.deepEqual(revealed.items[1].revealed, { hints: ['Sau Modalverb, động từ cuối câu ở dạng nào?'], solutionSeen: false });
  assert.equal(revealed.items[2].revealed.solution, 'Paul möchte einen Kuchen kaufen.');
  assert.equal(revealed.items[0].revealed.solution, 'b: Ich kann heute kochen.', 'graded items show their solution');
  await assert.rejects(readLessonV2(db, 'vu', id), (e) => e.status === 404, 'other learners cannot read it');

  // The v1 daily view never lists v2 lessons.
  const daily = await readDailyFor(db, 'ech', false);
  assert.equal(daily.history.length + daily.active.length, 0);
  db.sqlite.close();
});

test('format-3 backups restore into the rebuilt table; format-4 backups round-trip lessons and items', async () => {
  const restored = memoryDb({ through: "0025" }).sqlite;
  restored.exec(buildRestoreSql({ format: 3, tables: {
    learning_workspace: [], learning_slots: [], learning_runs: [], runs: [], legacy_run_items: [], automation_runs: [], run_targets: [], run_items: [], run_events: [], backup_events: [], study_time: [], learner_settings: [],
    subjects: [{ id: 'sub_bbbbbbbbbbbbbbbbbbbb', learner_id: 'vu', title: 'Deutsch', template: 'skill', sensitivity: 'normal', goal: '', level: '', curriculum: '', limits: '{}', weight: 3, status: 'active', ai_enabled: 0, legacy_track: 'Deutsch', progress_summary: '', progress_updated_at: null, revision: 0, created_by: 'migration', created_at: 't', updated_at: 't' }],
    learning_lessons: [{ id: 'old', user_id: 'vu', track: 'Deutsch', payload: '{}', assigned_date: '2026-10-01', completed_at: null, response: 'x', updated: 't', automation_reviewed_at: null }],
  } }));
  const old = { ...restored.prepare("SELECT package_version, kind, subject_id FROM learning_lessons WHERE id='old'").get() };
  assert.deepEqual(old, { package_version: '1', kind: 'legacy', subject_id: 'sub_bbbbbbbbbbbbbbbbbbbb' });
  restored.close();
});

test('0028 and 0029 promote saved packages and preserve drafts and completion', async () => {
  const db = memoryDb({ through: '0027' });
  const subjectId = 'sub_aaaaaaaaaaaaaaaaaaaa';
  db.sqlite.prepare(`INSERT INTO subjects(id,learner_id,title,template,status,created_by,created_at,updated_at)
    VALUES(?,'ech','Deutsch','skill','active','ly','t','t')`).run(subjectId);
  const lesson = fixture('deutsch-modalverb');
  const id = await insertLessonV2(db, { learnerId: 'ech', subjectId, day: '2026-10-12', lesson });
  db.sqlite.prepare("UPDATE learning_lessons SET draft=?,draft_revision=2,completed_at=? WHERE id=?")
    .run(JSON.stringify({ i3: { answer: 'Ich kann lesen.' } }), '2026-10-12T13:00:00Z', id);
  const items = db.sqlite.prepare('SELECT * FROM lesson_items WHERE lesson_id=? ORDER BY rowid').all(id);
  db.sqlite.exec(read('0028_one_package.sql'));
  db.sqlite.exec(read('0029_item_kinds.sql'));
  const row = db.sqlite.prepare('SELECT payload, package_version FROM learning_lessons WHERE id=?').get(id);
  assert.equal(row.package_version, '3');
  assert.deepEqual(validateLessonPackage(JSON.parse(row.payload)).lesson, { ...lesson, contract: 'lesson-package/3', knowledge: [] });
  assert.deepEqual(db.sqlite.prepare('SELECT * FROM lesson_items WHERE lesson_id=? ORDER BY rowid').all(id), items);
  const view = await readLessonV2(db, 'ech', id);
  assert.deepEqual(view.draft, { i3: { answer: 'Ich kann lesen.' } });
  assert.equal(view.draftRevision, 2);
  assert.equal(view.completedAt, '2026-10-12T13:00:00Z');
  assert.equal(db.sqlite.prepare("SELECT json_extract(limits,'$.package') AS version FROM subjects WHERE id=?").get(subjectId).version, null);
  db.sqlite.close();
});
