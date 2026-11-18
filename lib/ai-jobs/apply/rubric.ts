import type {AssessContext, AssessResult} from '../../contracts/ai-common.ts';

type Grade = AssessResult['grades'][number];
type Attempt = AssessContext['attempts'][number];
export type RubricIssue = {path: string; code: string; detail: string; message: string};

/** Return scores with rubric-owned names; positional fallback is used only when counts agree. */
export function matchRubricScores(g: Grade, a: Attempt) {
  const rubric = a.rubric ?? [], scores = g.rubricScores;
  if (scores.length !== rubric.length) return scores;
  const key = (text: string) => text.normalize('NFC').replace(/\s+/gu, ' ').trim().replace(/[\p{P}\p{S}]+$/gu, '').trim().toLocaleLowerCase('und');
  const remaining = new Set(rubric.map((_, i) => i));
  const matches = scores.map(row => {
    const candidates = [...remaining].filter(i => key(rubric[i].criterion) === key(row.criterion));
    if (candidates.length !== 1) return -1;
    remaining.delete(candidates[0]);
    return candidates[0];
  });
  const order = matches.every(i => i >= 0) ? matches : scores.map((_, i) => i);
  return scores.map((row, i) => ({...row, criterion: rubric[order[i]].criterion}));
}

/** The same rubric checks for both saved submissions and synthetic calibration. */
export function rubricIssues(g: Grade, a: Attempt, path: string): RubricIssue[] {
  const issues: RubricIssue[] = [];
  const add = (p: string, detail: string, message: string) => issues.push({path:p,code:'schema',detail,message});
  const rubric = a.rubric ?? [];
  if (g.result === 'ungradable') {
    if (!g.feedback.trim() || g.score !== 0) add(path,'ungradable_score','Câu không chấm được cần lý do và score 0.');
    return issues;
  }
  if (g.rubricScores.length !== rubric.length)
    add(path + '/rubricScores','rubric_count','Cần điểm cho đúng từng tiêu chí rubric.');
  const scores = matchRubricScores(g, a);
  let points = 0, max = 0;
  for (const r of scores) {
    const expected = rubric.find(x => x.criterion === r.criterion);
    if (!expected || r.max !== expected.points || r.points > r.max)
      add(path + '/rubricScores','rubric_criterion','Tiêu chí hoặc số điểm không khớp rubric.');
    points += r.points; max += r.max;
  }
  if (!max || Math.abs(points / max - g.score) > 0.001 ||
      (g.result === 'correct' && g.score !== 1) || (g.result === 'incorrect' && g.score !== 0) ||
      (g.result === 'partial' && (g.score <= 0 || g.score >= 1)))
    add(path,'rubric_score','Kết quả phải nhất quán với điểm rubric.');
  return issues;
}
