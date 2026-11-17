import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { listFamily, setTutorEnabled } from '../lib/admin/family.ts';
import { backupColumns, buildRestoreSql } from '../lib/backup-contract.mjs';
import { lessonSummary } from '../lib/lesson-v2/summary.ts';
import { insertLessonV2 } from '../lib/lesson-v2/store.ts';
import { getTutor, postTutor } from '../lib/tutor/http.ts';
import { fakeTutorRelay } from '../lib/tutor/relay.ts';
import { memoryDb } from './d1-adapter.mjs';

const origin = 'http://localhost';
const learner = { id: 'child', name: 'Private Name', email: 'private@example.test' };
const guardian = { id: 'guardian' };
const admin = { id: 'admin', role: 'admin' };
const stranger = { id: 'stranger' };
const subjectId = 'sub_aaaaaaaaaaaaaaaaaaaa';
const fixture = JSON.parse(readFileSync(new URL('../fixtures/contracts/lesson-v2/deutsch-modalverb.json', import.meta.url)));

async function setup(t) {
  const db = memoryDb();
  t.after(() => db.sqlite.close());
  db.sqlite.prepare(`INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at,role,status)
    VALUES(?,?,?,1,1,1,'learner','active')`).run(learner.id, learner.name, learner.email);
  db.sqlite.exec(`INSERT INTO learner_settings(user_id,updated,role,display_name) VALUES('child','t','child','Ếch');
    INSERT INTO guardians(guardian_id,learner_id,created_by,created_at) VALUES('guardian','child','admin','t');`);
  db.sqlite.prepare(`INSERT INTO subjects(id,learner_id,title,template,status,created_by,created_at,updated_at)
    VALUES(?,?,'Deutsch','skill','active',?,'t','t')`).run(subjectId, learner.id, learner.id);

  const lesson = day => insertLessonV2(db, { learnerId: learner.id, subjectId, day, lesson: fixture });
  const lessonId = await lesson('2026-11-15');
  const ask = ({ user = learner, query = '', referer = origin, relay = fakeTutorRelay, ...data } = {}) =>
    postTutor(new Request(origin + '/api/tutor' + query, {
      method: 'POST', headers: { Origin: referer }, body: JSON.stringify({ lessonId, itemId: 'i1', question: 'Em nên bắt đầu thế nào?', ...data }),
    }), user, () => db, 'local-runner', relay);
  const history = (viewer = learner, query = '', id = lessonId) =>
    getTutor(new Request(origin + '/api/lessons/' + id + '/tutor' + query), viewer, () => db, id);
  const online = () => db.sqlite.prepare("INSERT INTO runner_presence(client_id,runner,last_seen_at) VALUES('local-runner','{}',?)")
    .run(new Date().toISOString());
  return { db, ask, history, lessonId, lesson, online };
}

test('only the learner can ask about a valid item in an unfinished lesson', async t => {
  const { db, ask, history, lessonId } = await setup(t);
  assert.equal((await ask({ user: null })).status, 401);
  assert.equal((await history(null)).status, 401);
  assert.equal((await ask({ referer: 'https://elsewhere.test' })).status, 403);
  for (const user of [stranger, guardian, admin]) {
    assert.equal((await ask({ user, query: '?learner=child' })).status, 404);
    assert.equal((await ask({ user })).status, 404);
  }
  assert.equal((await ask({ itemId: 'i99' })).status, 404);
  db.sqlite.prepare("UPDATE learning_lessons SET completed_at='t' WHERE id=?").run(lessonId);
  assert.equal((await ask()).status, 409);
  assert.deepEqual(await (await history()).json(), { turns: [] });
});

test('runner offline queues one turn per learner across lessons and creates no exploration', async t => {
  const { db, ask, history, lesson } = await setup(t);
  const otherLesson = await lesson('2026-11-16');
  const relay = () => assert.fail('offline relay must not be called');
  const responses = await Promise.all([ask({ relay }), ask({ lessonId: otherLesson, relay })]);
  assert.deepEqual(responses.map(result => result.status).sort(), [202, 409]);
  const queued = await responses.find(result => result.status === 202).json();
  assert.equal(queued.status, 'queued');
  assert.equal(queued.message, 'Gia sư đang nghỉ, câu hỏi sẽ được trả lời khi máy bật');
  const saved = db.sqlite.prepare('SELECT id,lesson_id FROM tutor_turns').get();
  assert.equal(saved.id, queued.id);
  assert.equal((await (await history(learner, '', saved.lesson_id)).json()).turns[0].status, 'queued');
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM learner_requests').get().n, 0);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM learning_lessons').get().n, 2);
});

