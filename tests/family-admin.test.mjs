import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from './d1-adapter.mjs';
import { linkGuardian, listFamily, setLearnerProfile, unlinkGuardian } from '../lib/admin/family.ts';
import { canAccessLearner } from '../lib/access.ts';

function seeded() {
  const db = memoryDb();
  const user = db.sqlite.prepare('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at,role,status) VALUES(?,?,?,1,?,1,?,?)');
  user.run('vu', 'Vũ', 'vu@example.test', 1, 'admin', 'active');
  user.run('ly', 'Ly', 'ly@example.test', 2, 'learner', 'active');
  user.run('ech', 'Ech', 'ech@example.test', 3, 'learner', 'active');
  user.run('wait', 'Wait', 'wait@example.test', 4, 'learner', 'pending');
  return db;
}
const status = async (promise) => { try { await promise; } catch (error) { return error.status; } return 200; };

test('admin sets a child role and nickname; existing minutes are kept', async () => {
  const db = seeded();
  db.sqlite.prepare("INSERT INTO learner_settings(user_id,daily_target_minutes,updated) VALUES('ech',30,'t')").run();
  await setLearnerProfile(db, 'ech', { role: 'child', displayName: 'Ếch' });
  const row = { ...db.sqlite.prepare("SELECT daily_target_minutes, role, display_name FROM learner_settings WHERE user_id='ech'").get() };
  assert.deepEqual(row, { daily_target_minutes: 30, role: 'child', display_name: 'Ếch' });
  await setLearnerProfile(db, 'ly', { displayName: 'Ly' });
  assert.equal(db.sqlite.prepare("SELECT role FROM learner_settings WHERE user_id='ly'").get().role, 'adult');
  assert.equal(await status(setLearnerProfile(db, 'ech', { role: 'robot' })), 400);
  assert.equal(await status(setLearnerProfile(db, 'ech', { displayName: 'x'.repeat(41) })), 400);
  assert.equal(await status(setLearnerProfile(db, 'ech', {})), 400);
  assert.equal(await status(setLearnerProfile(db, 'wait', { role: 'child' })), 404, 'pending accounts are approved first');
  db.sqlite.close();
});

test('linking a guardian grants access at once, unlinking revokes it', async () => {
  const db = seeded();
  await setLearnerProfile(db, 'ech', { role: 'child' });
  await linkGuardian(db, 'ly', 'ech', 'vu');
  await linkGuardian(db, 'ly', 'ech', 'vu');
  assert.equal(await canAccessLearner(db, { id: 'ly' }, 'ech', 'read_work'), true);
  const family = await listFamily(db);
  assert.deepEqual(family.map((m) => `${m.id}:${m.role}:${m.guardianIds.join('+')}`), ['vu:adult:', 'ly:adult:', 'ech:child:ly']);
  assert.equal(family.find((m) => m.id === 'vu').isAdmin, true);
  assert.equal(await status(linkGuardian(db, 'ly', 'ly', 'vu')), 400);
  assert.equal(await status(linkGuardian(db, 'wait', 'ech', 'vu')), 404);
  assert.equal(db.sqlite.prepare("SELECT created_by FROM guardians WHERE guardian_id='ly'").get().created_by, 'vu');
  await unlinkGuardian(db, 'ly', 'ech');
  assert.equal(await canAccessLearner(db, { id: 'ly' }, 'ech', 'read_work'), false);
  assert.equal(await status(unlinkGuardian(db, 'ly', 'ech')), 404);
  db.sqlite.close();
});
