import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildRestoreSql } from '../lib/backup-contract.mjs';
import {
  configuredDatabase, countRows, readAndCompareSnapshot, readMarker, runRemoteD1,
} from './d1-remote.mjs';

function argumentsFrom(argv) {
  const args = Object.fromEntries(argv.slice(2).reduce((pairs, value, index, list) => {
    if (!value.startsWith('--')) return pairs;
    pairs.push([value.slice(2), list[index + 1]]);
    return pairs;
  }, []));
  if (!args.env || !args.file || !args.confirm) {
    throw new Error('Usage: node scripts/d1-import.mjs --env staging --file private-data/sites-export.json --confirm learning-hub-staging');
  }
  if (args.env !== 'staging') throw new Error('This import tool is intentionally limited to staging.');
  return args;
}

const args = argumentsFrom(process.argv);
const database = configuredDatabase(args.env);
if (args.confirm !== database) throw new Error('Database confirmation does not match the Wrangler staging configuration.');
const snapshot = JSON.parse(readFileSync(resolve(args.file), 'utf8'));
const importId = `sites-import-${createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')}`;
const importBy = `system:sites-import:${importId.slice('sites-import-'.length)}`;
const marker = readMarker(args.env, database, importId);
const counts = countRows(args.env, database);

if (marker) {
  if (marker.created_by !== importBy) throw new Error('A different import already owns this marker; no rows were changed.');
  if (counts.user || counts.account || counts.session || counts.verification || counts.rate_limit) {
    throw new Error('Staging auth data exists; refusing to resume an import. No rows were changed.');
  }
} else if (Object.values(counts).some((count) => count !== 0)) {
  throw new Error('The staging D1 database is not empty. Import stopped without changing rows.');
}

const markerSql = `INSERT OR IGNORE INTO backup_events(id,created_at,created_by) VALUES('${importId}','${new Date().toISOString()}','${importBy}');`;
const safeRestoreSql = buildRestoreSql(snapshot).replaceAll('INSERT INTO ', 'INSERT OR IGNORE INTO ');
const directory = mkdtempSync(join(tmpdir(), 'learning-hub-sites-import-'));
const sqlFile = join(directory, 'restore.sql');
try {
  writeFileSync(sqlFile, `${markerSql}\n${safeRestoreSql}`, { mode: 0o600, flag: 'wx' });
  runRemoteD1(args.env, database, ['--file', sqlFile]);
} finally {
  rmSync(directory, { recursive: true, force: true });
}

const comparison = readAndCompareSnapshot(args.env, database, snapshot);
if (comparison.some((table) => !table.ok)) {
  console.error(JSON.stringify(comparison));
  throw new Error('Import verification failed. Existing data was not overwritten; inspect staging before any retry.');
}
console.log(JSON.stringify({ environment: args.env, database, result: 'verified', tables: comparison.map(({ table, expected, actual }) => ({ table, expected, actual })) }, null, 2));