test('question and answer limits count characters and the 21st turn is rejected', async t => {
  const { db, ask, history, online } = await setup(t);
  online();
  for (const question of [' '.repeat(500), 'a'.repeat(501), '🙂'.repeat(501), 'a\0b']) {
    assert.equal((await ask({ question })).status, 400);
  }
  const tooLong = await ask({ relay: async () => 'x'.repeat(2001) });
  assert.match(await tooLong.text(), /event: error/);
  const exact = await ask({ question: '🙂'.repeat(500), relay: async () => 'x'.repeat(2000) });
  assert.match(await exact.text(), /event: done/);
  for (let index = 2; index < 20; index++) {
    assert.match(await (await ask()).text(), /event: done/);
  }
  assert.equal((await ask()).status, 409);
  const { turns } = await (await history()).json();
  assert.equal(turns.length, 20);
  assert.equal(turns[0].status, 'failed');
  assert.equal(turns[0].answer, null);
  assert.equal(turns[1].answer.length, 2000);
  assert.throws(() => db.sqlite.prepare('UPDATE tutor_turns SET answer=?').run('x'.repeat(2001)), /CHECK/);
});

test('child relay receives a nickname and exercise text with contacts removed; guardians can read the saved SSE turn', async t => {
  const { db, ask, history, online, lessonId } = await setup(t);
  online();
  let received;
  let resolveAnswer;
  const answer = new Promise(resolve => { resolveAnswer = resolve; });
  const response = await ask({
    question: 'Gợi ý câu này? Liên hệ test@example.test hoặc +49 451 1234567.',
    relay: async input => { received = input; return answer; },
  });
  assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  assert.match(decoder.decode((await reader.read()).value), /event: turn/);
  assert.deepEqual(received, {
    nickname: 'Ếch', prompt: fixture.items[0].prompt,
    question: 'Gợi ý câu này? Liên hệ [email redacted] hoặc [phone redacted].',
  });
  assert.equal((await ask()).status, 409);
  resolveAnswer('Em thử tìm động từ chính.');
  assert.match(decoder.decode((await reader.read()).value), /event: delta/);
  assert.match(decoder.decode((await reader.read()).value), /event: done/);
  assert.equal((await reader.read()).done, true);
  assert.equal((await history(stranger, '?learner=child')).status, 404);
  assert.equal((await history(guardian)).status, 404);
  const { turns } = await (await history(guardian, '?learner=child')).json();
  assert.equal(turns[0].status, 'answered');
  assert.equal(turns[0].question, received.question);
  assert.equal(turns[0].answer, 'Em thử tìm động từ chính.');
  assert.ok(turns[0].first_token_ms >= 0 && turns[0].answered_at);
  assert.deepEqual((await lessonSummary(db, learner.id, lessonId)).tutorTurns.map(turn => ({ ...turn })), turns);
});

test('the admin profile flag defaults on, can be disabled, and keeps the nickname when re-enabled', async t => {
  const { db, ask, history } = await setup(t);
  assert.equal((await listFamily(db))[0].tutorEnabled, true);
  await assert.rejects(setTutorEnabled(db, learner.id, 'false'), { status: 400 });
  await setTutorEnabled(db, learner.id, false);
  assert.equal((await listFamily(db))[0].tutorEnabled, false);
  assert.equal((await ask()).status, 403);
  assert.equal((await history(guardian, '?learner=child')).status, 200);
  await setTutorEnabled(db, learner.id, true);
  assert.equal((await listFamily(db))[0].displayName, 'Ếch');
  assert.equal((await ask()).status, 202);
});

test('0032 restores tutor turns and applies the enabled default to a pre-0032 backup', async t => {
  const { db, ask } = await setup(t);
  assert.equal((await ask()).status, 202);
  await setTutorEnabled(db, learner.id, false);
  const snapshot = { format: 4, tables: Object.fromEntries(Object.keys(backupColumns).map(table => [
    table, db.sqlite.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(table)
      ? db.sqlite.prepare(`SELECT * FROM "${table}"`).all() : [],
  ])) };
  const restore = previous => {
    const target = memoryDb();
    t.after(() => target.sqlite.close());
    target.sqlite.exec(buildRestoreSql(previous));
    assert.deepEqual(target.sqlite.prepare('PRAGMA foreign_key_check').all(), []);
    return target.sqlite;
  };
  const current = restore(snapshot);
  assert.deepEqual(current.prepare('SELECT * FROM tutor_turns').all(), snapshot.tables.tutor_turns);
  assert.equal(current.prepare('SELECT tutor_enabled FROM learner_settings').get().tutor_enabled, 0);
  delete snapshot.tables.tutor_turns;
  for (const row of snapshot.tables.learner_settings) delete row.tutor_enabled;
  const older = restore(snapshot);
  assert.equal(older.prepare('SELECT tutor_enabled FROM learner_settings').get().tutor_enabled, 1);
  assert.deepEqual(older.prepare('SELECT * FROM tutor_turns').all(), []);
});

test('onTutorTurn records hint1 before submission, including items without hints', async t => {
  const { db, ask, lessonId } = await setup(t);
  db.sqlite.prepare("UPDATE lesson_items SET payload=json_set(payload, '$.hints', json('[]')) WHERE lesson_id=? AND item_id='i1'").run(lessonId);
  assert.equal((await ask()).status, 202);
  assert.equal(db.sqlite.prepare("SELECT json_extract(support,'$.i1') AS level FROM learning_lessons WHERE id=?").get(lessonId).level, 'hint1');
});
