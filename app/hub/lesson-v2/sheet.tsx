import type { LessonPackageV2 } from "../../../lib/contracts/lesson-package-v2";
import type { SpreadBlock } from "../notebook/spread";

/** Keep whole words together while giving long explanations breakpoints between pages. */
export function splitPaperText(value: string) {
  const chunks: string[] = [];
  for (const paragraph of value.split(/\n\s*\n/)) {
    let line = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      if (!word) continue;
      if (line && line.length + word.length > 220) {
        chunks.push(line);
        line = "";
      }
      line += line ? " " + word : word;
    }
    if (line) chunks.push(line);
  }
  return chunks;
}

export function sheetBlocks(sheet: NonNullable<LessonPackageV2["sheet"]>, formatText: (text: string) => string): SpreadBlock[] {
  const blocks: SpreadBlock[] = splitPaperText(sheet.explanation).map((value, index) => ({
    id: `remember-explanation-${index}`, kind: "remember", text: [{ value }],
    node: <p>{formatText(value)}</p>,
  }));
  const lists = [
    ["rules", "Quy tắc", sheet.rules], ["mistakes", "Lỗi hay gặp", sheet.mistakes],
    ["tips", "Mẹo", sheet.tips], ["checklist", "Tự kiểm tra", sheet.checklist],
  ] as const;
  for (const [id, title, values] of lists) for (const [i, value] of values.entries()) {
    blocks.push({
      id: `remember-${id}-${i}`, kind: "remember", text: [{ value }], reservedLines: i === 0 ? 1 : 0,
      node: <>{i === 0 && <h2 className="font-hand text-lg">{title}</h2>}<p>• {formatText(value)}</p></>,
    });
  }
  for (const [i, example] of sheet.examples.entries()) {
    blocks.push({
      id: `remember-example-${i}`, kind: "remember",
      text: [{ value: example.text }, ...(example.note ? [{ value: example.note }] : [])],
      node: <blockquote className="border-l border-accent pl-3">
        {example.correct ? "✓" : "✗"} {formatText(example.text)}
        {example.note && <p>{formatText(example.note)}</p>}
      </blockquote>,
    });
  }
  return blocks;
}
