import { hiddenCorrection } from './evidence/submit.ts';

type Db = {
  prepare(sql: string): { bind(...values: unknown[]): { all<T = Record<string, unknown>>(): Promise<{ results?: T[] }> } };
};

export type HistoryRow = {
  day: string;
  subject: string;
  lesson: string;
  itemId: string;
  prompt: string;
  answer: string;
  attemptNo: number;
  support: string;
  result: string | null;
  score: number | null;
  feedback: string | null;
  correction: string | null;
  grader: string | null;
};

/**
 * One profile's graded work, newest first (L5.6). The two-step correction rule applies here too, so history never
 * shows a fix the lesson page still hides.
 */
export async function readHistory(db: Db, learnerId: string, options: { subjectId?: string | null; days?: number; limit?: number } = {}) {
  const days = Math.min(Math.max(options.days ?? 30, 1), 3660),
    limit = Math.min(Math.max(options.limit ?? 200, 1), 2000);
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { results = [] } = await db
    .prepare(
      `SELECT a.day,s.title AS subject,json_extract(l.payload,'$.title') AS lesson,a.item_id,json_extract(i.payload,'$.prompt') AS prompt,a.answer,a.attempt_no,a.support,
 g.result,g.score,g.feedback,g.correction,g.grader,l.support AS lesson_support
 FROM attempts a JOIN subjects s ON s.id=a.subject_id JOIN learning_lessons l ON l.id=a.lesson_id
 LEFT JOIN lesson_items i ON i.lesson_id=a.lesson_id AND i.item_id=a.item_id LEFT JOIN grades g ON g.id=a.current_grade_id
 WHERE a.learner_id=? AND a.day>=? AND (? IS NULL OR a.subject_id=?) AND a.status<>'void'
 ORDER BY a.day DESC,a.created_at DESC LIMIT ?`,
    )
    .bind(learnerId, from, options.subjectId ?? null, options.subjectId ?? null, limit)
    .all<Record<string, unknown>>();
  return results.map((r): HistoryRow => {
    const hidden = hiddenCorrection(r, JSON.parse(String(r.lesson_support ?? '{}')) as Record<string, string>);
    return {
      day: String(r.day),
      subject: String(r.subject),
      lesson: String(r.lesson ?? ''),
      itemId: String(r.item_id),
      prompt: String(r.prompt ?? ''),
      answer: String(r.answer),
      attemptNo: Number(r.attempt_no),
      support: String(r.support),
      result: (r.result as string) ?? null,
      score: r.score === null || r.score === undefined ? null : Number(r.score),
      feedback: (r.feedback as string) ?? null,
      correction: hidden.correctionHidden ? null : ((r.correction as string) ?? null),
      grader: (r.grader as string) ?? null,
    };
  });
}

const resultText: Record<string, string> = { correct: 'Đúng', partial: 'Một phần', incorrect: 'Chưa đúng', ungradable: 'Chưa chấm được' };

export function historyCsv(rows: HistoryRow[]) {
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    // Quote everything and neutralise spreadsheet formulas in learner text.
    return '"' + (/^[=+\-@]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"';
  };
  const header = [
    'day',
    'subject',
    'lesson',
    'item',
    'prompt',
    'answer',
    'attempt',
    'support',
    'result',
    'score',
    'feedback',
    'correction',
    'grader',
  ];
  return (
    '﻿' +
    [
      header,
      ...rows.map((r) => [
        r.day,
        r.subject,
        r.lesson,
        r.itemId,
        r.prompt,
        r.answer,
        r.attemptNo,
        r.support,
        r.result,
        r.score,
        r.feedback,
        r.correction,
        r.grader,
      ]),
    ]
      .map((line) => line.map(cell).join(','))
      .join('\r\n') +
    '\r\n'
  );
}

export function historyMarkdown(name: string, rows: HistoryRow[]) {
  const out = [`# Lịch sử làm bài — ${name}`, ''];
  let lesson = '';
  for (const r of rows) {
    const heading = `${r.day} · ${r.subject} · ${r.lesson}`;
    if (heading !== lesson) {
      out.push(`## ${heading}`, '');
      lesson = heading;
    }
    out.push(
      `**${r.itemId}** (lần ${r.attemptNo}${r.support !== 'none' ? ', có hỗ trợ' : ''}) — ${r.result ? (resultText[r.result] ?? r.result) : 'Đang chờ chấm'}`,
    );
    if (r.prompt) out.push(`> ${r.prompt.replaceAll('\n', '\n> ')}`);
    out.push('', 'Bài làm: ' + r.answer);
    if (r.feedback) out.push('', 'Lời phê: ' + r.feedback);
    if (r.correction) out.push('', 'Lời giải: ' + r.correction);
    out.push('');
  }
  return out.join('\n');
}
