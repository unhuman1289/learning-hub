import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { memoryDb } from './d1-adapter.mjs';
import { lessonSummary } from '../lib/lesson-v2/summary.ts';
import { insertLessonV2 } from '../lib/lesson-v2/store.ts';
import { saveDraft, reveal } from '../lib/lesson-v2/actions.ts';
import { submitLesson, parseSubmission } from '../lib/evidence/submit.ts';

test('summary uses the latest result for each question and only its learner and notebook', async () => {
  const db=memoryDb(), user='learner', subject='sub_aaaaaaaaaaaaaaaaaaaa', now=new Date('2026-10-13T22:15:00Z');
  db.sqlite.prepare("INSERT INTO subjects(id,learner_id,title,template,status,created_by,created_at,updated_at) VALUES(?,?,'Deutsch','skill','active',?,'t','t')").run(subject,user,user);
  const lesson=JSON.parse(readFileSync(new URL('../fixtures/contracts/lesson-v2/deutsch-modalverb.json',import.meta.url)));
  const id=await insertLessonV2(db,{learnerId:user,subjectId:subject,day:'2026-10-14',lesson});
  const submit=(rev,item)=>submitLesson(db,user,id,parseSubmission({clientSubmissionId:crypto.randomUUID(),draftRevision:rev,itemIds:[item]}),now);
  await saveDraft(db,user,id,{revision:0,answers:{i1:{answer:'["a"]'}}},now);
  await submit(1,'i1');
  await reveal(db,user,id,'i5','hint1');
  await saveDraft(db,user,id,{revision:1,answers:{i1:{answer:'["b"]'},i5:{answer:'Meine Antwort.'}}},now);
  await submit(2,'i1');
  await submit(2,'i5');
  db.sqlite.prepare("INSERT INTO study_time(user_id,day,track,seconds,updated) VALUES(?,'2026-10-14',?,420,'t')").run(user,subject);
  const result=await lessonSummary(db,user,id,now);
  assert.deepEqual({ corrected:result.correctAfterRetry, wrong:result.needsCorrection, pending:result.pending, hints:result.hintsUsed, minutes:result.minutes },
    { corrected:1, wrong:0, pending:1, hints:1, minutes:7 });
  assert.equal(result.unanswered,result.total-2);
  await assert.rejects(lessonSummary(db,'other',id,now),e=>e.status===404);
  db.sqlite.close();
});

test('opening a solution is recorded separately and a correct supported retry does not count', async () => {
  const db = memoryDb(), user = 'learner', subject = 'sub_aaaaaaaaaaaaaaaaaaaa';
  const now = new Date('2026-10-13T22:15:00Z');
  db.sqlite.prepare("INSERT INTO subjects(id,learner_id,title,template,status,created_by,created_at,updated_at) VALUES(?,?,'Deutsch','skill','active',?,'t','t')").run(subject,user,user);
  const lesson = JSON.parse(readFileSync(new URL('../fixtures/contracts/lesson-v2/deutsch-modalverb.json', import.meta.url)));
  const id = await insertLessonV2(db, { learnerId:user, subjectId:subject, day:'2026-10-14', lesson });
  await reveal(db, user, id, 'i1', 'solution');
  const before = await lessonSummary(db, user, id, now);
  assert.equal(before.solutionsSeen, 1);
  assert.equal(before.unanswered, before.total - 1);
  assert.equal(before.correctAfterRetry, 0);
  const submit = rev => submitLesson(db,user,id,parseSubmission({clientSubmissionId:crypto.randomUUID(),draftRevision:rev,itemIds:['i1']}),now);
  await saveDraft(db,user,id,{revision:0,answers:{i1:{answer:'["a"]'}}},now);
  await submit(1);
  await saveDraft(db,user,id,{revision:1,answers:{i1:{answer:'["b"]'}}},now);
  await submit(2);
  const after = await lessonSummary(db, user, id, now);
  assert.equal(after.solutionsSeen, 1);
  assert.equal(after.correctAfterRetry, 0);
  assert.equal(db.sqlite.prepare("SELECT support FROM attempts WHERE lesson_id=? ORDER BY attempt_no DESC LIMIT 1").get(id).support, 'solution');
  db.sqlite.close();
});

test('showing solution text after a grade does not mark it viewed by the learner', async () => {
  const { itemView } = await import('../lib/lesson-v2/store.ts');
  const lesson = JSON.parse(readFileSync(new URL('../fixtures/contracts/lesson-v2/deutsch-modalverb.json', import.meta.url)));
  const item = lesson.items[0];
  const graded = itemView(item, 'guided', undefined, true);
  assert.ok(graded.revealed.solution);
  assert.equal(graded.revealed.solutionSeen, false);
  assert.equal(itemView(item, 'guided', 'solution', false).revealed.solutionSeen, true);
});
