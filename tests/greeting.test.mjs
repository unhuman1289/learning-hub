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

test("the learner's own hour chooses the greeting words, and only a whole hour is taken", async () => {
  const { deviceHour } = await import("../lib/greeting.ts");
  assert.equal(deviceHour("20"), 20);
  assert.equal(deviceHour("0"), 0);
  for (const bad of [null, "", "24", "-1", "7.5", "abc", "1e1", "２０"]) assert.equal(deviceHour(bad), null, String(bad));
});

test("Bột greets each profile with its configured address, and defaults to the display name", () => {
  const cases = [
    [{ self: "em", call: "chị Ếch" }, 15, "Em chào chị Ếch buổi chiều ạ!"],
    [{ self: "cháu", call: "ông" }, 8, "Cháu chào ông buổi sáng ạ."],
    [{ self: "con", call: "bố Thạch" }, 19, "Con chào bố Thạch buổi tối ạ!"],
    [undefined, 8, "Con chào Mai buổi sáng ạ!"],
  ];
  for (const [address, hour, hello] of cases) {
    assert.equal(greetingFor(base, { ...options, hour, address }).hello, hello);
  }
});

test("the desk mentions real notebook titles, waiting work and keeps stars for children", () => {
  const child = { ...options, role: "child", address: { self: "em", call: "chị Ếch" } };
  const open = greetingFor({ ...base, openLessons: 2, openNotebooks: ["Tiếng Đức", "Toán 7"] }, child);
  assert.equal(open.kind, "open");
  assert.match(open.cheer, /2 bài đang mở.*Tiếng Đức và Toán 7/);
  const streak = greetingFor({ ...base, streak: 3 }, child);
  assert.match(streak.cheer, /^⭐ .*3 ngày/);
  assert.equal(greetingFor({ ...base, awaitingGrade: true, openLessons: 2 }, child).kind, "grading");
});
