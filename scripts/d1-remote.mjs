import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { backupColumns, columnsForSnapshotTable, restoreTargetTable } from '../lib/backup-contract.mjs';

const wrangler = 'node_modules/wrangler/bin/wrangler.js';
const authTables = ['user', 'account', 'session', 'verification', 'rate_limit'];
export const sharedWorkspaceOwner = '__shared_family_workspace__';
export const applicationTables = [...Object.keys(backupColumns), ...authTables];

function jsonPayload(output) {
  const clean = output.replace(/\u001b\[[0-9;]*m/g, '');
  for (let index = 0; index < clean.length; index += 1) {
    if (clean[index] !== '[' && clean[index] !== '{') continue;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let end = index; end < clean.length; end += 1) {
      const character = clean[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') quoted = true;
      else if (character === '{' || character === '[') depth += 1;
      else if (character === '}' || character === ']') {
        depth -= 1;
        if (depth === 0) {
          try { return JSON.parse(clean.slice(index, end + 1)); } catch { break; }
        }
      }
    }
  }
  throw new Error('Wrangler did not return parseable JSON.');
}

function rowsFrom(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const rows = rowsFrom(item);
      if (rows) return rows;
    }
  } else if (value && typeof value === 'object') {
    if (Array.isArray(value.results)) return value.results;
    for (const child of Object.values(value)) {
      const rows = rowsFrom(child);
      if (rows) return rows;
    }
  }
  return null;
}

export function parseWranglerRows(output) {
  const rows = rowsFrom(jsonPayload(output));
  if (!rows) throw new Error('Wrangler JSON did not contain query results.');
  return rows;
}

export function configuredDatabase(environment, configPath = 'wrangler.jsonc') {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const databases = config.env?.[environment]?.d1_databases;
  if (!Array.isArray(databases) || databases.length !== 1 || !databases[0].database_name) {
    throw new Error(`Expected one D1 database configured for ${environment}.`);
  }
  return databases[0].database_name;
}

export function runRemoteD1(environment, database, flags) {
  const result = spawnSync(process.execPath, [wrangler, 'd1', 'execute', database,
    '--env', environment, '--remote', '--yes', '--json', ...flags, '--config', 'wrangler.jsonc'], {
    encoding: 'utf8',
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' },
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Wrangler D1 operation failed${result.status === null ? '' : ` (exit ${result.status})`}. Check Cloudflare access and the staging migration state.`);
  }
  return result.stdout;
}

export function countSql() {
  return `SELECT ${applicationTables.map((table) => `(SELECT COUNT(*) FROM "${table}") AS "${table}"`).join(', ')}`;
}

export function countRows(environment, database) {
  const rows = parseWranglerRows(runRemoteD1(environment, database, ['--command', countSql()]));
  if (rows.length !== 1) throw new Error('D1 count query returned an unexpected result.');
  return Object.fromEntries(applicationTables.map((table) => [table, Number(rows[0][table] ?? 0)]));
}

export function readActiveAdminId(environment, database) {
  const rows = parseWranglerRows(runRemoteD1(environment, database, [
    '--command', `SELECT id FROM "user" WHERE role = 'admin' AND status = 'active' AND email_verified = 1 ORDER BY created_at, id LIMIT 2`,
  ]));
  if (rows.length !== 1 || typeof rows[0].id !== 'string' || !rows[0].id) {
    throw new Error('Import requires exactly one active, verified admin account in the target D1. No data was changed.');
  }
  return rows[0].id;
}

/** Read only metadata to recognize the empty row created by the first authenticated workspace GET. */
export function readSharedWorkspacePlaceholder(environment, database) {
  const rows = parseWranglerRows(runRemoteD1(environment, database, [
    '--command', `SELECT COUNT(*) AS total,
      SUM(CASE WHEN owner = '${sharedWorkspaceOwner}' AND payload = 'null' AND revision = 0 THEN 1 ELSE 0 END) AS empty_shared,
      MAX(CASE WHEN owner = '${sharedWorkspaceOwner}' THEN updated END) AS updated
      FROM learning_workspace`,
  ]));
  if (rows.length !== 1) throw new Error('D1 workspace metadata query returned an unexpected result.');
  return {
    total: Number(rows[0].total ?? 0),
    emptyShared: Number(rows[0].empty_shared ?? 0),
    updated: typeof rows[0].updated === 'string' ? rows[0].updated : null,
  };
}

export function canImportWithEmptyWorkspacePlaceholder(snapshot, counts, placeholder) {
  const workspace = snapshot.tables?.learning_workspace;
  const snapshotIsEmpty = Array.isArray(workspace) && workspace.length === 1
    && workspace[0]?.payload === 'null' && Number(workspace[0]?.revision) === 0;
  const otherLearningTables = [
    'learning_lessons', 'learning_slots', 'learning_runs', 'runs', 'legacy_run_items',
    'run_items', 'automation_runs', 'run_targets', 'run_events', 'study_time', 'learner_settings',
  ];
  return snapshotIsEmpty && placeholder.total === 1 && placeholder.emptyShared === 1
    && typeof placeholder.updated === 'string' && counts.learning_workspace === 1
    && otherLearningTables.every((table) => Number(counts[table] ?? 0) === 0);
}

export function readRemoteTable(environment, database, table) {
  if (!Object.hasOwn(backupColumns, table)) throw new Error('Unsupported import table.');
  return parseWranglerRows(runRemoteD1(environment, database, ['--command', `SELECT * FROM "${table}" ORDER BY rowid`]));
}

function canonicalRow(columns, table, row, legacyOwnerId) {
  return JSON.stringify(columns.map((column) => {
    if (column === 'user_id' && !Object.hasOwn(row, column) && ['learning_lessons', 'learning_slots'].includes(table)) return legacyOwnerId;
    return row[column] ?? null;
  }));
}

export function compareSnapshotTables(snapshot, actualByTable, { legacyOwnerId } = {}) {
  const results = [];
  for (const [table, expectedRows] of Object.entries(snapshot.tables)) {
    const targetTable = restoreTargetTable(snapshot, table);
    const columns = columnsForSnapshotTable(snapshot, table);
    if (!columns || !Array.isArray(expectedRows)) {
      results.push({ table, ok: false, reason: 'invalid snapshot table' });
      continue;
    }
    const expected = new Map();
    const actual = new Map();
    for (const row of expectedRows) {
      const key = canonicalRow(columns, targetTable, row, legacyOwnerId);
      expected.set(key, (expected.get(key) ?? 0) + 1);
    }
    for (const row of actualByTable[targetTable] ?? []) {
      const key = canonicalRow(columns, targetTable, row, legacyOwnerId);
      actual.set(key, (actual.get(key) ?? 0) + 1);
    }
    const matches = [...expected].every(([key, count]) => actual.get(key) === count)
      && [...actual].every(([key, count]) => expected.get(key) === count);
    results.push({ table, ok: matches, expected: expectedRows.length, actual: (actualByTable[targetTable] ?? []).length });
  }
  return results;
}

export function readAndCompareSnapshot(environment, database, snapshot, options) {
  const targetTables = [...new Set(Object.keys(snapshot.tables).map((table) => restoreTargetTable(snapshot, table)))];
  const actual = Object.fromEntries(targetTables.map((table) => [table, readRemoteTable(environment, database, table)]));
  return compareSnapshotTables(snapshot, actual, options);
}

export function readMarker(environment, database, importId) {
  const rows = parseWranglerRows(runRemoteD1(environment, database, [
    '--command', `SELECT id, created_by FROM backup_events WHERE id = '${importId}' LIMIT 1`,
  ]));
  return rows[0] ?? null;
}
