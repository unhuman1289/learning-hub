import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lessonPackageV3 } from "../lib/contracts/lesson-package-v3.ts";
import { memoryDb } from "./d1-adapter.mjs";
import { DEFAULT_LIMITS } from "../lib/subjects/sql.ts";
import { queueSubmission } from "../lib/ai-jobs/queue.ts";
import { leaseJobs, readJob } from "../lib/ai-jobs/lease.ts";
import { saveDraft } from "../lib/lesson-v2/actions.ts";
import { insertLessonV2, readLessonV2 } from "../lib/lesson-v2/store.ts";
import { validateLessonPackage } from "../lib/lesson-v2/validate.ts";
import { submitLesson, readSubmission, parseSubmission } from "../lib/evidence/submit.ts";
import { autoGradeStructured } from "../lib/evidence/autograde.ts";

const original = JSON.parse(readFileSync(new URL("../fixtures/contracts/lesson-v2/deutsch-modalverb.json", import.meta.url)));
const base = Object.fromEntries(Object.entries(original.items[0]).filter(([field]) =>
  !["input", "choices", "key", "rubric"].includes(field)));
const text = value => ({ type: "text", accepted: [value], caseSensitive: false });
const option = id => ({ id, text: id });
const fixtures = [
  [{ input:"cloze", fragments:["", " und ", ""], key:{ type:"cloze", blanks:[text("Ja"),text("Nein")] } }, ["  ja ", "NEIN"], ["ja", ""]],
  [{ input:"match", left:[option("a"),option("b")], right:[option("c"),option("d")], key:{type:"match",pairs:[["a","c"],["b","d"]]} }, { a:"c",b:"d" }, { a:"c" }],
  [{ input:"order", steps:[option("a"),option("b"),option("c")], key:{type:"order",sequence:["a","c","b"]} }, ["a","c","b"], ["a","b","c"]],
  [{ input:"label", image:"animal-cell", description:"Hai điểm trên hình", marks:[{x:20,y:30},{x:70,y:40}], key:{type:"label",labels:[text("Nhân"),text("Màng")]} }, ["nhân","màng"], ["nhân",""]],
  [{ input:"table", headers:["A","B"], rowLabels:["1"], key:{type:"table",cells:[text("Đúng"),{type:"numeric",value:"2",tolerance:0.2,unit:null}]} }, ["đúng","2.1"], ["đúng","3"]],
];

function lesson(item, knowledge = []) {
  return { ...original, contract:"lesson-package/3", items:[{ ...base, ...item }], knowledge };
}

for (const [item, right, partial] of fixtures) {
  test(`validates and scores ${item.input} with partial credit`, () => {
    const parsed = lessonPackageV3.parse(lesson(item));
    const key = parsed.items[0].key;
    assert.equal(autoGradeStructured(key, JSON.stringify(right)).score, 1);
    const some = autoGradeStructured(key, JSON.stringify(partial));
    assert.equal(some.result, "partial");
    assert.ok(some.score > 0 && some.score < 1);
    assert.equal(autoGradeStructured(key, "not JSON").score, 0);
  });
}

test("code requires a rubric, and figures accept bounded data only", () => {
  const code = { input:"code", language:"rust", starter:"fn main() {}", lines:6,
    rubric:[{criterion:"Đúng yêu cầu",points:1},{criterion:"Tên rõ ràng",points:1}] };
  const figure = { kind:"figure", figure:{type:"flow",description:"Hai bước",steps:[option("a"),option("b")],edges:[["a","b"]]} };
  assert.ok(lessonPackageV3.safeParse(lesson(code,[figure])).success);
  assert.equal(lessonPackageV3.safeParse(lesson({...code,rubric:[]})).success,false);
  assert.equal(lessonPackageV3.safeParse(lesson(code,[{...figure,figure:{...figure.figure,svg:"<svg/>"}}])).success,false);
  assert.equal(lessonPackageV3.safeParse(lesson(code,[{...figure,figure:{...figure.figure,edges:[["a","c"]]}}])).success,false);
  assert.equal(lessonPackageV3.safeParse(lesson({...fixtures[0][0],fragments:["",""]})).success,false);
});

