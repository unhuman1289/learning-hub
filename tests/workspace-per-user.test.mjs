import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

const migrations = readdirSync(new URL('../drizzle/', import.meta.url)).filter((f) => f.endsWith('.sql')).sort();
const read = (file) => readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8');
const SHARED = '__shared_family_workspace__';

function before0008() {
  const db = new DatabaseSync(':memory:');
  for (const file of migrations.filter((f) => f < '0008')) db.exec(read(file));
  return db;
}
const user = (db, id, role, created) => db.prepare('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at,role,status) VALUES(?,?,?,1,?,1,?,?)').run(id, id, id + '@example.test', created, role, 'active');
const rows = (db) => db.prepare('SELECT owner, payload, revision FROM learning_workspace ORDER BY owner').all().map((row) => ({ ...row }));

test('0008 gives the shared workspace to the first admin; others start empty', () => {
  const db = before0008();
  user(db, 'ly', 'learner', 1);
  user(db, 'vu', 'admin', 2);
  user(db, 'admin2', 'admin', 3);
  db.prepare('INSERT INTO learning_workspace VALUES(?,?,?,?)').run(SHARED, '{"notes":["chung"]}', 4, 't');
  db.exec(read('0008_workspace_per_user.sql'));
  assert.deepEqual(rows(db), [{ owner: 'vu', payload: '{"notes":["chung"]}', revision: 4 }]);
  db.close();
});

test('0008 replaces an older admin row with the newer shared workspace', () => {
  const db = before0008();
  user(db, 'vu', 'admin', 1);
  db.prepare('INSERT INTO learning_workspace VALUES(?,?,?,?)').run('vu', '{"notes":["cũ"]}', 1, 'old');
  db.prepare('INSERT INTO learning_workspace VALUES(?,?,?,?)').run(SHARED, '{"notes":["mới"]}', 7, 'new');
  db.exec(read('0008_workspace_per_user.sql'));
  assert.deepEqual(rows(db), [{ owner: 'vu', payload: '{"notes":["mới"]}', revision: 7 }]);
  db.close();
});

test('0008 leaves data untouched when there is no admin yet', () => {
  const db = before0008();
  db.prepare('INSERT INTO learning_workspace VALUES(?,?,?,?)').run(SHARED, 'null', 0, 't');
  db.exec(read('0008_workspace_per_user.sql'));
  assert.deepEqual(rows(db), [{ owner: SHARED, payload: 'null', revision: 0 }]);
  db.close();
});

test('workspace route reads through lib/access and writes only the signed-in account', () => {
  const route = readFileSync(new URL('../app/api/state/route.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(route, /__shared_family_workspace__/);
  assert.match(route, /resolveLearner\(db,u,req,'read_work'\)/);
  assert.match(route, /WHERE owner = \? AND revision = \?'\)\.bind\(JSON\.stringify\(body\.data\),new Date\(\)\.toISOString\(\),u\.id,body\.revision\)/);
  assert.match(route, /if\(owner===u\.id\)await ensureWorkspace/);
});
