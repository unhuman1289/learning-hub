import { backupColumns } from './backup-contract.mjs';
import type { JournalDb } from './run-journal.ts';

export type LearningBackup = {
  format: 3;
  deploymentId: string;
  exportedAt: string;
  backupId: string;
  tables: Record<string, Record<string, unknown>[]>;
};

const tableNames = Object.keys(backupColumns);
const backupPrefix = (environment: string) => `learning-hub/${environment}/backups/`;

async function readConsistentSnapshot(
  db: JournalDb,
  deploymentId: string,
  now: Date,
  backupId = crypto.randomUUID(),
): Promise<LearningBackup> {
  const results = await db.batch(
    tableNames.map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`)),
  ) as { results?: Record<string, unknown>[] }[];

  if (results.length !== tableNames.length || tableNames.some((_, index) => !Array.isArray(results[index]?.results))) {
    throw new Error('Incomplete backup query results');
  }

  return {
    format: 3,
    deploymentId,
    exportedAt: now.toISOString(),
    backupId,
    tables: Object.fromEntries(tableNames.map((table, index) => [table, results[index].results!])),
  };
}

/** Admin download; preserves the existing one-batch audit record behavior. */
export async function createBackup(
  db: JournalDb,
  userId: string,
  now = new Date(),
  deploymentId = 'learning-hub',
): Promise<LearningBackup> {
  const backupId = crypto.randomUUID();
  const createdAt = now.toISOString();
  const results = await db.batch([
    db.prepare('INSERT INTO backup_events(id,created_at,created_by) VALUES(?,?,?)').bind(backupId, createdAt, userId),
    ...tableNames.map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`)),
  ]) as { results?: Record<string, unknown>[] }[];

  if (results.length !== tableNames.length + 1 || tableNames.some((_, index) => !Array.isArray(results[index + 1]?.results))) {
    throw new Error('Incomplete backup query results');
  }

  return {
    format: 3,
    deploymentId,
    exportedAt: createdAt,
    backupId,
    tables: Object.fromEntries(tableNames.map((table, index) => [table, results[index + 1].results!])),
  };
}

async function pruneBackups(bucket: R2Bucket, prefix: string, keep = 30): Promise<number> {
  const objects: { key: string }[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    objects.push(...page.objects.map(({ key }) => ({ key })));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  const obsolete = objects
    .sort((left, right) => right.key.localeCompare(left.key))
    .slice(keep)
    .map(({ key }) => key);
  if (obsolete.length) await bucket.delete(obsolete);
  return obsolete.length;
}

export async function getLatestStoredBackup(bucket: R2Bucket, environment: string) {
  const prefix = backupPrefix(environment);
  const objects: { key: string; uploaded?: Date }[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    objects.push(...page.objects.map(({ key, uploaded }) => ({ key, uploaded })));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  const latest = objects.sort((left, right) => right.key.localeCompare(left.key))[0];
  if (!latest) return null;
  const object = await bucket.get(latest.key);
  if (!object) return null;
  return { key: latest.key, uploadedAt: latest.uploaded?.toISOString() ?? null, object };
}

/** Write a verified D1 snapshot to R2, then record success in D1. */
export async function createStoredBackup(
  db: JournalDb,
  bucket: R2Bucket,
  options: {
    environment: string;
    createdBy: string;
    deploymentId?: string;
    now?: Date;
    backupId?: string;
  },
) {
  const now = options.now ?? new Date();
  const backupId = options.backupId ?? crypto.randomUUID();
  const prefix = backupPrefix(options.environment);
  const key = `${prefix}${now.toISOString().replaceAll(':', '-')}-${backupId}.json`;
  const snapshot = await readConsistentSnapshot(db, options.deploymentId ?? 'learning-hub', now, backupId);

  await bucket.put(key, JSON.stringify(snapshot), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
    customMetadata: { environment: options.environment, backupId },
  });
  await db.prepare('INSERT OR IGNORE INTO backup_events(id,created_at,created_by) VALUES(?,?,?)')
    .bind(backupId, snapshot.exportedAt, options.createdBy).run();

  let retentionWarning = false;
  try {
    await pruneBackups(bucket, prefix);
  } catch {
    retentionWarning = true;
  }

  return { backupId, createdAt: snapshot.exportedAt, key, retentionWarning };
}

export async function readBackupStatus(db: JournalDb, now = new Date()) {
  const row = await db.prepare("SELECT created_at FROM backup_events WHERE created_by NOT LIKE 'system:sites-import:%' ORDER BY created_at DESC LIMIT 1").first<{ created_at: string }>();
  return { lastCreatedAt: row?.created_at ?? null, due: !row || now.getTime() - Date.parse(row.created_at) > 7 * 86400000 };
}
