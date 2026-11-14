import type { ItemView } from "../../../lib/lesson-v2/store";

type GroupableItem = Pick<ItemView, "input" | "attachment" | "prompt" | "instructions" | "choices">;

/** Short exercises share a page. Substantial prompts and work surfaces get their own page. */
export function lessonGroups(items: GroupableItem[]) {
  const groups: number[][] = [];
  let compact: number[] = [];
  for (const [offset, item] of items.entries()) {
    const number = offset + 1;
    const textLength = item.prompt.length + (item.instructions?.length ?? 0) +
      (item.choices ?? []).reduce((length, choice) => length + choice.text.length, 0);
    const short = (item.input === "choice" || item.input === "short") && item.attachment === "none" &&
      textLength <= 360 && (item.choices?.length ?? 0) <= 4;
    if (!short) {
      groups.push([number]);
      compact = [];
    } else {
      if (!compact.length || compact.length === 3) {
        compact = [];
        groups.push(compact);
      }
      compact.push(number);
    }
  }
  return groups;
}
