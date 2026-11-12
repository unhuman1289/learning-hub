type Text = { value: string; handwriting?: boolean };
export type PageBlock = {
  id: string;
  kind: "head" | "remember" | "item" | "product" | "summary";
  text?: Text[];
  reservedLines?: number;
  long?: boolean;
  extraLine?: boolean;
};

export function pageGeometry(width: number, availableHeight: number, child: boolean, measuredWidth?: number) {
  const double = width >= 1024;
  const line = child ? 32 : 28;
  const widthLimit = double ? Math.min(512, (width - 128) / 2)
    : width >= 640 ? Math.min(640, width - 48) : width - 16;
  const pageWidth = Math.min(widthLimit, measuredWidth ?? widthLimit);
  return {
    double,
    line,
    lines: Math.min(26, Math.max(1, Math.floor(availableHeight / line) - 2)),
    width: pageWidth,
    textWidth: Math.max(100, pageWidth - (width >= 640 ? 72 : 56)),
    font: child ? 19 : 17,
  };
}

type Geometry = ReturnType<typeof pageGeometry>;

export function blockLines(block: PageBlock, { textWidth, font }: Geometry) {
  const lines = (block.text ?? []).reduce((sum, { value, handwriting }) => {
    const chars = Math.max(1, Math.floor(textWidth / (font * (handwriting ? 0.6 : 0.52))));
    return sum + value.split("\n").reduce((count, line) => count + Math.max(1, Math.ceil(line.length / chars)), 0);
  }, 0);
  return lines + (block.reservedLines ?? 0) + Number(!!block.extraLine);
}

export function pageBlocks<T extends PageBlock>(blocks: T[], geometry: Geometry) {
  const pages: T[][] = [];
  let current: T[] = [];
  let used = 0;
  const capacity = Math.max(1, geometry.lines - 1);
  function flush() {
    if (current.length) pages.push(current);
    current = [];
    used = 0;
  }
  for (const block of blocks) {
    const size = blockLines(block, geometry);
    if (block.long || block.kind === "summary" || size > capacity) {
      flush();
      pages.push([block]);
      continue;
    }
    if (used + size > capacity) flush();
    current.push(block);
    used += size;
  }
  flush();
  return pages;
}

export function initialLessonBlock({ completed, hasWork, correction, firstUnanswered }: {
  completed: boolean; hasWork: boolean; correction: number; firstUnanswered: number;
}) {
  if (completed) return "summary";
  if (correction >= 0) return `cau-${correction + 1}`;
  if (!hasWork) return "head";
  return firstUnanswered >= 0 ? `cau-${firstUnanswered + 1}` : "summary";
}
