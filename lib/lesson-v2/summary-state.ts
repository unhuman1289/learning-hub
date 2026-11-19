export type SummaryAttempt = { result: string | null } | undefined;
export function summaryState(attempts: SummaryAttempt[], waiting: boolean) {
  const corrections = attempts.flatMap((a, index) => a?.result === 'incorrect' || a?.result === 'partial' ? [index] : []);
  const correct = attempts.filter(a => a?.result === 'correct').length;
  const graded = !waiting && !attempts.some(a => a && !a.result) && attempts.some(a => !!a?.result);
  return { graded, corrections, correct };
}

export function summaryScore(correct: number, graded: number, total: number, blank: number) {
  return blank ? `${correct}/${graded} câu đã làm đúng · ${blank} câu chưa làm` : `${correct}/${total} câu đúng`;
}
