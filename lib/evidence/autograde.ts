import {isChemicalFormula,plainChemicalText} from '../chemistry.ts';
import type { AudioSpec, StructuredAnswerKey } from '../contracts/lesson-package-v3.ts';
import type { AnswerKey } from '../contracts/lesson-items.ts';
import { ApiError } from '../api-error.ts';
import { parseNumericAnswer, readNumericAnswer } from '../lesson-v2/numeric.ts';
import { gradeDictation } from './dictation.ts';
import { normalizeText } from './normalize-text.ts';

export type AutoGrade = { result: 'correct' | 'partial' | 'incorrect'; score: number; feedback: string };
export function autoGrade(key: AnswerKey, answer: string, lang?: AudioSpec['lang']): AutoGrade {
  if (key.type === 'dictation') {
    const grade = gradeDictation(key, answer, lang);
    const feedback = [
      grade.result === 'correct' ? 'Đúng.' : 'Nghe lại và kiểm tra những chỗ sau.',
      grade.missing.length ? `Thiếu: ${grade.missing.join(', ')}.` : '',
      grade.extra.length ? `Thừa: ${grade.extra.join(', ')}.` : '',
      grade.wrong.length ? `Sai: ${grade.wrong.map(word => `${word.actual} → ${word.expected}`).join(', ')}.` : '',
    ].filter(Boolean).join(' ');
    // Stored grades require a score between zero and one even when WER exceeds one.
    return { result: grade.result, score: Math.max(0, grade.score), feedback: feedback.slice(0, 1500) };
  }
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
    const actual = readNumericAnswer(answer);
    if (actual && 'clarification' in actual) throw new ApiError(422, actual.clarification);
    const expected = parseNumericAnswer(key.value);
    const unit = key.unit ?? expected?.unit ?? '';
    correct =
      !!actual &&
      !!expected &&
      Math.abs(actual.value - expected.value) <= key.tolerance + Number.EPSILON * Math.max(1, Math.abs(expected.value)) * 4 &&
      (!actual.unit || actual.unit.normalize('NFC') === unit.normalize('NFC'));
  } else {
    const chemistry=key.caseSensitive&&key.accepted.some(c=>isChemicalFormula(plainChemicalText(c)));
    const normalize = (text: string) => normalizeText(chemistry ? plainChemicalText(text) : text, { ignoreCase: !key.caseSensitive });
    const value = normalize(answer);
    correct = key.accepted.some(candidate => normalize(candidate) === value);
  }
  return {
    result: correct ? 'correct' : 'incorrect',
    score: correct ? 1 : 0,
    feedback: correct ? 'Đúng.' : 'Chưa đúng. Đọc lại đề và thử sửa nhé.',
  };
}

/** Structured responses use an array in prompt order, or a map from left to right IDs for matching. */
export function autoGradeStructured(key: StructuredAnswerKey, answer: string): AutoGrade {
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
