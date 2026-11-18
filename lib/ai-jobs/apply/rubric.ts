import type {AssessContext, AssessResult} from '../../contracts/ai-common.ts';

type Grade = AssessResult['grades'][number];
type Attempt = AssessContext['attempts'][number];
export type RubricIssue = {path: string; code: string; detail: string; message: string};

/** The same rubric checks for both saved submissions and synthetic calibration. */
export function rubricIssues(g: Grade, a: Attempt, path: string): RubricIssue[] {
  const issues: RubricIssue[] = [];
  const add = (p: string, detail: string, message: string) => issues.push({path:p,code:'schema',detail,message});
  const rubric = a.rubric ?? [];
  if (g.result === 'ungradable') {
    if (!g.feedback.trim() || g.score !== 0) add(path,'ungradable_score','Câu không chấm được cần lý do và score 0.');
    return issues;
  }
  if (g.rubricScores.length !== rubric.length || new Set(g.rubricScores.map(r => r.criterion)).size !== rubric.length)
    add(path + '/rubricScores','rubric_count','Cần điểm cho đúng từng tiêu chí rubric.');
  let points = 0, max = 0;
  for (const r of g.rubricScores) {
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
