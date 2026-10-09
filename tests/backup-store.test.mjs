import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from './d1-adapter.mjs';
import { createStoredBackup, getLatestStoredBackup, readBackupStatus } from '../lib/backup-store.ts';

function memoryBucket() {
  const objects = new Map();
  return {
    objects,
    async put(key, value, options) {
      objects.set(key, { value: String(value), options, uploaded: new Date() });
    },
    async get(key) {
      const entry = objects.get(key);
      return entry ? { body: new Response(entry.value).body, httpMetadata: entry.options?.httpMetadata } : null;
    },
    async list({ prefix, cursor, limit = 1000 }) {
      const keys = [...objects.keys()].filter((key) => key.startsWith(prefix)).sort();
      const start = cursor ? keys.indexOf(cursor) + 1 : 0;
      const page = keys.slice(start, start + limit);
      return { objects: page.map((key) => ({ key })), truncated: start + limit < keys.length, cursor: page.at(-1) };
    },
    async delete(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key);
    },
  };
}

test('R2 backup stores one D1 snapshot and records completion only after object write', async () => {
  const db = memoryDb();
  const bucket = memoryBucket();
  const now = new Date('2026-10-09T01:00:00.000Z');
  const stored = await createStoredBackup(db, bucket, {
    environment: 'staging', createdBy: 'admin-1', now, backupId: 'daily-2026-10-09',
  });

  assert.equal(stored.retentionWarning, false);
  const object = bucket.objects.get(stored.key);
  const backup = JSON.parse(object.value);
  assert.equal(backup.deploymentId, 'learning-hub');
  assert.equal(backup.backupId, 'daily-2026-10-09');
  assert.equal(backup.tables.learning_lessons.length, 0);
  assert.match(stored.key, /^learning-hub\/staging\/backups\//);
  assert.equal(db.sqlite.prepare('SELECT created_by FROM backup_events WHERE id=?').get(stored.backupId).created_by, 'admin-1');
  assert.equal(object.options.httpMetadata.contentType, 'application/json; charset=utf-8');
  db.sqlite.close();
});

test('failed R2 put does not mark a backup successful in D1', async () => {
  const db = memoryDb();
  const bucket = memoryBucket();
  bucket.put = async () => { throw new Error('simulated R2 failure'); };
  await assert.rejects(createStoredBackup(db, bucket, { environment: 'staging', createdBy: 'admin-1' }));
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM backup_events').get().n, 0);
  db.sqlite.close();
});

test('import marker is not reported as a backup and admin can retrieve the newest R2 object', async () => {
  const db = memoryDb();
  const bucket = memoryBucket();
  db.sqlite.prepare('INSERT INTO backup_events(id,created_at,created_by) VALUES(?,?,?)')
    .run('sites-import-test', '2026-10-09T01:00:00.000Z', 'system:sites-import:test');
  assert.equal((await readBackupStatus(db, new Date('2026-10-09T02:00:00.000Z'))).due, true);

  const stored = await createStoredBackup(db, bucket, { environment: 'staging', createdBy: 'admin-1', now: new Date('2026-10-09T02:00:00.000Z') });
  const status = await readBackupStatus(db, new Date('2026-10-09T02:05:00.000Z'));
  assert.equal(status.due, false);
  const latest = await getLatestStoredBackup(bucket, 'staging');
  assert.equal(latest.key, stored.key);
  assert.ok(latest.object.body);
  db.sqlite.close();
});

test('R2 retention keeps the newest 30 app backups and leaves unrelated objects alone', async () => {
  const db = memoryDb();
  const bucket = memoryBucket();
  const prefix = 'learning-hub/staging/backups/';
  for (let day = 1; day <= 32; day += 1) {
    const date = new Date(Date.UTC(2026, 0, day)).toISOString().replaceAll(':', '-');
    bucket.objects.set(`${prefix}${date}-backup-${day}.json`, { value: '{}' });
  }
  bucket.objects.set('someone-elses-object.json', { value: '{}' });

  const result = await createStoredBackup(db, bucket, {
    environment: 'staging', createdBy: 'admin-1', now: new Date('2026-02-03T00:00:00.000Z'), backupId: 'newest',
  });
  const appBackups = [...bucket.objects.keys()].filter((key) => key.startsWith(prefix));
  assert.equal(appBackups.length, 30);
  assert.equal(bucket.objects.has('someone-elses-object.json'), true);
  assert.equal(bucket.objects.has(`${prefix}2026-01-01T00-00-00.000Z-backup-1.json`), false);
  assert.equal(result.retentionWarning, false);
  db.sqlite.close();
});
