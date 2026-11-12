import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lessonPackageV3 } from "../lib/contracts/lesson-package-v3.ts";
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
