import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const fileArg = process.argv.indexOf('--file');
if (fileArg < 0 || !process.argv[fileArg + 1]) throw new Error('Usage: node scripts/learner-migration-drill.mjs --file private-data/sites-export.json');
const snapshot = JSON.parse(readFileSync(resolve(process.argv[fileArg + 1]), 'utf8'));
if (![1, 2].includes(snapshot.format) || !snapshot.tables || typeof snapshot.tables !== 'object') throw new Error('Expected a legacy Sites snapshot in format 1 or 2.');

const baseTables = {
  learning_workspace: ['owner', 'payload', 'revision', 'updated'],
  learning_lessons: ['id', 'track', 'payload', 'assigned_date', 'completed_at', 'response', 'updated'],
  learning_slots: ['track', 'lesson_id', 'revision'],
  learning_runs: ['day', 'payload', 'updated'],
  runs: ['id', 'day', 'status', 'started_at', 'finished_at', 'summary', 'error', 'origin', 'request_hash'],
  run_items: ['run_id', 'user_id', 'track', 'outcome', 'reason', 'previous_lesson_id', 'lesson_id', 'sources'],
  backup_events: ['id', 'created_at', 'created_by'],
};
const sqlite = new DatabaseSync(':memory:');
const ownerId = 'migration-drill-admin';
try {
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const migration of readdirSync('drizzle').filter((name) => /^000[0-3]_.*\.sql$/.test(name)).sort()) {
    sqlite.exec(readFileSync(resolve('drizzle', migration), 'utf8'));
  }
  sqlite.prepare('INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at,role,status) VALUES(?,?,?,?,?,?,?,?)')
    .run(ownerId, 'Migration drill', 'migration-drill@example.invalid', 1, 1, 1, 'admin', 'active');

  for (const [table, rows] of Object.entries(snapshot.tables)) {
    const columns = baseTables[table];
    if (!columns || !Array.isArray(rows)) throw new Error(`Unsupported snapshot table: ${table}`);
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Object.keys(row).some((key) => !columns.includes(key)) || columns.some((key) => !Object.hasOwn(row, key))) {
        throw new Error(`Snapshot row shape is invalid for ${table}.`);
      }
      const placeholders = columns.map(() => '?').join(',');
      sqlite.prepare(`INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(',')}) VALUES(${placeholders})`)
        .run(...columns.map((column) => row[column]));
    }
  }

  const original = Object.fromEntries(Object.entries(snapshot.tables).map(([table, rows]) => [table, rows.map((row) => ({ ...row }))]));
  sqlite.exec(readFileSync(resolve('drizzle/0004_learner_scope.sql'), 'utf8'));
  sqlite.exec(readFileSync(resolve('drizzle/0005_automation.sql'), 'utf8'));

  for (const [table, rows] of Object.entries(original)) {
    if (table === 'learning_lessons') {
      for (const row of rows) {
        const restored = sqlite.prepare('SELECT * FROM learning_lessons WHERE id=?').get(row.id);
        if (!restored || restored.user_id !== ownerId || restored.automation_reviewed_at !== null) throw new Error('Learner migration changed a lesson identity or failed to assign its owner.');
        for (const [key, value] of Object.entries(row)) if (restored[key] !== value) throw new Error('Learner migration changed a lesson cell.');
      }
    } else if (table === 'learning_slots') {
      for (const row of rows) {
        const restored = sqlite.prepare('SELECT * FROM learning_slots WHERE user_id=? AND track=?').get(ownerId, row.track);
        if (!restored || restored.user_id !== ownerId) throw new Error('Learner migration changed a slot identity or failed to assign its owner.');
        for (const [key, value] of Object.entries(row)) if (restored[key] !== value) throw new Error('Learner migration changed a slot cell.');
      }
    } else {
      const restored = sqlite.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all();
      if (restored.length !== rows.length || rows.some((row, index) => Object.entries(row).some(([key, value]) => restored[index]?.[key] !== value))) throw new Error(`Learner migration changed a cell in ${table}.`);
    }
  }
  if (sqlite.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Learner migration left a broken foreign key.');
  console.log(JSON.stringify({ result: 'legacy snapshot retained every original cell after 0004/0005', ownerBackfill: 'synthetic migration-drill admin', tables: Object.fromEntries(Object.entries(original).map(([table, rows]) => [table, rows.length])) }, null, 2));
} finally {
  sqlite.close();
}
