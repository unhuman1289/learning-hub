import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildRestoreSql, backupColumns } from '../lib/backup-contract.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, list) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), list[index + 1]]);
  return pairs;
}, []));
if (!args.file) throw new Error('Usage: node scripts/restore-drill.mjs --file /path/to/private-backup.json');

const snapshot = JSON.parse(readFileSync(resolve(args.file), 'utf8'));
const sqlite = new DatabaseSync(':memory:');
try {
  for (const migration of readdirSync('drizzle').filter((name) => name.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(resolve('drizzle', migration), 'utf8'));
  }
  sqlite.exec(buildRestoreSql(snapshot));

  const tables = [];
  for (const [table, expected] of Object.entries(snapshot.tables)) {
    const columns = backupColumns[table];
    if (!columns || !Array.isArray(expected)) throw new Error(`Invalid backup table: ${table}`);
    const actual = sqlite.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all();
    const canonical = (row) => JSON.stringify(columns.map((column) => row[column] ?? null));
    const expectedRows = expected.map(canonical).sort();
    const actualRows = actual.map(canonical).sort();
    if (JSON.stringify(expectedRows) !== JSON.stringify(actualRows)) {
      throw new Error(`Restore verification failed for ${table} (expected ${expected.length}; restored ${actual.length}).`);
    }
    tables.push({ table, rows: actual.length });
  }
  console.log(JSON.stringify({ result: 'restore verified in a fresh in-memory SQLite database', tables }, null, 2));
} finally {
  sqlite.close();
}
