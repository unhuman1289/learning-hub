import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from './d1-adapter.mjs';
import { enqueue } from '../lib/ai-jobs/queue.ts';
import { leaseJobs, runnerStatus } from '../lib/ai-jobs/lease.ts';
import { runnerOfflineAlert } from '../lib/alerts.ts';
const now = new Date('2026-11-12T09:00:00Z'),
  learner = 'profile-a';
const home = {
  id: 'home-runner',
  keySha256: '0'.repeat(64),
  accessClientId: 'home-access-client',
  scopes: ['jobs:assess', 'jobs:plan', 'attachments:read'],
  purposes: ['submission', 'recheck', 'request', 'initial'],
  triggers: ['on_demand', 'deferred'],
  learnerIds: [learner],
};
const runner = { name: 'home-runner', version: '1', model: 'qwen' };
function seed() {
  const db = memoryDb();
  db.sqlite
    .prepare(
      "INSERT INTO user(id,name,email,email_verified,created_at,updated_at,role,status) VALUES(?,'A','a@example.test',1,1,1,'learner','active')",
    )
    .run(learner);
  db.sqlite
    .prepare("INSERT INTO learner_settings(user_id,daily_target_minutes,updated,role,display_name,preferences) VALUES(?,60,'t','adult','A','{}')")
    .run(learner);
  return db;
}
const assess = (db, refId) => enqueue(db, {}, { learnerId: learner, kind: 'assess', purpose: 'submission', refId }, now);

test('jobs with photos go only to a runner that declares it reads images', async () => {
  const db = seed();
  const photo = await assess(db, 'subm-photo');
  db.sqlite.prepare('UPDATE ai_jobs SET needs_vision=1 WHERE id=?').run(photo.id);
  // A runner without vision never selects the job; with vision it does (the context build then needs a real submission).
  assert.deepEqual(await leaseJobs(db, home, { kinds: ['assess'], max: 5, runner }, 'test', now), []);
  assert.equal(db.sqlite.prepare('SELECT lease_count FROM ai_jobs WHERE id=?').get(photo.id).lease_count, 0);
  await assert.rejects(leaseJobs(db, home, { kinds: ['assess'], max: 1, runner, capabilities: ['vision'] }, 'test', now));
  assert.equal(db.sqlite.prepare('SELECT lease_count FROM ai_jobs WHERE id=?').get(photo.id).lease_count, 1);
  db.sqlite.close();
});

test('a runner without attachment scope cannot claim vision work by declaring it', async () => {
  const db = seed();
  const photo = await assess(db, 'subm-photo');
  db.sqlite.prepare('UPDATE ai_jobs SET needs_vision=1 WHERE id=?').run(photo.id);
  const noImages = { ...home, scopes: ['jobs:assess'] };
  assert.deepEqual(await leaseJobs(db, noImages, { kinds: ['assess'], max: 1, runner, capabilities: ['vision'] }, 'test', now), []);
  db.sqlite.close();
});

test('enqueue marks submissions whose answers carry photos', async () => {
  const db = seed();
  db.sqlite.exec('PRAGMA foreign_keys=OFF');
  db.sqlite
    .prepare(
      "INSERT INTO attempts(id,submission_id,learner_id,lesson_id,item_id,subject_id,skill_ids,activity,attempt_no,answer,attachment_ids,support,context,status,day,created_at) VALUES('att_1','subm-photo',?,'les_x','i1','sub_x','[]','create',1,'x','[\"img_1\"]','none','lesson','pending','2026-11-12','t')",
    )
    .run(learner);
  const job = await assess(db, 'subm-photo');
  assert.equal(db.sqlite.prepare('SELECT needs_vision FROM ai_jobs WHERE id=?').get(job.id).needs_vision, 1);
  db.sqlite.close();
});

test('presence is written at most once a minute and drives the online state', async () => {
  const db = seed();
  assert.deepEqual(await runnerStatus(db, 'home-runner', now), { online: false, lastSeenAt: null });
  await leaseJobs(db, home, { kinds: ['assess'], max: 1, runner }, 'test', now);
  await leaseJobs(db, home, { kinds: ['assess'], max: 1, runner }, 'test', new Date(now.getTime() + 15000));
  assert.equal((await runnerStatus(db, 'home-runner', now)).lastSeenAt, now.toISOString());
  await leaseJobs(db, home, { kinds: ['assess'], max: 1, runner }, 'test', new Date(now.getTime() + 61000));
  assert.equal((await runnerStatus(db, 'home-runner', now)).lastSeenAt, new Date(now.getTime() + 61000).toISOString());
  assert.equal((await runnerStatus(db, 'home-runner', new Date(now.getTime() + 61000 + 2 * 60000))).online, true);
  assert.equal((await runnerStatus(db, 'home-runner', new Date(now.getTime() + 61000 + 4 * 60000))).online, false);
  db.sqlite.close();
});

test('offline alert appears only with waiting work and a runner away 30 minutes', async () => {
  const db = seed();
  assert.equal(await runnerOfflineAlert(db, {}, now), null);
  await assess(db, 'subm-1');
  assert.equal((await runnerOfflineAlert(db, {}, now)).code, 'runner-offline');
  db.sqlite
    .prepare("INSERT INTO runner_presence(client_id,runner,capabilities,last_seen_at) VALUES('home-runner','{}','[]',?)")
    .run(new Date(now.getTime() - 10 * 60000).toISOString());
  assert.equal(await runnerOfflineAlert(db, {}, now), null);
  const later = new Date(now.getTime() + 40 * 60000);
  assert.match((await runnerOfflineAlert(db, {}, later)).message, /Máy chấm đang tắt từ .*1 việc đang chờ/);
  db.sqlite.close();
});

test('local grading keeps 60 on-demand submissions a day by default', async () => {
  const db = seed();
  for (let n = 0; n < 60; n++) assert.equal((await assess(db, 'subm-' + n)).trigger, 'on_demand');
  assert.equal((await assess(db, 'subm-60')).trigger, 'deferred');
  db.sqlite.close();
});
