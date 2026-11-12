import test from "node:test";
import assert from "node:assert/strict";
import { memoryDb } from "./d1-adapter.mjs";
import { readNotebookOverview } from "../lib/learner-model/overview.ts";
import { readNotebookReport } from "../lib/notebook-report.ts";

test("notebook report scopes study, first tries and encouragement to the selected book", async () => {
  const db = memoryDb();
  db.sqlite.exec(`
    INSERT INTO subjects(id,learner_id,title,template,status,created_by,created_at,updated_at)
    VALUES('de','learner','Deutsch','skill','active','learner','2026-11-01','2026-11-01'),
      ('math','learner','Toán','skill','active','learner','2026-11-01','2026-11-01');
    INSERT INTO study_time(user_id,day,track,seconds,updated)
    VALUES('learner','2026-11-11','de',300,'2026-11-11'),('learner','2026-11-11','math',900,'2026-11-11');`);
  const now = new Date("2026-11-10T23:01Z");
  const overview = await readNotebookOverview(db, "learner", "de", null, now);
  overview.days[0].correct = 2;
  overview.days[0].graded = 4;
  overview.days[7].correct = 3;
  overview.days[7].graded = 5;
  const report = await readNotebookReport(db, "learner", "de", overview, now, "adult");
  assert.equal(report.daysStudied, 1);
  assert.equal(report.minutes, 5);
  assert.deepEqual(report.current, { correct: 3, total: 5 });
  assert.deepEqual(report.previous, { correct: 2, total: 4 });
  const empty = await readNotebookReport(db, "learner", "empty", await readNotebookOverview(db, "learner", "empty", null, now), now, "adult");
  assert.deepEqual([empty.daysStudied, empty.minutes, empty.current.total, empty.lessonsDone], [0, 0, 0, 0]);
  assert.deepEqual(empty.errors, []);
});