test("D1 round-trip preserves all v3 drafts and reads, submits and leases stored v3 after opt-out", async () => {
  const db = memoryDb();
  try {
    const subjectId = "sub_99999999999999999999";
    const learnerId = "learner-v3";
    const now = new Date("2026-11-12T12:00:00Z");
    const stamp = now.toISOString();
    db.sqlite.prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at,role,status) VALUES(?,?,?,1,1,1,'learner','active')")
      .run(learnerId, "Học thử", "learner-v3@example.test");
    db.sqlite.prepare("INSERT INTO subjects(id,learner_id,title,template,status,limits,created_by,created_at,updated_at) VALUES(?,?,?,'skill','active',?,?,?,?)")
      .run(subjectId, learnerId, "Sinh học thử", JSON.stringify({ ...DEFAULT_LIMITS, package: 3 }), learnerId, stamp, stamp);
    const inputs = [
      ...fixtures,
      [{ input: "code", language: "rust", starter: "fn count() {}", lines: 6,
        rubric: [{ criterion: "Đếm đúng", points: 1 }, { criterion: "Kiểu trả về", points: 1 }] }, "fn count() -> usize { 2 }"],
    ];
    const exercise = {
      ...original, contract: "lesson-package/3",
      items: inputs.map(([item], i) => ({ ...base, ...item, id: "i" + (i + 1), prompt: "Câu thử " + i })),
      stages: [{ stage: "independent", title: "Tự làm", itemIds: inputs.map((_, i) => "i" + (i + 1)) }],
      knowledge: [{ kind: "steps", steps: ["Quan sát", "Kiểm tra"] }],
    };
    const parsed = validateLessonPackage(exercise);
    assert.deepEqual(parsed.issues, []);
    const id = await insertLessonV2(db, { subjectId, learnerId, day: "2026-11-12", lesson: parsed.lesson, now });
    const answers = Object.fromEntries(inputs.map(([item, answer], i) => ["i" + (i + 1), { answer: item.input === "code" ? answer : JSON.stringify(answer) }]));
    db.sqlite.prepare("UPDATE subjects SET limits=json_set(limits,'$.package',2) WHERE id=?").run(subjectId);
    await assert.rejects(insertLessonV2(db, { subjectId, learnerId, day: "2026-11-13", lesson: parsed.lesson, now }), error => error.status === 409);
    await saveDraft(db, learnerId, id, { revision: 0, answers }, now);
    const view = await readLessonV2(db, learnerId, id);
    assert.deepEqual(view.knowledge, exercise.knowledge);
    assert.deepEqual(view.draft, answers);
    assert.equal(view.items.length, 6);
    assert.ok(view.items.every(item => !("key" in item) && !("solution" in item.revealed)));
    await assert.rejects(readLessonV2(db, "someone-else", id), error => error.status === 404);
    const submitted = await submitLesson(db, learnerId, id, parseSubmission({
      clientSubmissionId: crypto.randomUUID(), draftRevision: 1, itemIds: Object.keys(answers),
    }), now);
    await queueSubmission(db, {}, learnerId, submitted.id, now);
    const graded = await readSubmission(db, learnerId, submitted.id);
    assert.deepEqual(graded.attempts.map(a => a.result), ["correct", "correct", "correct", "correct", "correct", null]);

    const client = { id: "v3-runner", scopes: ["jobs:assess"], purposes: ["submission"], triggers: ["on_demand"], learnerIds: [learnerId] };
    const runner = { name: "test", version: "1", model: "none" };
    const lease = { kinds: ["assess"], max: 1, runner, capabilities: ["local-grading"] };
    assert.deepEqual(await leaseJobs(db, client, lease, "test", now), []);
    const [work] = await leaseJobs(db, client, { ...lease, capabilities: [...lease.capabilities, "lesson-v3"] }, "test", now);
    assert.ok(work);
    const context = JSON.parse((await readJob(db, work.jobId)).context_snapshot);
    const code = context.attempts.find(attempt => attempt.input === "code");
    assert.equal(code.language, "rust");
    assert.equal(code.starter, "fn count() {}");
    assert.equal(code.answer, answers.i6.answer);
    assert.equal(context.attempts.filter(attempt => attempt.autoGrade).length, 5);
    assert.deepEqual(db.sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.sqlite.close();
  }
});
