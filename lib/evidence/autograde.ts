import {isChemicalFormula,plainChemicalText} from '../chemistry.ts';
import type { StructuredAnswerKey } from '../contracts/lesson-package-v3.ts';
import type { AnswerKey } from '../contracts/lesson-items.ts';
import { parseNumericAnswer } from '../lesson-v2/numeric.ts';
export type AutoGrade = { result: 'correct' | 'incorrect'; score: number; feedback: string };
const normalizeText = (value: string) =>
  value
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!?。]+$/u, '')
    .trim();
export function autoGrade(key: AnswerKey, answer: string): AutoGrade {
  let correct = false;
  if (key.type === 'choice') {
    let selected: unknown;
    try {
      selected = JSON.parse(answer);
    } catch {
      selected = /^[a-f]$/.test(answer.trim()) ? [answer.trim()] : null;
    }
    if (typeof selected === 'string') selected = [selected];
    correct =
      Array.isArray(selected) &&
      selected.every((x) => typeof x === 'string') &&
      new Set(selected).size === selected.length &&
      JSON.stringify([...selected].sort()) === JSON.stringify([...key.correct].sort());
  } else if (key.type === 'numeric') {
    const actual = parseNumericAnswer(answer),
      expected = parseNumericAnswer(key.value);
    const unit = key.unit ?? expected?.unit ?? '';
    correct =
      !!actual &&
      !!expected &&
      Math.abs(actual.value - expected.value) <= key.tolerance + Number.EPSILON * Math.max(1, Math.abs(expected.value)) * 4 &&
      (!actual.unit || actual.unit.normalize('NFC') === unit.normalize('NFC'));
  } else {
    const chemistry=key.caseSensitive&&key.accepted.some(c=>isChemicalFormula(plainChemicalText(c)));
    const normalize=(text:string)=>normalizeText(chemistry?plainChemicalText(text):text);
    const value = normalize(answer);
    correct = key.accepted.some((candidate) =>
      key.caseSensitive
        ? normalize(candidate) === value
        : normalize(candidate).toLocaleLowerCase('de-DE') === value.toLocaleLowerCase('de-DE'),
    );
  }
  return {
    result: correct ? 'correct' : 'incorrect',
    score: correct ? 1 : 0,
    feedback: correct ? 'Đúng.' : 'Chưa đúng. Đọc lại đề và thử sửa nhé.',
  };
}

/** Structured responses use an array in prompt order, or a map from left to right IDs for matching. */
export function autoGradeStructured(key: StructuredAnswerKey, answer: string): Omit<AutoGrade, "result"> & { result: AutoGrade["result"] | "partial" } {
  let value: unknown;
  try { value = JSON.parse(answer); } catch { value = null; }
  let total: number;
  let correct: number;
  if (key.type === "match") {
    total = key.pairs.length;
    const pairs = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    correct = key.pairs.filter(([left, right]) => Object.hasOwn(pairs, left) && pairs[left] === right).length;
  } else if (key.type === "order") {
    total = key.sequence.length;
    const submitted = Array.isArray(value) ? value : [];
    correct = Math.max(...[key.sequence, ...(key.sequences ?? [])].map(sequence =>
      sequence.filter((expected, index) => submitted[index] === expected).length));
  } else {
    const cells = key.type === "cloze" ? key.blanks : key.type === "label" ? key.labels : key.cells;
    total = cells.length;
    correct = Array.isArray(value) ? cells.filter((cell, index) =>
      typeof value[index] === "string" && autoGrade(cell, value[index]).result === "correct").length : 0;
  }
  const result = correct === total ? "correct" : correct > 0 ? "partial" : "incorrect";
  return { result, score: correct / total, feedback: `Đúng ${correct}/${total} phần.` };
}
