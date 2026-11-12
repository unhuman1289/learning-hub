export type PageBlock = { id: string; kind: "head" | "remember" | "item" | "product" | "summary"; long?: boolean };

export function pageBlocks<T extends PageBlock>(blocks: T[], perPage: number, measurement?: { heights: Record<string, number>; limit: number }) {
  const pages: T[][] = [];
  let questions: T[] = [];
  let height = 0;
  function flush() {
    if (questions.length) pages.push(questions);
    questions = [];
    height = 0;
  }
  for (const block of blocks) {
    if (block.kind !== "item" || block.long) {
      flush();
      pages.push([block]);
    } else {
      const blockHeight = measurement?.heights[block.id] ?? 0;
      if (measurement && questions.length && height + 16 + blockHeight > measurement.limit) flush();
      height += blockHeight + (questions.length ? 16 : 0);
      questions.push(block);
      if (questions.length >= perPage) flush();
    }
  }
  flush();
  return pages;
}
