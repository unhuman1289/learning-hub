import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { householdLogin } from './staging-household.mjs';
import { memoryDb } from '../tests/d1-adapter.mjs';
import { insertLessonV2 } from '../lib/lesson-v2/store.ts';

if (!process.argv.includes('--execute-staging')) throw Error('Pass --execute-staging to create a synthetic QA notebook.');
// A1 must provide a bounded, per-notebook opt-in before this can safely call real models.
throw Error('Real OpenAI smoke is paused until A1 provides bounded calls and per-notebook opt-in.');
const origin = 'https://learning-hub-staging.tranvu-812.workers.dev';
const nonce = randomBytes(10).toString('hex');
const owner = 'prf_' + nonce, subject = 'sub_' + nonce, lessonId = 'les_' + nonce;
const directory = mkdtempSync(join(tmpdir(), 'hub-openai-smoke-'));
const sqlite = memoryDb();
const stamp = Date.now();
const time = new Date(stamp).toISOString();
const quote = value => value === null ? 'NULL' : typeof value === 'number' ? String(value) : "'" + String(value).replaceAll("'", "''") + "'";
function wrangler(args, input) {
  const result = spawnSync(process.execPath, ['--import', './scripts/wrangler-env.mjs',
    './node_modules/wrangler/bin/wrangler.js', ...args], { encoding: 'utf8', input });
  writeFileSync(join(directory, 'wrangler.log'), (result.stdout ?? '') + (result.stderr ?? ''), { mode: 0o600 });
  if (result.status !== 0) throw Error('Wrangler failed; see private diagnostic in ' + directory);
  return result.stdout;
}
function remote(sql) {
  const file = join(directory, 'action.sql');
  writeFileSync(file, sql, { mode: 0o600 });
  return wrangler(['d1', 'execute', 'DB', '--config', 'wrangler.jsonc', '--env', 'staging', '--remote', '--file', file, '--json']);
}
let seeded = false;
try {
  const health = await fetch(origin + '/api/health').then(response => response.json());
  assert.equal(health.environment, 'staging');
  assert.equal(health.d1, 'connected');
  assert.equal(health.commit, process.env.EXPECTED_STAGING_COMMIT, 'expected new staging commit');

  sqlite.sqlite.prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at,role,status) VALUES(?,'QA OpenAI',?,1,?,?,'learner','active')")
    .run(owner, 'profile+' + owner + '@local.invalid', stamp, stamp);
  sqlite.sqlite.prepare("INSERT INTO learner_settings(user_id,daily_target_minutes,updated,role,display_name,preferences) VALUES(?,60,?,'adult','QA','{}')")
    .run(owner, time);
  sqlite.sqlite.prepare("INSERT INTO subjects(id,learner_id,title,template,status,created_by,created_at,updated_at) VALUES(?,?,'QA Deutsch','skill','active',?,?,?)")
    .run(subject, owner, owner, time, time);

  const skill = 'sk_' + nonce;
  sqlite.sqlite.prepare("INSERT INTO skills(id,subject_id,learner_id,key,name,status,origin,created_at,updated_at) VALUES(?,?,?,'modalverb','Modalverben','active','user',?,?)")
    .run(skill, subject, owner, time, time);
  const fixture = JSON.parse(readFileSync('fixtures/lessons/deutsch-modalverb.json', 'utf8'));
  const items = fixture.items.map(item => ({
    id: item.id, activity: item.activity, input: 'short', skills: [skill], difficulty: item.difficulty,
    prompt: 'Ergänze das Verb: Ich möchte morgen einen Kuchen ___.',
    rubric: [{ criterion: 'Verwende den passenden Infinitiv.', points: 1 }, { criterion: 'Schreibe das Verb korrekt.', points: 1 }],
    attachment: 'none', hints: ['Das Verb steht im Infinitiv.'], solution: 'kaufen',
  }));
  await insertLessonV2(sqlite, { id: lessonId, learnerId: owner, subjectId: subject, day: time.slice(0, 10),
    lesson: { ...fixture, contract: 'lesson-package/3', gradingMode: 'whole-lesson', knowledge: [], targetSkills: [skill], reasonRefs: [], items } });

  let seed = '';
  for (const table of ['user', 'learner_settings', 'subjects', 'skills', 'learning_lessons', 'lesson_items']) {
    for (const row of sqlite.sqlite.prepare('SELECT * FROM ' + table).all())
      seed += 'INSERT INTO ' + table + ' (' + Object.keys(row).join(',') + ') VALUES (' + Object.values(row).map(quote).join(',') + ');\n';
  }
  remote(seed);
  seeded = true;
  const cookie = await householdLogin(origin, owner);
  const request = async (path, body) => {
    const response = await fetch(origin + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { cookie, origin, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.ok(response.ok, path + ' returned ' + response.status);
    return response.json();
  };
  const path = '/api/lessons/' + lessonId;
  const saved = (await request(path)).lesson;
  assert.equal(saved.wholeLesson, true);
  await request(path + '/items/' + items[0].id + '/reveal', { level: 'solution' });
  await request(path + '/items/' + items[1].id + '/reveal', { level: 'hint1' });
  const body = { clientSubmissionId: crypto.randomUUID(), draftRevision: saved.draftRevision,
    answers: Object.fromEntries(items.slice(1).map(item => [item.id, { answer: 'kaufen' }])) };
  const first = await request(path + '/submissions', body);
  assert.equal((await request(path + '/submissions', body)).submission.id, first.submission.id);
  const asked = await request('/api/requests', {
    mode: 'personal', clientRequestId: crypto.randomUUID(), subjectId: subject,
    note: 'Giúp tôi luyện cách dùng động từ khuyết thiếu tiếng Đức trong tình huống ở hiệu sách.',
  });
  let submission;
  for (let count = 0; count < 36; count++) {
    submission = (await request('/api/submissions/' + first.submission.id)).submission;
    if (submission?.status === 'graded') break;
    if (count % 3 === 2) {
      const diagnostics = remote("SELECT kind,status,lease_count,validation_failures,error FROM ai_jobs WHERE learner_id=" + quote(owner) + ';');
      if (/"kind":\s*"assess"[^}]*"status":\s*"failed"/s.test(diagnostics)) throw Error('Staging Luna job failed. ' + (diagnostics.match(/OpenAI HTTP \d{3}(?: \([a-z_]+\))?/)?.[0] ?? ''));
    }
    await delay(5000);
  }
  assert.equal(submission?.status, 'graded', 'Luna saved the whole submission');
  assert.equal(submission.attempts.find(attempt => attempt.item_id === items[0].id)?.score, 0);
  assert.equal(submission.attempts.find(attempt => attempt.item_id === items[1].id)?.support, 'hint1');
  console.log('Luna: staged and read back ' + first.submission.id + ' with ' + submission.attempts.length + ' attempts.');
  let planned;
  for (let count = 0; count < 36; count++) {
    planned = (await request('/api/requests?id=' + asked.request.id)).request;
    if (planned?.resultLessonId || planned?.jobStatus === 'failed') break;
    await delay(5000);
  }
  assert.ok(planned?.resultLessonId, 'Terra saved a lesson');
  const produced = (await request('/api/lessons/' + planned.resultLessonId)).lesson;
  assert.equal(produced.wholeLesson, true);
  assert.ok(produced.items.every(item => ['short', 'long', 'code'].includes(item.input)));
  console.log('Terra: staged and read back ' + planned.resultLessonId + ' with whole-lesson grading.');

} finally {
  if (seeded) {
    remote("UPDATE subjects SET ai_enabled=0,status='archived' WHERE id=" + quote(subject) +
      "; UPDATE user SET status='blocked' WHERE id=" + quote(owner) +
      '; UPDATE session SET expires_at=0 WHERE user_id=' + quote(owner) + ';');
  }
  sqlite.sqlite.close();
}
