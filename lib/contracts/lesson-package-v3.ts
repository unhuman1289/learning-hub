import { z } from "zod/v4";
import { lessonItem, lessonPackageV2, rubricCriterion, textKey, numericKey } from "./lesson-items.ts";

const text = (limit: number) => z.string().trim().min(1).max(limit);
const id = z.string().regex(/^[a-z0-9_-]{1,30}$/);
const cell = z.union([textKey, numericKey]);
const clozeKey = z.object({ type: z.literal("cloze"), blanks: z.array(textKey).min(1).max(6) }).strict();
const matchKey = z.object({ type: z.literal("match"), pairs: z.array(z.tuple([id, id])).min(2).max(8) }).strict();
const orderSequence = z.array(id).min(2).max(8);
const orderKey = z.object({
  type: z.literal("order"),
  sequence: orderSequence,
  sequences: z.array(orderSequence).min(1).max(4).optional(),
}).strict();
const labelKey = z.object({ type: z.literal("label"), labels: z.array(textKey).min(1).max(8) }).strict();
const tableKey = z.object({ type: z.literal("table"), cells: z.array(cell).min(1).max(36) }).strict();
export const structuredAnswerKey = z.discriminatedUnion("type", [clozeKey, matchKey, orderKey, labelKey, tableKey]);
export type StructuredAnswerKey = z.infer<typeof structuredAnswerKey>;

const mark = z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }).strict();
const step = z.object({ id, text: text(150) }).strict();
const figureName = z.enum(["animal-cell", "plant-cell", "dna", "heart"]);
const figure = z.discriminatedUnion("type", [
  z.object({ type: z.literal("flow"), description: text(400), steps: z.array(step).min(2).max(12),
    edges: z.array(z.tuple([id, id])).max(24) }).strict(),
  z.object({ type: z.literal("cycle"), description: text(400), steps: z.array(step).min(2).max(12) }).strict(),
  z.object({ type: z.literal("labelled-image"), description: text(400), image: figureName, marks: z.array(mark).min(1).max(8) }).strict(),
  z.object({ type: z.literal("bar"), description: text(400), columns: z.array(z.object({
    label: text(80), value: z.number().nonnegative().max(1e9),
  }).strict()).min(1).max(12) }).strict(),
]);

const language = z.enum(["rust", "python", "text"]);
const knowledgeBlock = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("table"), headers: z.array(text(120)).min(1).max(6),
    rows: z.array(z.array(text(500)).min(1).max(6)).min(1).max(12) }).strict(),
  z.object({ kind: z.literal("figure"), figure }).strict(),
  z.object({ kind: z.literal("code"), language, code: text(5000),
    notes: z.array(z.object({ line: z.number().int().min(1).max(200), text: text(300) }).strict()).max(16) }).strict(),
  z.object({ kind: z.literal("steps"), steps: z.array(text(500)).min(1).max(12) }).strict(),
]);

const base = lessonItem.omit({ input: true, choices: true, key: true, rubric: true });
const itemV3 = z.union([
  lessonItem,
  base.extend({ input: z.literal("cloze"), fragments: z.array(z.string().max(500)).min(2).max(7), key: clozeKey }),
  base.extend({ input: z.literal("match"), left: z.array(step).min(2).max(8), right: z.array(step).min(2).max(8), key: matchKey }),
  base.extend({ input: z.literal("order"), steps: z.array(step).min(2).max(8), key: orderKey }),
  base.extend({ input: z.literal("label"), image: figureName, description: text(400), marks: z.array(mark).min(1).max(8), key: labelKey }),
  base.extend({ input: z.literal("table"), headers: z.array(text(120)).min(1).max(6), rowLabels: z.array(text(120)).min(1).max(6), key: tableKey }),
  base.extend({ input: z.literal("code"), language, starter: z.string().max(5000), lines: z.number().int().min(6).max(16),
    rubric: z.array(rubricCriterion).min(2).max(5) }),
]);

function permutation(actual: string[], expected: string[]) {
  return actual.length === expected.length && new Set(actual).size === actual.length
    && new Set(expected).size === expected.length && actual.every(value => expected.includes(value));
}

export const lessonPackageV3 = lessonPackageV2.extend({
  contract: z.literal("lesson-package/3"),
  items: z.array(itemV3).min(1).max(25),
  knowledge: z.array(knowledgeBlock).max(12),
}).superRefine((lesson, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
  const ids = lesson.items.map(item => item.id);
  if (new Set(ids).size !== ids.length) issue(["items"], "Mã câu phải khác nhau.");
  for (const [i, item] of lesson.items.entries()) {
    let valid = true;
    switch (item.input) {
      case "cloze": valid = item.key.blanks.length === item.fragments.length - 1; break;
      case "match": valid = permutation(item.key.pairs.map(pair => pair[0]), item.left.map(option => option.id))
        && permutation(item.key.pairs.map(pair => pair[1]), item.right.map(option => option.id)); break;
      case "order": {
        const stepIds = item.steps.map(option => option.id);
        valid = [item.key.sequence, ...(item.key.sequences ?? [])].every(sequence => permutation(sequence, stepIds));
        break;
      }
      case "label": valid = item.marks.length === item.key.labels.length; break;
      case "table": valid = item.headers.length * item.rowLabels.length === item.key.cells.length; break;
    }
    if (!valid) issue(["items", i, "key"], "Đáp án phải khớp số ô hoặc các lựa chọn.");
  }
  for (const [i, block] of lesson.knowledge.entries()) {
    if (block.kind === "table" && block.rows.some(row => row.length !== block.headers.length)) issue(["knowledge", i, "rows"], "Các hàng phải khớp số cột.");
    if (block.kind === "code" && block.notes.some(note => note.line > block.code.split("\n").length)) issue(["knowledge", i, "notes"], "Số dòng nằm ngoài đoạn code.");
    if (block.kind === "figure" && block.figure.type === "flow") {
      const nodes = new Set(block.figure.steps.map(option => option.id));
      if (nodes.size !== block.figure.steps.length || block.figure.edges.some(edge => edge.some(node => !nodes.has(node)))) issue(["knowledge", i, "figure"], "Mũi tên phải nối các bước có trong sơ đồ.");
    }
  }
});

export type LessonPackageV3 = z.infer<typeof lessonPackageV3>;
export const lessonPackage = z.union([lessonPackageV2, lessonPackageV3]);

type Item = LessonPackageV3['items'][number];
type SharedItemFields = 'choices' | 'key' | 'rubric';
type WithOptionalFields<T> = T extends Item ? T & Partial<Record<Exclude<SharedItemFields, keyof T>, never>> : never;
export type LessonItemAny = WithOptionalFields<Item>;
export type LessonPackage = z.infer<typeof lessonPackageV2> | (Omit<LessonPackageV3, 'items'> & { items: LessonItemAny[] });
