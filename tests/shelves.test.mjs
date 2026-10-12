import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from './d1-adapter.mjs';
import { listViewableLearners } from '../lib/learners/list.ts';
import { parseSubjectInput } from '../lib/subjects/policy.ts';
import { createSubject } from '../lib/subjects/service.ts';
import { isStudyKey, toStudyDay } from '../lib/study-sql.ts';

function seeded() {
  const db = memoryDb();
  const user = db.sqlite.prepare('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at,role,status) VALUES(?,?,?,1,1,1,?,?)');
  user.run('vu', 'Vũ', 'vu@example.test', 'admin', 'active');
  user.run('ly', 'Ly', 'ly@example.test', 'learner', 'active');
  user.run('ech', 'Ech Account', 'ech@example.test', 'learner', 'active');
  user.run('new', 'Chờ duyệt', 'new@example.test', 'learner', 'pending');
  db.sqlite.prepare("INSERT INTO learner_settings(user_id,daily_target_minutes,updated,role,display_name) VALUES('ech',45,'t','child','Ếch')").run();
  db.sqlite.prepare("INSERT INTO guardians VALUES('ly','ech','vu','t')").run();
  return db;
}

test('viewable learners: self, wards for a guardian, every active account for an admin, never emails', async () => {
  const db = seeded();
  const names = (list) => list.map((item) => `${item.name}:${item.relation}:${item.role}`);
  assert.deepEqual(names(await listViewableLearners(db, { id: 'ech' })), ['Ếch:self:child']);
  assert.deepEqual(names(await listViewableLearners(db, { id: 'ly' })), ['Ly:self:adult', 'Ếch:ward:child']);
  assert.deepEqual(names(await listViewableLearners(db, { id: 'vu', role: 'admin' })), ['Vũ:self:adult', 'Ếch:member:child', 'Ly:member:adult']);
  assert.doesNotMatch(JSON.stringify(await listViewableLearners(db, { id: 'vu', role: 'admin' })), /@example/);
  db.sqlite.close();
});

test('a prepared notebook can be put back on the shelf once, active and with its track defaults', async () => {
  const db = seeded();
  const input = parseSubjectInput({ legacyTrack: 'Cardio', goal: 'Concept van hai lá' });
  assert.equal(input.title, 'Cardio');
  assert.equal(input.template, 'reading');
  assert.equal(input.sensitivity, 'clinical');
  const created = await createSubject(db, 'ly', 'ly', input);
  assert.equal(created.legacyTrack, 'Cardio');
  assert.equal(created.status, 'active');
  await assert.rejects(createSubject(db, 'ly', 'ly', parseSubjectInput({ legacyTrack: 'Cardio', title: 'Cardio 2' })), (error) => error.status === 409);
  assert.throws(() => parseSubjectInput({ legacyTrack: 'Physik' }), (error) => error.status === 400);
  db.sqlite.close();
});

test('study time keys accept legacy tracks and notebook ids only', () => {
  assert.equal(isStudyKey('Deutsch'), true);
  assert.equal(isStudyKey('sub_0123456789abcdef0123'), true);
  for (const key of ['sub_short', 'Physik', 'sub_0123456789ABCDEF0123', '', null]) assert.equal(isStudyKey(key), false, String(key));
  const day = toStudyDay('2026-10-12', [{ track: 'Deutsch', seconds: 60 }, { track: 'sub_0123456789abcdef0123', seconds: 30 }, { track: 'junk', seconds: 5 }], 45);
  assert.deepEqual(day.seconds, { Deutsch: 60, sub_0123456789abcdef0123: 30 });
});
