import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { queueSubmission } from '../lib/ai-jobs/queue.ts';
import { leaseJobs, leasedJob, readJob } from '../lib/ai-jobs/lease.ts';
import { applyResult } from '../lib/ai-jobs/result.ts';
import { uploadAudio } from '../lib/audio/upload.ts';
import { createRequest, parseRequest } from '../lib/requests/service.ts';
import { createSubject } from '../lib/subjects/service.ts';
import { parseSubjectInput } from '../lib/subjects/policy.ts';
import { saveDraft } from '../lib/lesson-v2/actions.ts';
import { submitLesson } from '../lib/evidence/submit.ts';

const now = new Date('2026-11-16T10:00:00Z');
const learner = 'demo-listening-authoring';
const stamp = now.toISOString();
export const germanVoices = { 'de-DE': { f: 'Anna (German (Germany))', m: 'Reed (German (Germany))' } };
const defaultSample = JSON.parse(readFileSync(new URL('./fixtures/qwen/l4-listening-sample.json', import.meta.url))).listeningSample;

export async function listeningJob(db, { sample = defaultSample, ttsVoices = germanVoices, title = 'Deutsch', goal = 'Deutsch A1: Uhrzeit und Termine' } = {}) {
  const client = {
    id: 'local-replay', scopes: ['jobs:plan', 'jobs:assess'], learnerIds: [learner],
    purposes: ['request', 'submission'], triggers: ['on_demand', 'deferred', 'scheduled'],
  };
  db.sqlite.prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at,role,status) VALUES(?,'Demo','l4@example.test',1,1,1,'learner','active')").run(learner);
  const subject = await createSubject(db, learner, learner, parseSubjectInput({ title, goal }), now);
  db.sqlite.prepare("UPDATE subjects SET status='active' WHERE id=?").run(subject.id);
  db.sqlite.prepare(`INSERT INTO skills(id,subject_id,learner_id,key,name,description,path_order,prerequisites,status,origin,created_at,updated_at)
    VALUES('sk_listeningtime',?,?,'uhrzeit','Uhrzeit und Termine','',1,'[]','active','ai',?,?)`).run(subject.id, learner, stamp, stamp);
  const insertStep = db.sqlite.prepare(`INSERT INTO roadmap_steps(id,learner_id,subject_id,ord,title,objective,situation,skill_ids,requires,band,kind,status,origin,created_at,updated_at)
    VALUES(?,?,?,?,?,'Giờ hẹn và nơi gặp','Hẹn gặp','["sk_listeningtime"]','[]',2,'new',?,'migration',?,?)`);
  for (const [index, name] of ['Uhrzeit und Termine', 'Wochentage', 'Kalender', 'Verabredungen', 'Öffnungszeiten'].entries()) {
    insertStep.run('time-' + index, learner, subject.id, index + 1, name, index ? 'planned' : 'practising', stamp, stamp);
  }
  const request = await createRequest(db, {}, learner, learner,
    parseRequest({ subjectId: subject.id, mode: 'practice', stepId: 'time-0', clientRequestId: crypto.randomUUID() }), now);
  const claim = (kind, capabilities) => leaseJobs(db, client, {
    kinds: [kind], max: 1, capabilities, ttsVoices,
    runner: { name: 'local-replay', version: '1', model: 'fixture' },
  }, 'local', now);
  const capabilities = ['lesson-v3', 'adaptive-plan', 'roadmap-v2', ...(Object.keys(ttsVoices).length ? ['tts'] : [])];
  const [lease] = await claim('plan', capabilities);
  assert(lease);
  const objects = new Map();
  const bucket = {
    async head(key) { return objects.get(key) ?? null; },
    async put(key, bytes, options) {
      if (objects.has(key)) return null;
      const object = { size: bytes.byteLength, customMetadata: options.customMetadata };
      objects.set(key, object);
      return object;
    },
  };
  const submitted = [];
  const hub = {
    async context(lease) { return JSON.parse((await readJob(db, lease.jobId)).context_snapshot); },
    async heartbeat() {},
    async fail() {},
    async putBinary(lease, hash, bytes, spec) {
      const verify = () => leasedJob(db, client, lease.jobId, lease.leaseToken, now);
      const req = new Request('http://local.test/audio', {
        method: 'PUT', body: bytes, headers: { 'Content-Type': 'audio/mp4', 'X-Audio-Spec': spec },
      });
      return uploadAudio(db, bucket, req, await verify(), hash, verify, now);
    },
    async result(lease, body, dryRun) {
      const r = await applyResult(db, client, lease.jobId, lease.leaseToken, body, dryRun, now, undefined, bucket);
      if (r.status === 200 && !dryRun) submitted.push(body);
      return { status: r.status, body: r };
    },
    async state(id) {
      const job = await readJob(db, id);
      return { status: job.status, outcome: JSON.parse(job.outcome) };
    },
  };
  const context = await hub.context(lease);
  const draft = structuredClone(sample);
  Object.assign(draft.subjects[0], { subjectId: subject.id, expectedRevision: context.subjects[0].revision, reason: context.adaptive.reason });
  Object.assign(draft.explorations[0], { subjectId: subject.id, requestId: request.id });
  return {
    hub, lease, context, draft, submitted, objects, request,
    async submitOpenAnswer(lessonId) {
      await saveDraft(db, learner, lessonId, { revision: 0, answers: { i2: { answer: 'Họ gặp nhau lúc ba giờ.' } } }, now);
      const sub = await submitLesson(db, learner, lessonId, {
        clientSubmissionId: crypto.randomUUID(), draftRevision: 1, stage: 'retrieval', itemIds: ['i2'],
      }, now);
      await queueSubmission(db, {}, learner, sub.id, now);
      const [assess] = await claim('assess', ['lesson-v3', 'local-grading', 'adaptive-plan']);
      return assess;
    },
  };
}
