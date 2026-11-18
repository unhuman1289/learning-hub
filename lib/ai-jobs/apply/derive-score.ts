import {matchRubricScores} from './rubric.ts';
import type {AssessContext, AssessResult} from '../../contracts/ai-common.ts';

/** Only derive from structurally sound, complete rubric scores; the validator still checks maxima. */
export function deriveAssessScores(input: unknown, context: AssessContext): unknown {
  if (!input || typeof input !== 'object' || !Array.isArray((input as AssessResult).grades)) return input;
  const body = structuredClone(input) as AssessResult;
  for (const grade of body.grades) {
    if (!grade || grade.result === 'ungradable' || !Array.isArray(grade.rubricScores)) continue;
    const attempt = context.attempts.find(a => a.attemptId === grade.attemptId);
    if (!attempt?.rubric?.length || grade.rubricScores.length !== attempt.rubric.length ||
      grade.rubricScores.some(r => !r || typeof r.criterion !== 'string' || !Number.isFinite(r.points) || !Number.isFinite(r.max))) continue;
    const scores = matchRubricScores(grade, attempt);
    if (scores.some(r => {const expected=attempt.rubric!.find(x=>x.criterion===r.criterion);return !expected || r.max!==expected.points || r.points<0 || r.points>r.max;})) continue;
    const max=scores.reduce((n,r)=>n+r.max,0), points=scores.reduce((n,r)=>n+r.points,0);
    if (!max) continue;
    grade.rubricScores=scores;
    grade.score=points/max;
    grade.result=points===0?'incorrect':points===max?'correct':'partial';
  }
  return body;
}
