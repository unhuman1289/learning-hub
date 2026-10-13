import type { AnswerKey } from '../contracts/lesson-package-v2.ts';
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
    const value = normalizeText(answer);
    correct = key.accepted.some((candidate) =>
      key.caseSensitive
        ? normalizeText(candidate) === value
        : normalizeText(candidate).toLocaleLowerCase('de-DE') === value.toLocaleLowerCase('de-DE'),
    );
  }
  return {
    result: correct ? 'correct' : 'incorrect',
    score: correct ? 1 : 0,
    feedback: correct ? 'Đúng theo đáp án.' : 'Chưa khớp đáp án. Xem lời giải rồi thử sửa lại.',
  };
}
