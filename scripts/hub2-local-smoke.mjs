import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const origin = new URL(process.argv[2] ?? 'http://127.0.0.1:8871').origin;
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname)) throw Error('Local demo only. Run seed:hub2 first.');
async function login(email) {
  const response = await fetch(origin + '/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin },
    body: JSON.stringify({ email, password: 'Demo-local-study-2026!' }),
  });
  assert.equal(response.status, 200);
  return response.headers
    .getSetCookie()
    .map((s) => s.split(';')[0])
    .join('; ');
}
const own = await login('demo-ech@example.test'),
  other = await login('demo-adult@example.test'),
  admin = await login('demo-admin@example.test');
const id = 'les_00000000000000000005';
async function call(path, method = 'GET', body, cookie = own, requestOrigin = origin) {
  const r = await fetch(origin + path, {
    method,
    headers: { cookie, origin: requestOrigin, 'Content-Type': 'application/json', connection: 'close' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: r.status, body: await r.json() };
}
assert.equal((await call('/api/lessons/' + id, 'GET', undefined, other)).status, 404);
assert.equal((await call('/api/lessons/' + id + '/draft', 'PUT', {}, own, 'https://other.invalid')).status, 403);
assert.equal((await call('/api/lessons/' + id, 'GET', undefined, '')).status, 401);
let lesson = (await call('/api/lessons/' + id)).body.lesson;
assert.equal(JSON.stringify(lesson.items).includes('"key":'), false);
if (lesson.completedAt) {
  await call('/api/lessons/' + id + '/completion', 'PUT', { completed: false, expectedUpdated: lesson.updated });
  lesson = (await call('/api/lessons/' + id)).body.lesson;
}
const fixture = JSON.parse(readFileSync('fixtures/lessons/math7-ti-le.json', 'utf8')),
  item = fixture.items[0],
  answer = item.key.value;
const saved = await call('/api/lessons/' + id + '/draft', 'PUT', { revision: lesson.draftRevision, answers: { [item.id]: { answer } } });
assert.equal(saved.status, 200);
const request = { clientSubmissionId: crypto.randomUUID(), draftRevision: saved.body.revision, itemIds: [item.id] };
const submitted = await call('/api/lessons/' + id + '/submissions', 'POST', request);
assert.equal(submitted.status, 200);
assert.equal(submitted.body.submission.attempts[0].result, 'correct');
const replay = await call('/api/lessons/' + id + '/submissions', 'POST', request);
assert.equal(replay.body.submission.id, submitted.body.submission.id);
assert.equal(replay.body.submission.replayed, true);
const retry = await call('/api/lessons/' + id + '/submissions', 'POST', { ...request, clientSubmissionId: crypto.randomUUID() });
assert.equal(retry.body.submission.attempts[0].retry_of, submitted.body.submission.attempts[0].id);
assert.equal((await call('/api/submissions/' + submitted.body.submission.id, 'GET', undefined, other)).status, 404);
assert.equal((await call('/api/lessons/' + id + '?learner=demo-ech', 'GET', undefined, admin)).status, 200);
assert.equal(
  (await call('/api/lessons/' + id + '/draft?learner=demo-ech', 'PUT', { revision: saved.body.revision, answers: {} }, admin)).status,
  404,
);
const fresh = (await call('/api/lessons/' + id)).body.lesson;
const done = await call('/api/lessons/' + id + '/completion', 'PUT', { completed: true, expectedUpdated: fresh.updated });
assert.equal(done.status, 200);
const undone = await call('/api/lessons/' + id + '/completion', 'PUT', { completed: false, expectedUpdated: done.body.updated });
assert.equal(undone.status, 200);
await call('/api/auth/sign-out', 'POST', {});
const relogin = await login('demo-ech@example.test');
const restored = (await call('/api/lessons/' + id, 'GET', undefined, relogin)).body.lesson;
assert.equal(restored.draft[item.id].answer, answer);
assert.equal(restored.lastSubmission.id, retry.body.submission.id);
const created = await call('/api/subjects', 'POST', { title: 'QA import ' + crypto.randomUUID().slice(0, 8), template: 'skill' }, admin);
assert.equal(created.status, 201);
const subject = created.body.subject;
assert.equal((await call('/api/subjects/' + subject.id, 'PATCH', { revision: subject.revision, status: 'active' }, admin)).status, 200);
const packageInput = {
  learnerId: 'demo-admin',
  subjectId: subject.id,
  reviewed: true,
  lesson: JSON.parse(readFileSync('fixtures/lessons/deutsch-modalverb.json', 'utf8')),
};
const invalid = await call('/api/admin/lessons/import', 'POST', { ...packageInput, lesson: {} }, admin);
assert.equal(invalid.status, 422);
assert.ok(invalid.body.issues[0].path);
const imported = await call('/api/admin/lessons/import', 'POST', packageInput, admin);
assert.equal(imported.status, 201);
assert.equal((await call('/api/admin/lessons/import', 'POST', packageInput, admin)).status, 409);
assert.equal((await call('/api/lessons/' + imported.body.lessonId, 'GET', undefined, admin)).status, 200);
// Keep the rejected large-body probe last: Wrangler's dev proxy aborts a following POST after an unread denied body.
assert.equal((await call('/api/admin/lessons/import', 'POST', packageInput, relogin)).status, 403);
console.log(
  JSON.stringify({
    origin,
    checks: [
      'auth',
      'other learner 404',
      'origin 403',
      'anonymous 401',
      'hidden key',
      'D1 draft',
      'auto grade',
      'UUID replay',
      'retry history',
      'guardian read only',
      'completion undo',
      'logout/login persistence',
      'admin import validated',
      'invalid package paths',
      'unfinished import kept',
    ],
    result: 'pass',
  }),
);
