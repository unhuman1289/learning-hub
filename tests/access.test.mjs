import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decideAccess, canAccessLearner, resolveLearner } from '../lib/access.ts';
import { memoryDb } from './d1-adapter.mjs';

const actions = ['read_progress', 'read_work', 'edit_work', 'edit_goals', 'edit_settings', 'resolve_dispute', 'edit_workspace'];
const adultFacts = { learnerRole: 'adult', viewerIsGuardian: false };
const childFacts = { learnerRole: 'child', viewerIsGuardian: false };

// Expected matrix from docs/hub2/DATA-MODEL.md §5 (1 = allowed), in the order of `actions`.
const matrix = {
  'adult self': [{ id: 'vu' }, 'vu', adultFacts, [1, 1, 1, 1, 1, 0, 1]],
  'child self': [{ id: 'ech' }, 'ech', childFacts, [1, 1, 1, 0, 0, 0, 1]],
  guardian: [{ id: 'ly' }, 'ech', { learnerRole: 'child', viewerIsGuardian: true }, [1, 1, 0, 1, 1, 1, 0]],
  admin: [{ id: 'vu', role: 'admin' }, 'ly', adultFacts, [1, 1, 0, 1, 1, 1, 0]],
  'other learner': [{ id: 'ly' }, 'vu', adultFacts, [0, 0, 0, 0, 0, 0, 0]],
  'other learner viewing a child': [{ id: 'bot' }, 'ech', childFacts, [0, 0, 0, 0, 0, 0, 0]],
};

for (const [name, [viewer, learnerId, facts, expected]] of Object.entries(matrix)) {
  test(`access matrix: ${name}`, () => {
    assert.deepEqual(actions.map((action) => Number(decideAccess(viewer, learnerId, action, facts))), expected);
  });
}

function seeded() {
  const db = memoryDb();
  const now = '2026-10-12T10:00:00.000Z';
  db.sqlite.prepare("INSERT INTO learner_settings(user_id,daily_target_minutes,updated,role) VALUES('ech',45,?,'child')").run(now);
  db.sqlite.prepare("INSERT INTO guardians VALUES('ly','ech','vu',?)").run(now);
  return db;
}

test('canAccessLearner reads guardian links and child role from D1', async () => {
  const db = seeded();
  assert.equal(await canAccessLearner(db, { id: 'ly' }, 'ech', 'read_work'), true);
  assert.equal(await canAccessLearner(db, { id: 'ly' }, 'ech', 'edit_settings'), true);
  assert.equal(await canAccessLearner(db, { id: 'ly' }, 'ech', 'edit_work'), false);
  assert.equal(await canAccessLearner(db, { id: 'ech' }, 'ech', 'edit_work'), true);
  assert.equal(await canAccessLearner(db, { id: 'ech' }, 'ech', 'edit_settings'), false);
  assert.equal(await canAccessLearner(db, { id: 'bot' }, 'ech', 'read_progress'), false);
  assert.equal(await canAccessLearner(db, { id: 'ech' }, 'ly', 'read_progress'), false);
  db.sqlite.prepare("DELETE FROM guardians WHERE guardian_id='ly'").run();
  assert.equal(await canAccessLearner(db, { id: 'ly' }, 'ech', 'read_work'), false, 'removing the link revokes access at once');
  db.sqlite.close();
});

test('resolveLearner defaults to the viewer and answers 404 for anyone else', async () => {
  const db = seeded();
  const req = (query = '') => new Request('https://learn.example/api/daily' + query);
  assert.equal(await resolveLearner(db, { id: 'vu' }, req(), 'read_work'), 'vu');
  assert.equal(await resolveLearner(db, { id: 'ly' }, req('?learner=ech'), 'read_work'), 'ech');
  assert.equal(await resolveLearner(db, { id: 'vu', role: 'admin' }, req('?learner=ech'), 'read_progress'), 'ech');
  for (const [viewer, query, action] of [
    [{ id: 'bot' }, '?learner=ech', 'read_work'],
    [{ id: 'ly' }, '?learner=vu', 'read_progress'],
    [{ id: 'ly' }, '?learner=ech', 'edit_work'],
    [{ id: 'ech' }, '', 'edit_settings'],
    [{ id: 'vu', role: 'admin' }, "?learner=x'%20OR%201=1", 'read_work'],
  ]) {
    const result = await resolveLearner(db, viewer, req(query), action);
    assert.ok(result instanceof Response, `${viewer.id} ${query} ${action}`);
    assert.equal(result.status, 404);
  }
  db.sqlite.close();
});

test('routes never read ?learner= without lib/access', () => {
  const root = fileURLToPath(new URL('../app/api/', import.meta.url));
  const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(join(dir, e.name)) : e.name === 'route.ts' ? [join(dir, e.name)] : []);
  for (const file of files(root)) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /searchParams\.get\(['"]learner['"]\)/, `${file} must use resolveLearner`);
  }
});
