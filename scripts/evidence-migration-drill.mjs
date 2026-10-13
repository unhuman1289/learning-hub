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
  const digest = (table) =>
    createHash('sha256')
      .update(JSON.stringify(db.prepare('SELECT * FROM "' + table.replaceAll('"', '""') + '"').all()))
      .digest('hex');
  const before = new Map(existing.map((t) => [t, digest(t)]));
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(readFileSync('drizzle/0011_evidence.sql', 'utf8'));
  for (const [table, hash] of before) if (digest(table) !== hash) throw Error('Existing data changed in ' + table);
  if (db.prepare('PRAGMA foreign_key_check').all().length) throw Error('Foreign key violation');
  for (const table of ['submissions', 'attempts', 'grades', 'disputes'])
    if (db.prepare(`SELECT count(*) n FROM ${table}`).get().n !== 0) throw Error('New table must be empty');
  console.log(JSON.stringify({ migration: '0011_evidence', existingTablesUnchanged: existing.length, newTables: 4, foreignKeys: 'pass' }));
} finally {
  db.close();
}
