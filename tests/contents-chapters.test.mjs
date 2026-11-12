import test from "node:test";
import assert from "node:assert/strict";
import { notebookChapters } from "../lib/lesson-v2/notebook-chapters.ts";
import { pageBlocks, pageGeometry } from "../app/hub/notebook/page-blocks.ts";

test("chapters use Berlin dates across midnight and the repeated DST hour", () => {
  const row = (id, assignedDate) => ({ id, assignedDate, firstMonth: "2026-08", minutes: 10, correct: 1, graded: 2 });
  const chapters = notebookChapters([
    row("nov", "2026-10-31T23:01Z"),
    row("oct", "2026-10-31T22:59Z"),
    row("summer", "2026-10-25T00:30Z"),
    row("winter", "2026-10-25T01:30Z"),
    row("aug", "2026-08-24"),
  ]);
  assert.deepEqual(chapters.map(c => [c.month, c.chapter]), [["2026-11", 4], ["2026-10", 3], ["2026-08", 1]]);
  assert.deepEqual(chapters[1].entries.map(entry => entry.day), ["2026-10-31", "2026-10-25", "2026-10-25"]);
  assert.deepEqual(chapters[1].total, { minutes: 30, correct: 3, graded: 6 });
  assert.deepEqual(notebookChapters([]), []);
});

test("a new chapter starts on a fresh page even when the previous one has space", () => {
  const blocks = ["nov", "oct"].flatMap(id => [
    { id, kind: "notebook", breakBefore: true, reservedLines: 1 },
    { id: id + "-lesson", kind: "notebook", reservedLines: 2 },
  ]);
  assert.deepEqual(pageBlocks(blocks, pageGeometry(1280, 640, false)).map(page => page.map(block => block.id)), [
    ["nov", "nov-lesson"], ["oct", "oct-lesson"],
  ]);
});
