import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { memoryDb } from "./d1-adapter.mjs";
import { insertLessonV2 } from "../lib/lesson-v2/store.ts";
import { reveal } from "../lib/lesson-v2/actions.ts";
import { readNotebookLessons } from "../lib/lesson-v2/notebook-list.ts";

test("notebook chapters use assignment dates and aggregate only the requested learner", async () => {
  const db = memoryDb();
  const learner = "learner";
  const subject = "sub_aaaaaaaaaaaaaaaaaaaa";
  const other = "sub_bbbbbbbbbbbbbbbbbbbb";
  const add = db.sqlite.prepare("INSERT INTO subjects(id,learner_id,title,template,status,created_by,created_at,updated_at) VALUES(?,?,'Deutsch','skill','active',?,'t','t')");
  add.run(subject, learner, learner);
  add.run(other, "other", "other");
  const lesson = JSON.parse(readFileSync(new URL("../fixtures/contracts/lesson-v2/deutsch-modalverb.json", import.meta.url)));
  const older = await insertLessonV2(db, { learnerId: learner, subjectId: subject, day: "2026-10-30", lesson });
  const newer = await insertLessonV2(db, { learnerId: learner, subjectId: subject, day: "2026-11-01", lesson });
  await insertLessonV2(db, { learnerId: "other", subjectId: other, day: "2026-09-01", lesson });
  await reveal(db, learner, newer, "i1", "solution");
  const { lessons, nextOffset } = await readNotebookLessons(db, learner, subject, true, 0);
  assert.deepEqual(lessons.map(row => row.id), [newer, older]);
  assert.deepEqual(lessons.map(row => row.firstMonth), ["2026-10", "2026-10"]);
  assert.equal(lessons[0].solutionsSeen, 1);
  assert.equal(lessons[0].total, lesson.items.length);
  assert.equal(nextOffset, null);
  assert.deepEqual((await readNotebookLessons(db, "other", subject, true, 0)).lessons, []);
  db.sqlite.close();
});

test("all lessons paginate at a month boundary when a chapter fits on the next read", async () => {
  const db = memoryDb();
  db.sqlite.exec(`INSERT INTO subjects(id,learner_id,title,template,status,created_by,created_at,updated_at)
    VALUES('de','learner','Deutsch','skill','active','learner','t','t');`);
  const insert = db.sqlite.prepare(`INSERT INTO learning_lessons
    (id,user_id,track,payload,assigned_date,response,updated,subject_id,package_version,template,kind,slot)
    VALUES (?,'learner',NULL,'{"title":"Bài","items":[]}',?,'','t','de','2','skill','review','extra')`);
  for (let index = 0; index < 402; index++) {
    insert.run("lesson-" + index, index < 397 ? "2026-11-01" : "2026-10-31");
  }
  const first = await readNotebookLessons(db, "learner", "de", true, 0);
  assert.equal(first.lessons.length, 397);
  assert.equal(first.nextOffset, 397);
  const second = await readNotebookLessons(db, "learner", "de", true, first.nextOffset);
  assert.equal(second.lessons.length, 5);
  assert.equal(second.nextOffset, null);
  assert.ok(second.lessons.every(row => row.assignedDate === "2026-10-31"));
  db.sqlite.close();
});
