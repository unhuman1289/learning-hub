import test from "node:test";
import assert from "node:assert/strict";
import { pageBlocks } from "../app/hub/notebook/page-blocks.ts";

for (const size of [1, 3, 6, 10, 25]) test(`keeps ${size} questions intact and the summary last`, () => {
  const items = Array.from({ length: size }, (_, index) => ({ id: String(index), kind: "item", long: index === 2 }));
  const blocks = [{ id: "head", kind: "head" }, ...items, { id: "summary", kind: "summary" }];
  const pages = pageBlocks(blocks, 3);
  assert.deepEqual(pages.flat(), blocks);
  assert.deepEqual(pages.at(-1), [blocks.at(-1)]);
  if (size >= 3) assert.deepEqual(pages.find(page => page.includes(items[2])), [items[2]]);
});
