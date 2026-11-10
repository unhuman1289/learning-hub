import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyCsv, historyMarkdown } from '../lib/history.ts';

const row = {
  day: '2026-11-10',
  subject: 'Deutsch',
  lesson: 'Modalverb',
  itemId: 'i5',
  prompt: 'Viết 3 câu',
  answer: '=HYPERLINK("x") Am Samstag "kann" ich',
  attemptNo: 1,
  support: 'none',
  result: 'partial',
  score: 0.5,
  feedback: 'Xem vị trí động từ.',
  correction: null,
  grader: 'ai',
};

test('history CSV quotes every cell and neutralises formulas from learner text', () => {
  const csv = historyCsv([row]);
  assert(csv.startsWith('﻿"day","subject"'));
  assert.match(csv, /"'=HYPERLINK\(""x""\) Am Samstag ""kann"" ich"/);
  assert.match(csv, /"partial","0.5","Xem vị trí động từ.","","ai"\r\n$/);
});

test('history Markdown groups by lesson and never prints a hidden correction', () => {
  const md = historyMarkdown('Ếch', [row, { ...row, itemId: 'i6', result: 'correct', correction: 'Am Samstag kann ich lange schlafen.' }]);
  assert.match(md, /^# Lịch sử làm bài — Ếch/);
  assert.equal(md.split('## 2026-11-10 · Deutsch · Modalverb').length, 2);
  assert.match(md, /\*\*i5\*\* \(lần 1\) — Một phần/);
  assert.equal(md.split('Lời giải:').length, 2);
});
