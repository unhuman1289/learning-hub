import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const file = process.argv[2];
if (!file) throw Error('Pass a private staging SQL export. No remote writes.');
const db = new DatabaseSync(':memory:');
try {
  db.exec('PRAGMA foreign_keys=OFF');
  db.exec(readFileSync(file, 'utf8'));
  const existing = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((r) => r.name);
  const digest = (t) =>
    createHash('sha256')
      .update(JSON.stringify(db.prepare('SELECT * FROM "' + t.replaceAll('"', '""') + '"').all()))
      .digest('hex');
  const before = new Map(existing.map((t) => [t, digest(t)]));
  db.exec('PRAGMA foreign_keys=ON');
  for (const m of ['0012_learner_model.sql', '0013_ai_jobs.sql']) db.exec(readFileSync('drizzle/' + m, 'utf8'));
  for (const [table, hash] of before) if (digest(table) !== hash) throw Error('Existing data changed in ' + table);
  if (db.prepare('PRAGMA foreign_key_check').all().length) throw Error('Foreign key violation');
  console.log(JSON.stringify({ migrations: ['0012', '0013'], existingTablesUnchanged: existing.length, foreignKeys: 'pass', remoteWrites: false }));
} finally {
  db.close();
}
