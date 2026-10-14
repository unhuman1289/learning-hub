import {openWorkMinutesSql} from './open-work.ts';
import { estimateCost } from './cost.ts';
import { planResult, assessResult, type PlanContext, type AssessContext } from '../contracts/ai-common.ts';
import type { EvidenceDb } from '../evidence/submit.ts';
import { ApiError } from '../api-error.ts';
import { sha256Hex, type AutomationClient } from '../auth/automation.ts';
import { canonical } from './context/common.ts';
import { leasedJob, readJob } from './lease.ts';
import { preparePlan } from './apply/plan.ts';
import { prepareAssess } from './apply/assess.ts';
import { prepareRecheck } from './apply/recheck.ts';
import { recomputeSkill } from '../learner-model/recompute.ts';

export async function applyResult(
  db: EvidenceDb,
  client: AutomationClient,
  id: string,
  leaseToken: string | null,
  input: unknown,
  dryRun = false,
  now = new Date(),
  priceTable?: string,
) {
  const job = await leasedJob(db, client, id, leaseToken, now, true),
    hash = await sha256Hex(canonical(input));
  if (job.status === 'succeeded') {
    if (job.result_hash !== hash) throw new ApiError(409, 'Job đã hoàn tất với kết quả khác.');
    return { status: 200, outcome: JSON.parse(job.outcome!), replayed: true };
  }
  const parsed = (job.kind === 'plan' ? planResult : assessResult).safeParse(input);
  let issues = parsed.success ? [] : parsed.error.issues.map((e) => ({ path: '/' + e.path.join('/'), code: 'schema', message: e.message }));
  if (parsed.success && parsed.data.contextHash !== job.context_hash) throw new ApiError(409, 'Ngữ cảnh không khớp lease.');
  const token = crypto.randomUUID();
  const prepared = parsed.success
    ? job.kind === 'plan'
      ? await preparePlan(db, job, JSON.parse(job.context_snapshot!) as PlanContext, parsed.data as typeof planResult._output, token, now)
      : job.purpose === 'recheck'
        ? await prepareRecheck(db, job, JSON.parse(job.context_snapshot!) as AssessContext, parsed.data as typeof assessResult._output, token, now)
        : await prepareAssess(db, job, JSON.parse(job.context_snapshot!) as AssessContext, parsed.data as typeof assessResult._output, token, now)
    : null;
  if (prepared) issues = prepared.errors;
  if (issues.length) {
    // A dry run is how a runner checks its draft; only real submissions count toward the 3-strike limit.
    if (dryRun) return { status: 422, errors: issues };
    await db
      .prepare(
        "UPDATE ai_jobs SET validation_failures=validation_failures+1,status=CASE WHEN validation_failures>=2 THEN 'failed' ELSE status END,error='Kết quả chưa qua kiểm tra',finished_at=CASE WHEN validation_failures>=2 THEN ? ELSE finished_at END WHERE id=? AND status='leased' AND lease_token_sha256=?",
      )
      .bind(now.toISOString(), id, job.lease_token_sha256)
      .run();
    return { status: 422, errors: issues };
  }
  if (!prepared || !parsed.success) throw new Error('Missing prepared result.');
  if (dryRun) return { status: 200, outcome: { dryRun: true, validated: true }, replayed: false };
  const guards = [];
  if ('attemptGuards' in prepared)
    for (const attempt of prepared.attemptGuards)
      guards.push(
        db
          .prepare(
            `INSERT INTO ai_apply_guards(token,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM attempts WHERE id=? AND learner_id=? AND status='pending' AND current_grade_id IS NULL) THEN 1 ELSE 0 END WHERE EXISTS(SELECT 1 FROM ai_jobs WHERE id=? AND apply_token=?)`,
          )
          .bind(token + ':' + attempt, attempt, job.learner_id, id, token),
      );
  if ('lessonGuard' in prepared && prepared.lessonGuard)
    guards.push(
      db
        .prepare(
          `INSERT INTO ai_apply_guards(token,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM learning_lessons WHERE id=? AND user_id=? AND payload=?) THEN 1 ELSE 0 END WHERE EXISTS(SELECT 1 FROM ai_jobs WHERE id=? AND apply_token=?)`,
        )
        .bind(token + ':lesson', prepared.lessonGuard.id, job.learner_id, prepared.lessonGuard.payload, id, token),
    );
  if ('stateGuards' in prepared)
    for (const g of prepared.stateGuards)
      guards.push(
        db
          .prepare(
            `INSERT INTO ai_apply_guards(token,valid) SELECT ?,CASE WHEN coalesce((SELECT revision FROM skill_states WHERE skill_id=? AND learner_id=?),-1)=? THEN 1 ELSE 0 END WHERE EXISTS(SELECT 1 FROM ai_jobs WHERE id=? AND apply_token=?)`,
          )
          .bind(token + ':' + g.skillId, g.skillId, job.learner_id, g.revision, id, token),
      );
  if ('outcomes' in prepared) {
    const context = JSON.parse(job.context_snapshot!) as PlanContext;
    const minutes = prepared.newMinutes;
    if (minutes)
      guards.push(
        db
          .prepare(
            `INSERT INTO ai_apply_guards(token,valid) SELECT ?,CASE WHEN (${openWorkMinutesSql})+?<=? THEN 1 ELSE 0 END WHERE EXISTS(SELECT 1 FROM ai_jobs WHERE id=? AND apply_token=?)`,
          )
          .bind(token + ':budget', job.learner_id, minutes, context.policy.maxOpenMinutes, id, token),
      );
  }
  const claim = db
    .prepare(
      "UPDATE ai_jobs SET apply_token=? WHERE id=? AND status='leased' AND lease_token_sha256=? AND lease_expires_at>? AND expires_at>? AND apply_token IS NULL",
    )
    .bind(token, id, job.lease_token_sha256, now.toISOString(), now.toISOString());
  let outcomeSql: string, outcomeParams: unknown[];
  if ('outcomes' in prepared) {
    const fragments = prepared.outcomes.map(
      () =>
        `json_object('subjectId',?,'status',CASE WHEN ? IN ('stale','rejected') THEN ? WHEN EXISTS(SELECT 1 FROM subjects WHERE id=? AND learner_id=? AND updated_at=? AND revision=?) AND (?='no_action' OR EXISTS(SELECT 1 FROM learning_lessons WHERE origin_job_id=? AND subject_id=?)) THEN ? ELSE 'stale' END,'lessonIds',json(coalesce((SELECT json_group_array(id) FROM learning_lessons WHERE origin_job_id=? AND subject_id=?),'[]')),'reason',?)`,
    );
    outcomeSql = "json_object('subjects',json('[' || " + (fragments.length ? fragments.join(" || ',' || ") : "''") + " || ']'),'extraLessonIds',json(coalesce((SELECT json_group_array(id) FROM learning_lessons WHERE origin_job_id=? AND slot='extra'),'[]')))";
    outcomeParams = prepared.outcomes.flatMap((o) => [
      o.subjectId,
      o.status,
      o.status,
      o.subjectId,
      job.learner_id,
      now.toISOString(),
      (parsed.data as typeof planResult._output).subjects.find((s) => s.subjectId === o.subjectId)!.expectedRevision + 1,
      o.status,
      id,
      o.subjectId,
      o.status,
      id,
      o.subjectId,
      o.reason,
    ]);
    outcomeParams.push(id);
  } else {
    outcomeSql =
      "json_object('gradeIds',json(coalesce((SELECT json_group_array(id) FROM grades WHERE job_id=?),'[]')),'clipped',json(?),'summary',?)";
    outcomeParams = [id, JSON.stringify(prepared.clipped), parsed.data.summary];
  }
  const usage = parsed.data.usage;
  const finish = db
    .prepare(
      `UPDATE ai_jobs SET status='succeeded',result_hash=?,outcome=${outcomeSql},usage=?,cost_usd=?,updated_at=?,finished_at=? WHERE id=? AND apply_token=?`,
    )
    .bind(hash, ...outcomeParams, JSON.stringify(usage), estimateCost(usage, priceTable), now.toISOString(), now.toISOString(), id, token);
  const cleanup = db.prepare('DELETE FROM ai_apply_guards WHERE token LIKE ?').bind(token + ':%');
  try {
    await db.batch([claim, ...guards, ...prepared.statements, finish, cleanup]);
  } catch (error) {
    if (String(error).includes('CHECK') || String(error).includes('UNIQUE'))
      throw new ApiError(409, 'Dữ liệu vừa thay đổi; đọc lại job trước khi gửi lại.');
    throw error;
  }
  const saved = await readJob(db, id);
  if (saved?.status !== 'succeeded' || saved.result_hash !== hash)
    throw new ApiError(409, 'Lease hoặc dữ liệu vừa thay đổi; đọc lại job trước khi thử.');
  // A recheck changes which grade counts; skills follow the committed result.
  if (job.purpose === 'recheck' && 'skillIds' in prepared)
    for (const skillId of prepared.skillIds)
      await recomputeSkill(db, job.learner_id, skillId, now).catch((error) =>
        console.error('Skill not recomputed after recheck:', error instanceof Error ? error.message : error),
      );
  return { status: 200, outcome: JSON.parse(saved.outcome!), replayed: false };
}
