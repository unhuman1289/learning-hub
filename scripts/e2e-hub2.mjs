import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { householdLogin } from './staging-household.mjs';
import { runFake } from './fake-runner.mjs';
const args = process.argv.slice(2),
  arg = (k) => args[args.indexOf(k) + 1];
if (!args.includes('--manifest')) throw Error('Requires --manifest private QA JSON (origin, email, password, learnerId, credentials).');
const manifest = JSON.parse(readFileSync(arg('--manifest'), 'utf8')),
  origin = new URL(manifest.origin).origin;
if (
  !(origin === 'https://learning-hub-staging.tranvu-812.workers.dev' || new URL(origin).hostname === 'localhost') ||
  !(manifest.environment === 'staging' ? /^prf_[a-f0-9]{20}$/ : /^qa-h5-[a-f0-9]{20}$/).test(manifest.learnerId)
)
  throw Error('E2E accepts generated local/staging H5 QA only.');
let cookie = '';
const call = async (path, method = 'GET', body, asCookie = cookie) => {
  const r = await fetch(origin + path, {
    method,
    headers: { Origin: origin, 'Content-Type': 'application/json', ...(asCookie ? { Cookie: asCookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: r.status,
    body: await r.json().catch(() => null),
    cookie: r.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; '),
  };
};
const login = async () => {
  if (manifest.environment === 'staging') { cookie = await householdLogin(origin, manifest.learnerId); return; }
  const r = await call('/api/auth/sign-in/email', 'POST', { email: manifest.email, password: manifest.password }, '');
  assert.equal(r.status, 200);
  cookie = r.cookie;
};
assert.equal((await call('/api/today', 'GET', undefined, '')).status, 401);
await login();
await runFake({
  baseUrl: origin,
  credentials: manifest.credentials,
  fixture: JSON.parse(readFileSync('fixtures/lessons/deutsch-modalverb.json', 'utf8')),
});
const today = await call('/api/today');
assert.equal(today.status, 200);
const lessonId = today.body.items.find((i) => i.lessonId).lessonId;
const read = await call('/api/lessons/' + lessonId);
assert.equal(read.status, 200);
assert(!read.body.lesson.items[0].key);
const draft = await call('/api/lessons/' + lessonId + '/draft', 'PUT', {
  revision: read.body.lesson.draftRevision,
  answers: { i1: { answer: '["b"]' }, i3: { answer: 'Paul möchte einen Kuchen kaufen.' } },
});
assert.equal(draft.status, 200);
const submitted = await call('/api/lessons/' + lessonId + '/submissions', 'POST', {
  clientSubmissionId: crypto.randomUUID(),
  draftRevision: draft.body.revision,
  itemIds: ['i1', 'i3'],
});
assert.equal(submitted.status, 200);
assert.equal(submitted.body.aiPending, true);
const reports = await runFake({
  baseUrl: origin,
  credentials: manifest.credentials,
  fixture: JSON.parse(readFileSync('fixtures/lessons/deutsch-modalverb.json', 'utf8')),
});
assert(reports.some((r) => r.outcome.gradeIds?.length));
const grade = await call('/api/submissions/' + submitted.body.submission.id);
assert.equal(grade.body.submission.status, 'graded');
const details = await call('/api/subjects/' + manifest.subjectId);
assert(details.body.skills.some((s) => s.dim_application === 2));
const fresh = (await call('/api/lessons/' + lessonId)).body.lesson;
const done = await call('/api/lessons/' + lessonId + '/completion', 'PUT', { completed: true, expectedUpdated: fresh.updated });
assert.equal(done.status, 200);
assert.equal((await call('/api/lessons/' + lessonId + '/completion', 'PUT', { completed: false, expectedUpdated: done.body.updated })).status, 200);
assert.equal((await call(manifest.environment === 'staging' ? '/api/profiles' : '/api/auth/sign-out', 'POST', manifest.environment === 'staging' ? { action: 'leave' } : {})).status, 200);
await login();
const saved = (await call('/api/lessons/' + lessonId)).body.lesson;
assert.equal(saved.draft.i3.answer, 'Paul möchte einen Kuchen kaufen.');
assert.equal(saved.completedAt, null);
const other = manifest.environment === 'staging' ? { status: 200, cookie: await householdLogin(origin, manifest.learnerIds[1]) } : await call('/api/auth/sign-in/email', 'POST', { email: manifest.otherEmail, password: manifest.password }, '');
assert.equal(other.status, 200);
assert([403, 404].includes((await call('/api/lessons/' + lessonId, 'GET', undefined, other.cookie)).status));
assert([403, 404].includes((await call('/api/subjects/' + manifest.subjectId, 'GET', undefined, other.cookie)).status));
assert.equal((await call('/api/admin/ai-jobs', 'GET', undefined, other.cookie)).status, 403);
console.log(
  JSON.stringify(
    {
      environment: manifest.environment,
      result: 'PASS',
      lessonId,
      submissionId: submitted.body.submission.id,
      verified: [
        'sign-in',
        'plan-dry-run-save-readback',
        'draft',
        'submission',
        'assess',
        'skill-state',
        'completion-undo',
        'sign-out-sign-in-persistence',
        'cross-learner-denial',
        'admin-denial',
      ],
    },
    null,
    2,
  ),
);
