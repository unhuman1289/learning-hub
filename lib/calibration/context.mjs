import { assessContext } from '../contracts/ai-common.ts';
import { contextHash } from '../ai-jobs/context/common.ts';

/** Build one synthetic assessment context per reviewed submission. */
export async function calibrationContext(fixture, submission, jobId) {
  const attempts = Object.entries(submission.answers).map(([itemId, answer]) => {
    const item = fixture.items[itemId];
    if (!item) throw new Error('Calibration item missing');
    return {
      attemptId: `att_${submission.id}_${itemId}`, itemId, stage: 'independent', activity: 'create',
      input: item.input ?? 'long', skills: item.skills, prompt: item.prompt, rubric: item.rubric ?? null,
      solution: item.solution, key: null, answer: answer.answer, attachments: [], support: 'none',
      attemptNo: 1, previousAttempts: [], autoGrade: null,
    };
  });
  const skillIds = [...new Set(attempts.flatMap(attempt => attempt.skills))];
  const context = {
    contract: 'assess-context/1', jobId, purpose: 'submission',
    learner: {ref: 'lrn_000000000000', displayName: 'Người học', role: 'adult', explainLanguage: 'vi', personalPrompt: ''},
    subject: {subjectId: 'sub_eval', title: 'Deutsch', goal: 'Viết và giao tiếp tiếng Đức', level: 'A2', instructions: '', sensitivity: 'normal'},
    lesson: {lessonId: 'les_eval', template: 'skill', ...fixture.lesson},
    attempts,
    skills: skillIds.map((skillId, pathOrder) => ({skillId, key: skillId.slice(4), name: skillId.slice(4), pathOrder,
      prerequisites: [], status: 'active', mastery: 'developing', masteryCeiling: 'developing',
      dims: {knowledge: 1, recognition: 1, application: 1, retention: 0}, exposure14d: {}, stuckOn: null,
      nextReviewDay: null, reviewKind: null, maintained: false})),
    openErrorPatterns: [], recentEvidence: [], recheck: null, calibration: [], truncated: [],
  };
  return assessContext.parse({...context, contextHash: await contextHash(context)});
}
