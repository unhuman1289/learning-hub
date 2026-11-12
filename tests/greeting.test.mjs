import test from "node:test";
import assert from "node:assert/strict";
import { berlinHour, greetingFor, readGreetingFacts } from "../lib/greeting.ts";
import { memoryDb } from "./d1-adapter.mjs";

const base = { daysStudied14: 0, streak: 0, daysSinceLast: null, firstTryThisWeek: { correct: 0, total: 0 },
  firstTryLastWeek: { correct: 0, total: 0 }, lessonsDoneThisWeek: 0, notebook: null, newlySolid: [],
  dueReviews: 0, openLessons: 0, minutesToday: 0, targetMinutes: 45 };
const options = { name: "Mai", day: "2026-11-11", hour: 8, role: "adult" };
for (const [kind, facts] of [
  ["goal-today", { minutesToday: 45, streak: 7 }], ["streak", { streak: 3 }],
  ["better", { firstTryThisWeek: { correct: 4, total: 5 }, firstTryLastWeek: { correct: 3, total: 5 } }],
  ["solid", { newlySolid: ["Phân số"] }], ["done-week", { lessonsDoneThisWeek: 2 }],
  ["welcome-back", { daysSinceLast: 3 }], ["review", { dueReviews: 2 }], ["open", { openLessons: 1 }], ["start", {}],
]) test(`greeting selects ${kind} consistently`, () => {
  const actual = greetingFor({ ...base, ...facts }, options);
  assert.equal(actual.kind, kind);
  assert.deepEqual(actual, greetingFor({ ...base, ...facts }, options));
  assert.ok(actual.hello.includes(options.name));
});

test("Berlin local hour follows both daylight-saving changes", () => {
  for (const [date, hour] of [["2026-03-29T00:59Z", 1], ["2026-03-29T01:00Z", 3],
    ["2026-10-25T00:59Z", 2], ["2026-10-25T01:00Z", 2]]) {
    assert.equal(berlinHour(new Date(date)), hour);
  }
});

test("greeting aggregates active notebooks and excludes archived notebooks", async () => {
  const db = memoryDb();
  db.sqlite.exec(`INSERT INTO subjects(id,learner_id,title,template,status,created_by,created_at,updated_at)
    VALUES('de','learner','Deutsch','skill','active','learner','2026-11-01','2026-11-01'),
    ('math','learner','Toán','skill','archived','learner','2026-11-01','2026-11-01');
    INSERT INTO study_time(user_id,day,track,seconds,updated)
    VALUES('learner','2026-11-10','de',125,'2026-11-10'),('learner','2026-11-11','math',200,'2026-11-11');`);
  const facts = await readGreetingFacts(db, "learner", new Date("2026-11-10T23:01Z"));
  assert.equal(facts.daysStudied14, 1);
  assert.equal(facts.streak, 1);
  assert.equal(facts.daysSinceLast, 1);
});
