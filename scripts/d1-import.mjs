import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildRestoreSql } from '../lib/backup-contract.mjs';
import {
  canImportWithEmptyWorkspacePlaceholder, configuredDatabase, countRows, readActiveAdminId,
  readAndCompareSnapshot, readMarker, readSharedWorkspacePlaceholder, sharedWorkspaceOwner, runRemoteD1,
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
  if (!['staging', 'production'].includes(args.env)) throw new Error('Environment must be staging or production.');
  return args;
}

const args = argumentsFrom(process.argv);
const database = configuredDatabase(args.env);
if (args.confirm !== database) throw new Error('Database confirmation does not match the Wrangler staging configuration.');
const snapshot = JSON.parse(readFileSync(resolve(args.file), 'utf8'));
const legacyOwnerId = readActiveAdminId(args.env, database);
const importId = `sites-import-${createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')}`;
const importBy = `system:sites-import:${importId.slice('sites-import-'.length)}`;
const marker = readMarker(args.env, database, importId);
const counts = countRows(args.env, database);
const workspacePlaceholder = counts.learning_workspace
  ? readSharedWorkspacePlaceholder(args.env, database)
  : { total: 0, emptyShared: 0, updated: null };
const importCanKeepPlaceholder = canImportWithEmptyWorkspacePlaceholder(snapshot, counts, workspacePlaceholder);

if (marker) {
  if (marker.created_by !== importBy) throw new Error('A different import already owns this marker; no rows were changed.');
} else if (
  ['learning_lessons','learning_slots','learning_runs','runs','legacy_run_items','run_items','automation_runs','run_targets','run_events','study_time','learner_settings'].some((table) => counts[table] !== 0)
  || (counts.learning_workspace !== 0 && !importCanKeepPlaceholder)
) {
  throw new Error('The target D1 already contains learning data. Import stopped without changing rows.');
}

const importSnapshot = structuredClone(snapshot);
if (importCanKeepPlaceholder) {
  importSnapshot.tables.learning_workspace[0].owner = sharedWorkspaceOwner;
  importSnapshot.tables.learning_workspace[0].updated = workspacePlaceholder.updated;
}
const markerSql = `INSERT OR IGNORE INTO backup_events(id,created_at,created_by) VALUES('${importId}','${new Date().toISOString()}','${importBy}');`;
const safeRestoreSql = buildRestoreSql(importSnapshot,{legacyOwnerId}).replaceAll('INSERT INTO ', 'INSERT OR IGNORE INTO ');
const directory = mkdtempSync(join(tmpdir(), 'learning-hub-sites-import-'));
const sqlFile = join(directory, 'restore.sql');
try {
  writeFileSync(sqlFile, `${markerSql}\n${safeRestoreSql}`, { mode: 0o600, flag: 'wx' });
  runRemoteD1(args.env, database, ['--file', sqlFile]);
} finally {
  rmSync(directory, { recursive: true, force: true });
}

const comparison = readAndCompareSnapshot(args.env, database, importSnapshot, { legacyOwnerId });
if (comparison.some((table) => !table.ok)) {
  console.error(JSON.stringify(comparison));
  throw new Error('Import verification failed. Existing data was not overwritten; inspect staging before any retry.');
}
console.log(JSON.stringify({ environment: args.env, database, result: 'verified', tables: comparison.map(({ table, expected, actual }) => ({ table, expected, actual })) }, null, 2));
