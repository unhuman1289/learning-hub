import test from "node:test";
import assert from "node:assert/strict";
import { blockLines, initialLessonBlock, pageBlocks, pageGeometry } from "../app/hub/notebook/page-blocks.ts";

for (const size of [1, 6, 10, 25]) test(`keeps ${size} questions intact and the summary last`, () => {
  const items = Array.from({ length: size }, (_, index) => ({ id: String(index), kind: "item", long: index === 2, reservedLines: 5 }));
  const blocks = [{ id: "head", kind: "head" }, ...items, { id: "summary", kind: "summary" }];
  const pages = pageBlocks(blocks, pageGeometry(1280, 920, false));
  assert.deepEqual(pages.flat(), blocks);
  assert.deepEqual(pages.at(-1), [blocks.at(-1)]);
  if (size >= 3) assert.deepEqual(pages.find(page => page.includes(items[2])), [items[2]]);
});

test("fixed pages ignore changing feedback and hints", () => {
  const blocks = Array.from({ length: 8 }, (_, index) => ({ id: String(index), kind: "item", reservedLines: 5 }));
  const geometry = pageGeometry(375, 820, true);
  const ids = pages => pages.map(page => page.map(block => block.id));
  assert.deepEqual(ids(pageBlocks(blocks, geometry)), ids(pageBlocks(blocks.map(block => ({
    ...block, feedback: "Lời phê rất dài ".repeat(100), revealed: { hints: ["Gợi ý"] },
  })), geometry)));
});

test("narrower paper wraps text earlier and child paper uses 32px lines", () => {
  const block = { id: "remember", kind: "remember", text: [{ value: "Đọc kỹ ví dụ. ".repeat(20) }] };
  const phone = pageGeometry(375, 820, true);
  const desktop = pageGeometry(1280, 920, false);
  assert.equal(phone.line, 32);
  assert.equal(desktop.line, 28);
  assert.equal(phone.double, false);
  assert.equal(desktop.double, true);
  assert.ok(blockLines(block, phone) > blockLines(block, desktop));
});

test("separate knowledge sections can continue over three pages", () => {
  const blocks = Array.from({ length: 3 }, (_, index) => ({
    id: `remember-${index}`, kind: "remember", text: [{ value: "Ghi nhớ".repeat(40) }], reservedLines: 5,
  }));
  assert.equal(pageBlocks(blocks, pageGeometry(375, 680, false)).length, 3);
});

test("new, resumed, correction and completed lessons open the intended block", () => {
  const fresh = { completed: false, hasWork: false, correction: -1, firstUnanswered: 0 };
  assert.equal(initialLessonBlock(fresh), "head");
  assert.equal(initialLessonBlock({ ...fresh, hasWork: true, firstUnanswered: 2 }), "cau-3");
  assert.equal(initialLessonBlock({ ...fresh, hasWork: true, firstUnanswered: 2, correction: 0 }), "cau-1");
  assert.equal(initialLessonBlock({ ...fresh, completed: true }), "summary");
});

for (const lines of [18, 22, 26]) test(`four short questions occupy a single spread at ${lines} lines`, () => {
  const geometry = { ...pageGeometry(1280, 800, true), lines };
  const items = [
    { id: "choice", kind: "item", reservedLines: 4, text: [{ value: "Chọn câu đúng." }, { value: "Ich kann arbeiten." }, { value: "Ich kann arbeitet." }] },
    ...[1, 2, 3].map(id => ({ id: `short-${id}`, kind: "item", reservedLines: 5, text: [{ value: "Viết một câu ngắn." }] })),
    { id: "long", kind: "item", reservedLines: 9, long: true },
  ];
  const pages = pageBlocks(items, geometry);
  assert.ok(pages[0].length >= 2);
  assert.ok(pages.slice(0, 2).flat().filter(block => !block.long).length >= 3);
});

test("paper height never exceeds the space measured below the toolbar", () => {
  const available = 501;
  const geometry = pageGeometry(1280, available, true, 431);
  assert.ok((geometry.lines + 2) * geometry.line <= available);
  assert.equal(geometry.width, 431);
});

test("40 lines of notes continue without exceeding the paper body", () => {
  const geometry = { ...pageGeometry(768, 680, true), lines: 18 };
  const notes = Array.from({ length: 10 }, (_, index) => ({
    id: `remember-${index}`, kind: "remember", text: [{ value: "Đọc ví dụ.\n".repeat(3) + "Tự thử." }],
  }));
  const pages = pageBlocks(notes, geometry);
  assert.equal(pages.length, 3);
  assert.deepEqual(pages.flat(), notes);
  assert.ok(pages.every(page => page.reduce((sum, note) => sum + blockLines(note, geometry), 0) <= geometry.lines - 1));
});
