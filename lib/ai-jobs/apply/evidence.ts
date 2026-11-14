import type { AssessResult } from '../../contracts/ai-common.ts';

function normalizeQuote(text: string) {
  return text.normalize('NFC').replace(/[\s\p{White_Space}]+/gu, ' ').trim();
}

export function checkGradeEvidence(grade: AssessResult['grades'][number], answer: string, hasPhoto: boolean) {
  const normalizedAnswer = normalizeQuote(answer);
  let invalid = false;
  let unverified = false;
  const errors = grade.errors.map((error) => {
    const quote = normalizeQuote(error.evidence);
    if (quote && normalizedAnswer.includes(quote)) return error;
    if (!quote || !hasPhoto) {
      invalid = true;
      return error;
    }
    unverified = true;
    return { ...error, unverified: true };
  });
  const notice = 'chưa đối chiếu được với bài viết tay';
  const feedback = unverified ? [grade.feedback, notice].filter(Boolean).join('\n\n') : grade.feedback;
  return { invalid, errors, feedback };
}
