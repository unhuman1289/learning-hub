import {processJob, contractFor} from '../ai/job.mjs';
import {calibrationContext} from './context.mjs';
import {calibrationMetrics} from './metrics.mjs';
import {calibrationDryRun} from './dry-run.mjs';

function schemaFields(node, fields = new Set()) {
  if (!node || typeof node !== 'object') return fields;
  if (node.properties && typeof node.properties === 'object') for (const key of Object.keys(node.properties)) fields.add(key);
  for (const child of Object.values(node)) schemaFields(child, fields);
  return fields;
}
const safeFields = schemaFields(contractFor('assess').json);
function safePath(path) {
  if (typeof path !== 'string' || !path.startsWith('/')) return '';
  return '/' + path.slice(1).split('/').slice(0, 20).map(part => safeFields.has(part) || /^[0-9]{1,3}$/.test(part) ? part : '*').join('/');
}

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
        if (error?.invalidOutput && error.usage) { reason = (['invalid_json', 'response_refused', 'response_normalization'].includes(error.invalidCode) || /^response_status_(?:failed|incomplete|cancelled|queued|in_progress|unknown)(?:_(?:max_output_tokens|content_filter))?$/.test(error.invalidCode)) ? error.invalidCode : 'invalid_output'; usage = error.usage; }
        throw error;
      }
    }};
    const hub = {
      context: async () => context,
      heartbeat,
      result: async (_lease, result, dry) => {
        const issues = await calibrationDryRun(context, result);
        if (issues.length) {
          const first = issues[0];
          const code = /^[a-z_]{1,40}$/.test(first.code) ? first.code : 'validation_failed';
          const detail = typeof first.detail === 'string' && /^[a-z_]{1,40}$/.test(first.detail) ? first.detail : code;
          const path = /^\/(?:grades|diagnosis|masteryProposals|reviewProposals|errorPatternUpdates|recheckDecision)(?:\/(?:[0-9]{1,2}|rubricScores|errors|checkItem))*$/.test(first.path) ? first.path : '';
          reason = detail + (path ? ':' + path : '');
          return {status: 422, body: {errors: issues}};
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
          if (entry?.event === 'assess_cleanup' && ['auto_diagnosis','rubric_max','check_item'].includes(entry.code))
            console.info(JSON.stringify({component:'calibration',jobId,event:'assess_cleanup',code:entry.code}));
          if (entry?.event === 'contract_error') {
            const path = entry.errors?.[0]?.path;
            const code = typeof entry.errors?.[0]?.code === 'string' && /^[a-z_]{1,40}$/.test(entry.errors[0].code) ? entry.errors[0].code : 'validation_failed';
            reason = 'contract_error:' + code + (safePath(path) ? ':' + safePath(path) : '');
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
      results.push({submissionId: submission.id, grades: [], usage, invalid: true, errorCode: reason});
      const safeId = /^[a-zA-Z0-9_-]{1,40}$/.test(submission.id) ? submission.id : 'unknown';
      invalidReasons.push(safeId + '=' + reason);
    } else {
      const detail = typeof processed.error === 'string' ? processed.error.match(/OpenAI HTTP \d{3}(?: \([a-z_]+\))?|OpenAI (?:request timed out|request transport failed|response was not valid JSON|schema preparation failed)/)?.[0] : null;
      throw new Error(`submission ${/^[a-zA-Z0-9_-]{1,40}$/.test(submission.id) ? submission.id : 'unknown'}: ${detail ?? 'processing_failed'}`);
    }
  }
  return {...calibrationMetrics(fixture, results), invalidReasons};
}
