import {processJob} from '../../integrations/home-runner/job.mjs';
import {calibrationContext} from './context.mjs';
import {calibrationMetrics} from './metrics.mjs';

/** Run the same assess pipeline as a real submission, using a synthetic result sink. */
export async function runCalibration(fixture, jobId, engine, prompt, heartbeat = async () => {}) {
  const results = [];
  for (const submission of fixture.submissions) {
    const context = await calibrationContext(fixture, submission, jobId);
    let saved = null;
    const hub = {
      context: async () => context,
      heartbeat,
      result: async (_lease, result, dry) => {
        if (!dry) saved = result;
        return {status: 200, body: {}};
      },
      state: async () => ({status: saved ? 'succeeded' : 'leased'}),
      fail: async () => ({status: 'failed'}),
    };
    const processed = await processJob(hub, {jobId, kind: 'assess', purpose: 'submission'}, engine, {getPrompt: () => prompt});
    if (processed.status !== 'succeeded' || !saved) throw new Error('Calibration submission failed');
    results.push({submissionId: submission.id, grades: saved.grades, usage: saved.usage});
  }
  return calibrationMetrics(fixture, results);
}
