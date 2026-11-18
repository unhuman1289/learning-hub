import {processJob} from '../../integrations/home-runner/job.mjs';
import {calibrationContext} from './context.mjs';
import {calibrationMetrics} from './metrics.mjs';

/** Run the real assessment pipeline once per synthetic submission, without repair. */
export async function runCalibration(fixture, jobId, engine, prompt, heartbeat = async () => {}) {
  const results = [], invalidReasons = [];
  for (const submission of fixture.submissions) {
    const context = await calibrationContext(fixture, submission, jobId);
    let saved = null, usage = null, reason = 'post_response_failure';
    const singleEngine = {...engine, async run(input) {
      try {
        const out = await engine.run(input);
        usage = out.usage;
        return out;
      } catch (error) {
        if (error?.invalidOutput && error.usage) { reason = ['invalid_json', 'response_status', 'response_refused', 'response_normalization'].includes(error.invalidCode) ? error.invalidCode : 'invalid_output'; usage = error.usage; }
        throw error;
      }
    }};
    const hub = {
      context: async () => context,
      heartbeat,
      result: async (_lease, result, dry) => {
        const ids = new Set(result.grades.map(grade => grade.attemptId));
        if (ids.size !== context.attempts.length || context.attempts.some(attempt => !ids.has(attempt.attemptId))) {
          reason = 'missing_grade:/grades';
          return {status: 422, body: {errors: [{code: 'missing_grade', path: '/grades'}]}};
        }
        for (const grade of result.grades) {
          const attempt = context.attempts.find(a => a.attemptId === grade.attemptId);
          const rubric = attempt.rubric ?? [];
          const scores = grade.rubricScores;
          const max = scores.reduce((n, row) => n + row.max, 0);
          const points = scores.reduce((n, row) => n + row.points, 0);
          const bad = grade.result === 'ungradable'
            ? grade.score !== 0 || !grade.feedback.trim()
            : scores.length !== rubric.length || new Set(scores.map(row => row.criterion)).size !== rubric.length ||
              scores.some(row => !rubric.some(r => r.criterion === row.criterion && r.points === row.max) || row.points > row.max) ||
              !max || Math.abs(points / max - grade.score) > 0.001 ||
              (grade.result === 'correct' && grade.score !== 1) || (grade.result === 'incorrect' && grade.score !== 0) ||
              (grade.result === 'partial' && (grade.score <= 0 || grade.score >= 1));
          if (bad) {
            reason = 'rubric_validation:/grades/rubricScores';
            return {status: 422, body: {errors: [{code: 'schema', path: '/grades/rubricScores'}]}};
          }
        }
        if (!dry) saved = result;
        return {status: 200, body: {}};
      },
      state: async () => ({status: saved ? 'succeeded' : 'leased'}),
      fail: async () => ({status: 'failed'}),
    };
    let processed;
    try {
      processed = await processJob(hub, {jobId, kind: 'assess', purpose: 'submission'}, singleEngine, {
        getPrompt: () => prompt, maxRounds: 1,
        log: entry => {
          if (entry?.event === 'contract_error') {
            const path = entry.errors?.[0]?.path;
            // Only schema field names and numeric indices, never model-generated keys or messages.
            const safe = typeof path === 'string' && /^\/(?:grades|diagnosis|usage|summary|contract|contextHash|masteryProposals|errorPatternUpdates|reviewProposals|recheckDecision)(?:\/(?:[0-9]{1,2}|attemptId|result|score|rubricScores|criterion|points|max|feedback|correction|errors|checkItem|skillId|patternId|label|category|evidence))*$/.test(path);
            reason = 'contract_error' + (safe ? ':' + path : '');
          } else if (entry?.event === 'engine_error' && usage && reason === 'post_response_failure') reason = 'finalize_error';
        },
      });
    } catch {
      if (!usage) throw new Error(`submission ${/^[a-zA-Z0-9_-]{1,40}$/.test(submission.id) ? submission.id : 'unknown'}: processing_failed`);
      processed = {status: 'failed'};
    }
    if (processed.status === 'succeeded' && saved) {
      results.push({submissionId: submission.id, grades: saved.grades, usage: saved.usage});
    } else if (usage) {
      results.push({submissionId: submission.id, grades: [], usage, invalid: true});
      const safeId = /^[a-zA-Z0-9_-]{1,40}$/.test(submission.id) ? submission.id : 'unknown';
      invalidReasons.push(safeId + '=' + reason);
    } else {
      const detail = typeof processed.error === 'string' ? processed.error.match(/OpenAI HTTP \d{3}(?: \([a-z_]+\))?|OpenAI (?:request timed out|request transport failed|response was not valid JSON|schema preparation failed)/)?.[0] : null;
      throw new Error(`submission ${/^[a-zA-Z0-9_-]{1,40}$/.test(submission.id) ? submission.id : 'unknown'}: ${detail ?? 'processing_failed'}`);
    }
  }
  return {...calibrationMetrics(fixture, results), invalidReasons};
}
