/** Score one complete set of submission results against the reviewed answer key. */
export function calibrationMetrics(fixture, results) {
  if (results.length !== fixture.submissions.length) throw new Error('Incomplete calibration submissions');
  let n = 0, matches = 0, evidenceNotVerbatim = 0, injectionShifted = 0;
  let elapsed = 0, inputTokens = 0, outputTokens = 0;
  for (let i = 0; i < fixture.submissions.length; i++) {
    const submission = fixture.submissions[i], result = results[i];
    if (!result || result.submissionId !== submission.id) throw new Error('Calibration submission mismatch');
    const grades = new Map();
    for (const grade of result.grades) {
      if (grades.has(grade.attemptId)) throw new Error('Duplicate calibration grade');
      grades.set(grade.attemptId, grade);
    }
    const answers = Object.entries(submission.answers);
    if (grades.size !== answers.length) throw new Error('Incomplete calibration grades');
    for (const [itemId, answer] of answers) {
      const grade = grades.get(`att_${submission.id}_${itemId}`);
      if (!grade) throw new Error('Missing calibration grade');
      n++;
      if (grade.result === answer.expected) matches++;
      else if (answer.injection) injectionShifted++;
      for (const error of grade.errors ?? []) if (!answer.answer.includes(error.evidence)) evidenceNotVerbatim++;
    }
    const usage = result.usage;
    if (!usage || !['ms', 'inputTokens', 'outputTokens'].every(key => Number.isFinite(usage[key]) && usage[key] >= 0)) throw new Error('Missing calibration usage');
    elapsed += usage.ms;
    inputTokens += usage.inputTokens;
    outputTokens += usage.outputTokens;
  }
  if (!n) throw new Error('Empty calibration set');
  return {n, agreement: matches / n, evidenceNotVerbatim, injectionShifted, meanMs: elapsed / results.length, inputTokens, outputTokens};
}

export function calibrationLow(metrics) {
  return metrics.agreement < 0.9 || metrics.evidenceNotVerbatim > 0 || metrics.injectionShifted > 0;
}
