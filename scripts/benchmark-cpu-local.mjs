// Local CPU and D1-query budget check for the Hub 2 hot paths (H5.9).
// Runs the real library code against in-memory SQLite with a synthetic Deutsch notebook:
// 14 days of lessons, each with saved, graded answers. CPU includes SQLite, so it is an upper
// bound for Worker CPU (D1 runs outside the isolate). The query count is what matters for the
// Free limit of 50 D1 queries per invocation.
// Usage: node --experimental-strip-types scripts/benchmark-cpu-local.mjs
import { readFileSync } from 'node:fs';
import { memoryDb } from '../tests/d1-adapter.mjs';
import { enqueue } from '../lib/ai-jobs/queue.ts';
import { leaseJobs, readJob } from '../lib/ai-jobs/lease.ts';
import { applyResult } from '../lib/ai-jobs/result.ts';
import { saveDraft, completeLesson } from '../lib/lesson-v2/actions.ts';
import { submitLesson } from '../lib/evidence/submit.ts';
import { recomputeSubmission } from '../lib/learner-model/recompute.ts';
import { refreshSkills } from '../lib/learner-model/nightly.ts';
import { queueDaily } from '../lib/ai-jobs/queue.ts';
import { maintainJobs } from '../lib/ai-jobs/lease.ts';

const learner = 'bench-learner',
  subject = 'sub_benchbenchbenchbench';
const client = {
  id: 'bench',
  scopes: ['jobs:plan', 'jobs:assess'],
  purposes: ['daily'],
  triggers: ['scheduled'],
  learnerIds: [learner],
};
const lessonFile = (name) => JSON.parse(readFileSync(new URL(`../fixtures/lessons/${name}.json`, import.meta.url), 'utf8'));
const termin = lessonFile('deutsch-adult-01-termin');
const keys = termin.targetSkills.map((ref) => ref.replace(/^key:/, ''));

const db = memoryDb();
let queries = 0;
const prepare = db.prepare.bind(db),
  batch = db.batch.bind(db);
db.prepare = (sql) => (queries++, process.env.TRACE && console.log(sql.replace(/\s+/g, ' ').slice(0, 90)), prepare(sql));
db.batch = (statements) => (queries++, batch(statements));
db.sqlite
  .prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at,role,status) VALUES(?,'Bench','bench@example.test',1,1,1,'learner','active')")
  .run(learner);
db.sqlite.prepare("INSERT INTO learner_settings(user_id,daily_target_minutes,updated,role,preferences) VALUES(?,60,'t','adult','{}')").run(learner);
db.sqlite
  .prepare(
    "INSERT INTO subjects(id,learner_id,title,template,status,ai_enabled,goal,level,created_by,created_at,updated_at) VALUES(?,?,'Deutsch','skill','active',1,'A2 → B2','A2',?,'t','t')",
  )
  .run(subject, learner, learner);

const results = [];
async function measure(name, fn) {
  queries = 0;
  const start = process.cpuUsage();
  const value = await fn();
  const used = process.cpuUsage(start);
  results.push({ step: name, cpuMs: Math.round((used.user + used.system) / 100) / 10, d1Queries: queries });
  return value;
}

function planResult(context, lesson) {
  const known = new Set(context.subjects[0].skills.map((s) => s.key));
  return {
    contract: 'plan-result/1',
    contextHash: context.contextHash,
    summary: 'Benchmark',
    subjects: context.subjects.map((s) => ({
      subjectId: s.subjectId,
      expectedRevision: s.revision,
      expectedOpenPrimaryLessonId: s.slot.openPrimaryLessonId,
      action: 'assign',
      reason: 'Benchmark',
      skillChanges: keys
        .filter((key) => !known.has(key))
        .map((key, i) => ({ op: 'add', key, name: key, description: 'Benchmark skill', pathOrder: i + 1, prerequisites: [] })),
      primaryLesson: lesson,
      reviewSet: null,
      masteryProposals: [],
      progressSummary: 'Benchmark',
      requestsHandled: [],
    })),
    explorations: [],
    usage: { model: 'none', inputTokens: 0, outputTokens: 0, ms: 0 },
  };
}

const answers = { i1: '["a"]', i2: 'falsch', i3: '["a"]', i4: 'Antwort', i5: 'Antwort', i6: 'Antwort', i7: 'Ein längerer Text.', i8: 'Noch ein Text.' };
const start = Date.parse('2026-10-01T05:00:00Z');
for (let day = 0; day < 15; day++) {
  const now = new Date(start + day * 86400000);
  const last = day === 14;
  const step = (name, fn) => (last ? measure(name, fn) : fn());
  if (last) await measure('cron 03: maintain + queue daily (1 notebook)', async () => (await maintainJobs(db, now), queueDaily(db, {}, now)));
  else await enqueue(db, {}, { learnerId: learner, kind: 'plan', purpose: 'daily', subjectId: subject }, now);
  const [lease] = await step('lease + build plan context', () => leaseJobs(db, client, { kinds: ['plan'], max: 1, runner: { name: 'b', version: '1', model: 'none' } }, 'bench', now));
  const context = JSON.parse((await readJob(db, lease.jobId)).context_snapshot);
  const lesson = structuredClone(termin);
  for (const item of lesson.items) item.prompt = `Tag ${day + 1}: ${item.prompt}`; // new prompts each day (90-day duplicate check)
  const result = planResult(context, lesson);
  if (last) {
    results.push({ step: 'plan context size', bytes: Buffer.byteLength(JSON.stringify(context)), truncated: context.truncated.length });
    await measure('validate plan (dry run, 15 KB lesson)', () => applyResult(db, client, lease.jobId, lease.leaseToken, result, true, now));
  }
  const applied = await step('apply plan', () => applyResult(db, client, lease.jobId, lease.leaseToken, result, false, now));
  if (applied.status !== 200) throw Error('Plan not applied: ' + JSON.stringify(applied.errors ?? applied.outcome));
  const lessonId = applied.outcome.subjects[0].lessonIds[0];
  const draftAnswers = Object.fromEntries(Object.entries(answers).map(([id, answer]) => [id, { answer }]));
  await saveDraft(db, learner, lessonId, { revision: 0, answers: draftAnswers }, now);
  for (const stage of ['retrieval', 'guided', 'independent']) {
    const submission = await step(`submit ${stage}`, () =>
      submitLesson(db, learner, lessonId, { clientSubmissionId: crypto.randomUUID(), draftRevision: 1, stage }, now),
    );
    await step(`recompute after ${stage}`, () => recomputeSubmission(db, learner, submission.id, now));
  }
  const updated = db.sqlite.prepare('SELECT updated FROM learning_lessons WHERE id=?').get(lessonId).updated;
  await completeLesson(db, learner, lessonId, true, updated, new Date(now.getTime() + 3600000));
}
const nightly = new Date(start + 16 * 86400000);
await measure('cron 04: refresh skills (limit 10)', () => refreshSkills(db, nightly));
console.table(results);
