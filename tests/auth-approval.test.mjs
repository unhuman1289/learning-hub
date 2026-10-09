import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialAccountStatus,
  mayApproveAccount,
  mayCreateSession,
  statusAfterEmailVerification,
} from '../lib/auth/approval-policy.ts';
import { accountCanCreateSession, approvePendingAccount, listPendingApprovals } from '../lib/auth/approval-store.ts';
import { memoryDb } from './d1-adapter.mjs';

test('public non-local signups remain pending until approval; local development stays usable', () => {
  assert.equal(initialAccountStatus(false), 'pending');
  assert.equal(initialAccountStatus(true), 'active');
});

test('verifying email does not approve learners, while the one-time bootstrap admin can sign in', () => {
  assert.equal(statusAfterEmailVerification('learner', false), 'pending');
  assert.equal(statusAfterEmailVerification('admin', false), 'active');
  assert.equal(statusAfterEmailVerification('learner', true), 'active');
});

test('only active accounts can create sessions', () => {
  assert.equal(mayCreateSession('active'), true);
  assert.equal(mayCreateSession('pending'), false);
  assert.equal(mayCreateSession('disabled'), false);
  assert.equal(mayCreateSession(null), false);
});

test('admin approval requires a verified pending learner', () => {
  assert.equal(mayApproveAccount({ role: 'learner', status: 'pending', emailVerified: true }), true);
  assert.equal(mayApproveAccount({ role: 'learner', status: 'pending', emailVerified: false }), false);
  assert.equal(mayApproveAccount({ role: 'learner', status: 'active', emailVerified: true }), false);
  assert.equal(mayApproveAccount({ role: 'admin', status: 'pending', emailVerified: true }), false);
});

test('admin approval lists verified pending learners and updates only an eligible account', async () => {
  const db = memoryDb();
  const insert = db.sqlite.prepare('INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at,role,status) VALUES (?,?,?,?,?,?,?,?)');
  const add = (id, emailVerified, role = 'learner', status = 'pending') => insert.run(
    id, id, `${id}@example.invalid`, emailVerified, 100, 100, role, status,
  );
  add('verified-pending', 1);
  add('unverified-pending', 0);
  add('active-learner', 1, 'learner', 'active');
  add('pending-admin', 1, 'admin');

  assert.deepEqual((await listPendingApprovals(db)).map(({ id }) => id), ['verified-pending']);
  assert.equal(await accountCanCreateSession(db, 'verified-pending'), false);
  assert.equal(await accountCanCreateSession(db, 'active-learner'), true);
  assert.equal(await accountCanCreateSession(db, 'missing-user'), false);
  assert.equal(await approvePendingAccount(db, 'verified-pending', 200), true);
  assert.deepEqual({ ...db.sqlite.prepare('SELECT status, updated_at FROM "user" WHERE id = ?').get('verified-pending') }, {
    status: 'active', updated_at: 200,
  });
  assert.equal(await approvePendingAccount(db, 'verified-pending', 300), false);
  assert.equal(await approvePendingAccount(db, 'unverified-pending', 300), false);
  assert.equal(await approvePendingAccount(db, 'pending-admin', 300), false);
  db.sqlite.close();
});
