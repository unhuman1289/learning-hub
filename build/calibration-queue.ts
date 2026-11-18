import fixture from '../fixtures/eval/assess/deutsch.json' with { type: 'json' };
import { openAiEngine, OPENAI_MODELS } from '../lib/ai/openai.mjs';
import { runCalibration } from '../lib/calibration/run.mjs';
import { calibrationLow } from '../lib/calibration/metrics.mjs';
import { claimCalibration, reserveCalibrationCall } from '../lib/calibration/jobs.ts';
import { sha256Hex } from '../lib/auth/automation.ts';
import { berlinDay } from '../lib/daily-policy.ts';

/** Claims once. A failed or expired attempt is never replayed after a model call. */
export async function consumeCalibration(db: D1Database, env: Cloudflare.Env, id: string, prompt: string, fetcher = fetch) {
  if (env.OPENAI_ENABLED !== 'true' || !env.OPENAI_API_KEY) return 'unavailable';
  const token = await claimCalibration(db, id);
  if (!token) return 'not-claimed';
  try {
    const engine = openAiEngine({apiKey: env.OPENAI_API_KEY, kind: 'assess', purpose: 'submission', fetcher,
      beforeFetch: () => reserveCalibrationCall(db, id, token)});
    const metrics = await runCalibration(fixture, id, engine, prompt);
    const now = new Date(), stamp = now.toISOString(), day = berlinDay(now);
    const promptHash = 'sha256:' + await sha256Hex(prompt);
    const setHash = 'sha256:' + await sha256Hex(JSON.stringify(fixture));
    const result = await db.batch([
      db.prepare(`INSERT INTO grader_calibrations(id,model,prompt_hash,set_hash,n,agreement,evidence_not_verbatim,injection_shifted,mean_ms,input_tokens,output_tokens,created_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM calibration_jobs WHERE id=? AND status='leased' AND lease_token=?)`)
        .bind(id, OPENAI_MODELS.assess, promptHash, setHash, metrics.n, metrics.agreement, metrics.evidenceNotVerbatim, metrics.injectionShifted, metrics.meanMs, metrics.inputTokens, metrics.outputTokens, stamp, id, token),
      ...metrics.details.map((detail: {fixtureId:string;itemId:string;expectedResult:string;modelResult:string|null;fixtureAnswer:string;rubricScores:unknown;errorCode:string|null}) => db.prepare(`INSERT INTO grader_calibration_details(calibration_id,fixture_id,item_id,expected_result,model_result,fixture_answer,rubric_scores,error_code)
        SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM calibration_jobs WHERE id=? AND status='leased' AND lease_token=?)`)
        .bind(id,detail.fixtureId,detail.itemId,detail.expectedResult,detail.modelResult,detail.fixtureAnswer,JSON.stringify(detail.rubricScores),detail.errorCode,id,token)),
      db.prepare(`INSERT OR IGNORE INTO alert_events(id,learning_day,code,message,created_at)
        SELECT ?,?,'grader_calibration_low','Kết quả hiệu chuẩn chất lượng chấm cần được xem lại.',? WHERE ?=1 AND EXISTS (SELECT 1 FROM calibration_jobs WHERE id=? AND status='leased' AND lease_token=?)`)
        .bind('alert_' + (await sha256Hex(day + ':grader_calibration_low')).slice(0,20), day, stamp, Number(calibrationLow(metrics)), id, token),
      db.prepare(`UPDATE calibration_jobs SET status='succeeded',error=?,finished_at=?,updated_at=?,lease_token=NULL,lease_expires_at=NULL
        WHERE id=? AND status='leased' AND lease_token=? AND EXISTS(SELECT 1 FROM grader_calibrations WHERE id=?)`)
        .bind('invalid_submissions=' + metrics.invalid + (metrics.invalidReasons.length ? ';' + metrics.invalidReasons.join(';') : ''), stamp, stamp, id, token, id),
    ]);
    if (!result[result.length - 1].meta.changes) throw new Error('Calibration was not saved');
    return 'succeeded';
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const detail = /^submission [a-zA-Z0-9_-]{1,40}: (?:OpenAI HTTP \d{3}(?: \([a-z_]+\))?|OpenAI (?:request timed out|request transport failed|response was not valid JSON|schema preparation failed)|processing_failed)$/.test(message) ? message : 'calibration_processing_failed';
    const stamp = new Date().toISOString();
    await db.prepare(`UPDATE calibration_jobs SET status='failed',error=?,finished_at=?,updated_at=?,lease_token=NULL,lease_expires_at=NULL
      WHERE id=? AND status='leased' AND lease_token=?`).bind(detail,stamp,stamp,id,token).run();
    return 'failed';
  }
}

export async function recoverCalibrationJobs(db: D1Database, env: Cloudflare.Env, now = new Date()) {
  const stamp = now.toISOString();
  await db.prepare(`UPDATE calibration_jobs SET status='failed',error='Lượt hiệu chuẩn bị gián đoạn.',finished_at=?,updated_at=?,lease_token=NULL,lease_expires_at=NULL
    WHERE status='leased' AND lease_expires_at<=?`).bind(stamp,stamp,stamp).run();
  if (env.OPENAI_ENABLED !== 'true' || !env.OPENAI_API_KEY || !env.AI_QUEUE) return;
  const {results=[]} = await db.prepare("SELECT id FROM calibration_jobs WHERE status='queued' AND updated_at<=?")
    .bind(new Date(+now - 120_000).toISOString()).all<{id:string}>();
  for (const job of results) await env.AI_QUEUE.send({calibrationJobId:job.id});
}
