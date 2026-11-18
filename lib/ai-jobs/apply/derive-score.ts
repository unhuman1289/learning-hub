import {matchRubricScores} from './rubric.ts';
import {lessonItem} from '../../contracts/lesson-items.ts';
import type {AssessContext, AssessResult} from '../../contracts/ai-common.ts';

export type CleanupCode = 'auto_diagnosis' | 'rubric_max' | 'check_item' | 'mastery_proposal';
/** Clean auxiliary fields without changing earned points or inventing evidence. */
export function deriveAssessScores(input: unknown, context: AssessContext, onCleanup: (code: CleanupCode) => void = () => {}): unknown {
  if (!input || typeof input !== 'object') return input;
  const body = structuredClone(input) as AssessResult;
  if (Array.isArray(body.diagnosis)) body.diagnosis = body.diagnosis.filter(d => {
    if (d && context.attempts.some(a => a.attemptId === d.attemptId)) { onCleanup('auto_diagnosis'); return false; }
    return true;
  });
  if (!Array.isArray(body.grades)) return body;
  for (const grade of body.grades) {
    if (!grade) continue;
    const attempt = context.attempts.find(a => a.attemptId === grade.attemptId);
    if (!attempt) continue;
    if (grade.checkItem) {
      const parsed = lessonItem.safeParse(grade.checkItem);
      if (!parsed.success || parsed.data.skills.some(id => !attempt.skills.includes(id)) || context.attempts.some(a => a.itemId === parsed.data.id)) {
        grade.checkItem = null; onCleanup('check_item');
      }
    }
    if (grade.result === 'ungradable' || !Array.isArray(grade.rubricScores)) continue;
    if (!attempt.rubric?.length || grade.rubricScores.length !== attempt.rubric.length ||
      grade.rubricScores.some(r => !r || typeof r.criterion !== 'string' || !Number.isFinite(r.points))) continue;
    const scores = matchRubricScores(grade, attempt);
    const corrected = scores.map(r => {
      const expected = attempt.rubric!.find(x => x.criterion === r.criterion);
      if (!expected) return r;
      if (r.max !== expected.points) onCleanup('rubric_max');
      return {...r, max: expected.points};
    });
    if (corrected.some(r => {const expected=attempt.rubric!.find(x=>x.criterion===r.criterion);return !expected || r.points<0 || r.points>r.max;})) continue;
    const max=corrected.reduce((n,r)=>n+r.max,0), points=corrected.reduce((n,r)=>n+r.points,0);
    if (!max) continue;
    grade.rubricScores=corrected;
    grade.score=points/max;
    grade.result=points===0?'incorrect':points===max?'correct':'partial';
  }
  if (Array.isArray(body.masteryProposals)) body.masteryProposals = body.masteryProposals.filter(proposal => {
    if (!proposal || typeof proposal.skillId !== 'string' || !Array.isArray(proposal.evidenceAttemptIds)) return true;
    const knownSkill = context.skills.some(skill => skill.skillId === proposal.skillId);
    const validEvidence = proposal.evidenceAttemptIds.every(id => context.attempts.some(attempt =>
      attempt.attemptId === id && attempt.skills.includes(proposal.skillId) &&
      (!!attempt.autoGrade || body.grades.some(grade => grade?.attemptId === id && grade.result !== 'ungradable'))
    ) || context.recentEvidence.some(evidence => evidence.attemptId === id && evidence.skillId === proposal.skillId));
    if (!knownSkill || !validEvidence) { onCleanup('mastery_proposal'); return false; }
    return true;
  });
  return body;
}
