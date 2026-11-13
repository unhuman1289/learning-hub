import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildRestoreSql, columnsForSnapshotTable, restoreTargetTable, snapshotRowsForTarget } from '../lib/backup-contract.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, list) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), list[index + 1]]);
  return pairs;
}, []));
if (!args.file) throw new Error('Usage: node scripts/restore-drill.mjs --file /path/to/private-backup.json');

const snapshot = JSON.parse(readFileSync(resolve(args.file), 'utf8'));
const legacyOwnerId = args['legacy-owner'] || 'restore-drill-legacy-owner';
const sqlite = new DatabaseSync(':memory:');
try {
  for (const migration of readdirSync('drizzle').filter((name) => name.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(resolve('drizzle', migration), 'utf8'));
  }
  sqlite.exec(buildRestoreSql(snapshot, { legacyOwnerId }));

  const tables = [];
  for (const [sourceTable, expected] of Object.entries(snapshot.tables)) {
    const table = restoreTargetTable(snapshot, sourceTable);
    const columns = columnsForSnapshotTable(snapshot, sourceTable);
    if (!columns || !Array.isArray(expected)) throw new Error(`Invalid backup table: ${table}`);
    const exists = sqlite.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(table);
    if (!exists && expected.length === 0) {
      tables.push({ table, rows: 0 });
      continue;
    }
    const actual = sqlite.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all();
    const sourceRows = snapshotRowsForTarget(snapshot, table) ?? expected;
    const canonical = (row) => JSON.stringify(columns.map((column) => row[column] ?? (column === 'user_id' && ['learning_lessons', 'learning_slots'].includes(table) ? legacyOwnerId : null)));
    const expectedRows = sourceRows.map(canonical).sort();
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
