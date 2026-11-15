import type { AudioSpec } from '../contracts/lesson-package-v3.ts';
import type { AnswerKey } from '../contracts/lesson-items.ts';
import { normalizeText } from './normalize-text.ts';
import { pinyinSyllables } from './pinyin.ts';

type DictationKey = Extract<AnswerKey, { type: 'dictation' }>;

export function gradeDictation(key: DictationKey, answer: string, lang?: AudioSpec['lang']) {
  const chinese = lang === 'zh-CN' || (lang === undefined && !!key.pinyin);
  const pinyin = chinese && !/\p{Script=Han}/u.test(answer) ? key.pinyin : undefined;
  const ignorePunctuation = key.ignore.includes('punctuation');
  function tokenize(value: string) {
    if (pinyin) {
      // Apostrophes mark syllable boundaries. Also keep a boundary at ignored punctuation.
      value = value.replace(/u:/g, 'ü').replace(/U:/g, 'Ü').replace(/['’]/g, ' ');
      if (ignorePunctuation) value = value.replace(/\p{P}/gu, ' ');
    }
    const normalized = normalizeText(value, {
      ignoreCase: key.ignore.includes('case'),
      punctuation: ignorePunctuation ? 'ignore' : 'keep',
    });
    if (pinyin) return pinyinSyllables(normalized);
    if (chinese) return Array.from(normalized.replace(/\s/g, ''));
    return normalized.split(' ').filter(Boolean);
  }

  const expected = tokenize(pinyin ?? key.text);
  const actual = tokenize(answer);
  const variants = (key.variants ?? []).map(group => new Set(group.flatMap(value => {
    const tokens = tokenize(value);
    return tokens.length === 1 ? tokens : [];
  })));
  const equivalent = (left: string, right: string) =>
    left === right || variants.some(group => group.has(left) && group.has(right));

  const distances = [Uint16Array.from({ length: actual.length + 1 }, (_, j) => j)];
  for (const [index, word] of expected.entries()) {
    const previous = distances[index];
    const row = new Uint16Array(actual.length + 1);
    row[0] = index + 1;
    for (let j = 1; j < row.length; j++) {
      row[j] = equivalent(word, actual[j - 1]) ? previous[j - 1]
        : 1 + Math.min(previous[j - 1], previous[j], row[j - 1]);
    }
    distances.push(row);
  }

  const missing: string[] = [];
  const extra: string[] = [];
  const wrong: { expected: string; actual: string }[] = [];
  let i = expected.length;
  let j = actual.length;
  const edits = distances[i][j];
  while (i || j) {
    const distance = distances[i][j];
    if (i && j && distance === distances[i - 1][j - 1] + Number(!equivalent(expected[i - 1], actual[j - 1]))) {
      if (distance !== distances[i - 1][j - 1]) wrong.push({ expected: expected[i - 1], actual: actual[j - 1] });
      i--;
      j--;
    } else if (i && distance === distances[i - 1][j] + 1) {
      missing.push(expected[--i]);
    } else {
      extra.push(actual[--j]);
    }
  }
  const wer = edits / Math.max(1, expected.length);
  const result = wer === 0 ? 'correct' : wer <= 0.25 ? 'partial' : 'incorrect';
  return { result, score: 1 - wer, wer, missing: missing.reverse(), extra: extra.reverse(), wrong: wrong.reverse() } as const;
}
