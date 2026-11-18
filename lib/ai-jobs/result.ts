import { berlinDay } from '../daily-policy.ts';
import {checkCoverage} from '../roadmap/coverage.ts';
import {jobGapStatements} from '../knowledge/service.ts';
import {openWorkMinutesSql} from './open-work.ts';
import { estimateCost } from './cost.ts';
import { planResult, assessResult, type PlanContext, type AssessContext } from '../contracts/ai-common.ts';
import type { Job } from './context/common.ts';
import type { EvidenceDb } from '../evidence/submit.ts';
import { ApiError } from '../api-error.ts';
import { sha256Hex, type AutomationClient } from '../auth/automation.ts';
import { canonical } from './context/common.ts';
import { leasedJob, readJob, recheckEscalation } from './lease.ts';
import { preparePlan } from './apply/plan.ts';
import { prepareAssess } from './apply/assess.ts';
import { deriveAssessScores } from './apply/derive-score.ts';
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
  audioBucket?: Pick<R2Bucket, 'head'>,
  ttsSubjectIds: readonly string[] = [],
  internalPreparedJob?: Job,
) {
  const job = internalPreparedJob ?? await leasedJob(db, client, id, leaseToken, now, true),
    hash = await sha256Hex(canonical(input));
  const stored = !internalPreparedJob && await db.prepare('SELECT result_hash FROM prepared_daily_plans WHERE job_id=?').bind(id).first<{result_hash:string}>();
  if (stored) {
    if (stored.result_hash !== hash) throw new ApiError(409, 'Job đã được soạn với kết quả khác.');
    return { status: 200, outcome: { prepared: true }, replayed: true };
  }
  if (job.status === 'succeeded') {
    if (job.result_hash !== hash) throw new ApiError(409, 'Job đã hoàn tất với kết quả khác.');
    return { status: 200, outcome: JSON.parse(job.outcome!), replayed: true };
  }
  if (job.kind === 'assess' && job.purpose === 'submission') input = deriveAssessScores(input, JSON.parse(job.context_snapshot!) as AssessContext);
  const parsed = (job.kind === 'plan' ? planResult : assessResult).safeParse(input);
  let issues = parsed.success ? [] : parsed.error.issues.map((e) => ({ path: '/' + e.path.join('/'), code: 'schema', message: e.message }));
  if (parsed.success && parsed.data.contextHash !== job.context_hash) throw new ApiError(409, 'Ngữ cảnh không khớp lease.');
  const token = crypto.randomUUID();
  let prepared = parsed.success
    ? job.kind === 'plan'
      ? await preparePlan(db, job, JSON.parse(job.context_snapshot!) as PlanContext, parsed.data as typeof planResult._output, token, now, false, audioBucket, ttsSubjectIds)
      : job.purpose === 'recheck'
        ? await prepareRecheck(db, job, JSON.parse(job.context_snapshot!) as AssessContext, parsed.data as typeof assessResult._output, token, now)
        : await prepareAssess(db, job, JSON.parse(job.context_snapshot!) as AssessContext, parsed.data as typeof assessResult._output, token, now)
    : null;
  let skippedRoadmap = false;
  if(parsed.success&&job.kind==='plan'&&job.purpose==='request'&&prepared&&'outcomes' in prepared){
    const context=JSON.parse(job.context_snapshot!) as PlanContext;
    const optionalEdits=context.adaptive?.roadmapTask==='none';
    const rejectedReplan=context.adaptive?.roadmapTask==='replan'&&prepared.errors.length>0&&prepared.errors.every(issue=>
      issue.code==='roadmap'&&/^\/subjects\/\d+\/roadmapChanges$/.test(issue.path));
    if(context.roadmapProtocol===2&&(rejectedReplan||optionalEdits&&prepared.errors.some(issue=>
      /^\/subjects\/\d+\/(roadmapChanges|openingSteps|skillChanges)(\/|$)/.test(issue.path)))){
      const result=parsed.data as typeof planResult._output;
      const subjects=result.subjects.map(subject=>{
        const copy={...subject,skillChanges:[]};
        delete copy.roadmapChanges;
        delete copy.openingSteps;
        return copy;
      });
      // A rejected replan stays pending. The lesson still has to pass its original context and target checks.
      prepared=await preparePlan(db,job,context,{...result,subjects},token,now,rejectedReplan,audioBucket,ttsSubjectIds);
      skippedRoadmap=true;
    }
  }
  if (prepared) issues = prepared.errors;
  if (issues.length) {
    // A dry run is how a runner checks its draft; only real submissions count toward the 3-strike limit.
    if (dryRun) return { status: 422, errors: issues };
    const recordFailure = db
      .prepare(
        "UPDATE ai_jobs SET validation_failures=validation_failures+1,status=CASE WHEN validation_failures>=2 THEN 'failed' ELSE status END,error='Kết quả chưa qua kiểm tra',finished_at=CASE WHEN validation_failures>=2 THEN ? ELSE finished_at END WHERE id=? AND status='leased' AND lease_token_sha256=? AND apply_token IS NULL",
      )
      .bind(now.toISOString(), id, job.lease_token_sha256);
    if (job.purpose === 'recheck') {
      await db.batch([recheckEscalation(db, job, 2), recordFailure]);
    } else {
      await recordFailure.run();
    }
    return { status: 422, errors: issues };
  }
  if (!prepared || !parsed.success) throw new Error('Missing prepared result.');
  if (dryRun) return { status: 200, outcome: { dryRun: true, validated: true }, replayed: false };
  if (!internalPreparedJob && job.kind === 'plan' && job.purpose === 'daily' && job.ref_id && job.learning_day > berlinDay(now)) {
    if ('outcomes' in prepared && prepared.outcomes.some(o => o.status === 'stale')) throw new ApiError(409, 'Sổ hoặc bài đang học đã thay đổi; không lưu bản soạn.');
    const saved = await db.prepare(`INSERT OR IGNORE INTO prepared_daily_plans(job_id,result,result_hash,created_at)
      SELECT id,?,?,? FROM ai_jobs WHERE id=? AND status='leased' AND lease_token_sha256=? AND lease_expires_at>? AND expires_at>? AND apply_token IS NULL`)
      .bind(JSON.stringify(input), hash, now.toISOString(), id, job.lease_token_sha256, now.toISOString(), now.toISOString()).run();
    if (!saved.meta.changes) throw new ApiError(409, 'Lease hoặc dữ liệu vừa thay đổi; đọc lại job.');
    return { status: 200, outcome: { prepared: true }, replayed: false };
  }
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
    guards.push(...prepared.guards);
    const minutes = prepared.newMinutes;
    if (minutes && !context.adaptive)
      guards.push(
        db
          .prepare(
            `INSERT INTO ai_apply_guards(token,valid) SELECT ?,CASE WHEN (${openWorkMinutesSql})+?<=? THEN 1 ELSE 0 END WHERE EXISTS(SELECT 1 FROM ai_jobs WHERE id=? AND apply_token=?)`,
          )
          .bind(token + ':budget', job.learner_id, minutes, context.policy.maxOpenMinutes, id, token),
      );
  }
  const claim = internalPreparedJob
    ? db.prepare("UPDATE ai_jobs SET apply_token=? WHERE id=? AND status='leased' AND expires_at>? AND apply_token IS NULL AND EXISTS(SELECT 1 FROM prepared_daily_plans WHERE job_id=ai_jobs.id AND result_hash=?)")
      .bind(token, id, now.toISOString(), hash)
    : db.prepare("UPDATE ai_jobs SET apply_token=? WHERE id=? AND status='leased' AND lease_token_sha256=? AND lease_expires_at>? AND expires_at>? AND apply_token IS NULL")
      .bind(token, id, job.lease_token_sha256, now.toISOString(), now.toISOString());
  let outcomeSql: string, outcomeParams: unknown[];
  if ('outcomes' in prepared) {
    const fragments = prepared.outcomes.map(
      () =>
        `json_object('subjectId',?,'status',CASE WHEN ? IN ('stale','rejected','unchanged') THEN ? WHEN EXISTS(SELECT 1 FROM subjects WHERE id=? AND learner_id=? AND updated_at=? AND revision=?) AND (?='no_action' OR EXISTS(SELECT 1 FROM learning_lessons WHERE origin_job_id=? AND subject_id=?)) THEN ? ELSE 'stale' END,'lessonIds',json(coalesce((SELECT json_group_array(id) FROM learning_lessons WHERE origin_job_id=? AND subject_id=?),'[]')),'reason',?)`,
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
      `UPDATE ai_jobs SET status=${internalPreparedJob ? "CASE WHEN EXISTS(SELECT 1 FROM learning_lessons WHERE origin_job_id=ai_jobs.id AND slot='primary') THEN 'succeeded' ELSE 'cancelled' END" : "'succeeded'"},error=${internalPreparedJob ? "CASE WHEN EXISTS(SELECT 1 FROM learning_lessons WHERE origin_job_id=ai_jobs.id AND slot='primary') THEN NULL ELSE 'Điều kiện giao bài không còn hợp lệ' END" : 'NULL'},result_hash=?,outcome=${outcomeSql},usage=?,cost_usd=?,updated_at=?,finished_at=? WHERE id=? AND apply_token=?`,
    )
    .bind(hash, ...outcomeParams, JSON.stringify(usage), estimateCost(usage, priceTable), now.toISOString(), now.toISOString(), id, token);
  const cleanup = db.prepare('DELETE FROM ai_apply_guards WHERE token LIKE ?').bind(token + ':%');
  try {
    const gaps = await jobGapStatements(db, job, parsed.data.knowledgeGaps ?? [], token);
    await db.batch([claim, ...guards, ...prepared.statements, ...gaps, finish, ...(internalPreparedJob ? [db.prepare('DELETE FROM prepared_daily_plans WHERE job_id=? AND EXISTS(SELECT 1 FROM ai_jobs WHERE id=? AND apply_token=?)').bind(id,id,token)] : []), cleanup]);
  } catch (error) {
    if (String(error).includes('CHECK') || String(error).includes('UNIQUE'))
      throw new ApiError(409, 'Dữ liệu vừa thay đổi; đọc lại job trước khi gửi lại.');
    throw error;
  }
  const saved = await readJob(db, id);
  if (!(saved?.status === 'succeeded' || internalPreparedJob && saved?.status === 'cancelled') || saved.result_hash !== hash)
    throw new ApiError(409, 'Lease hoặc dữ liệu vừa thay đổi; đọc lại job trước khi thử.');
  // A recheck changes which grade counts; skills follow the committed result.
  if (job.purpose === 'recheck' && 'skillIds' in prepared)
    for (const skillId of prepared.skillIds)
      await recomputeSkill(db, job.learner_id, skillId, now,(JSON.parse(job.context_snapshot!) as AssessContext).lesson.lessonId).catch((error) =>
        console.error('Skill not recomputed after recheck:', error instanceof Error ? error.message : error),
      );
  if(!skippedRoadmap&&job.kind==='plan'&&job.subject_id&&'subjects' in parsed.data&&parsed.data.subjects.some(s=>s.roadmapChanges?.length||s.openingSteps?.length))
    await checkCoverage(db,job.learner_id,job.subject_id).catch(()=>console.error('Roadmap coverage not refreshed.'));
  return { status: 200, outcome: JSON.parse(saved.outcome!), replayed: false };
}

/** Apply stored plans once on their learning day; no runner or model call is involved. */
export async function applyPreparedDaily(db: EvidenceDb, now: Date, priceTable?: string, audioBucket?: Pick<R2Bucket, 'head'>, ttsSubjectIds: readonly string[] = []) {
  const day = berlinDay(now), stamp = now.toISOString();
  await db.batch([
    db.prepare("UPDATE ai_jobs SET status='expired',error='Bản soạn quá hạn',finished_at=?,updated_at=? WHERE id IN (SELECT p.job_id FROM prepared_daily_plans p JOIN ai_jobs j ON j.id=p.job_id WHERE j.learning_day<? OR j.expires_at<=?) AND status='leased' AND apply_token IS NULL").bind(stamp,stamp,day,stamp),
    db.prepare("DELETE FROM prepared_daily_plans WHERE job_id IN (SELECT id FROM ai_jobs WHERE status='expired')"),
  ]);
  const {results=[]} = await db.prepare("SELECT j.*,p.result FROM ai_jobs j JOIN prepared_daily_plans p ON p.job_id=j.id WHERE j.learning_day=? AND j.status='leased' ORDER BY j.id").bind(day).all<Job & {result:string}>();
  for (const job of results) {
    try {
      // Internal execution still uses the same validator, eligibility checks and atomic writer.
      const payload = JSON.parse(job.result) as {subjects?: {primaryLesson?: unknown}[]};
      if (!payload.subjects?.some(subject => subject.primaryLesson)) {
        await db.batch([
          db.prepare("UPDATE ai_jobs SET status='cancelled',error='Bản soạn không có bài chính',finished_at=?,updated_at=? WHERE id=? AND status='leased' AND apply_token IS NULL").bind(stamp,stamp,job.id),
          db.prepare("DELETE FROM prepared_daily_plans WHERE job_id=? AND EXISTS(SELECT 1 FROM ai_jobs WHERE id=? AND status='cancelled')").bind(job.id,job.id),
        ]);
        continue;
      }
      const applied = await applyResult(db, {} as AutomationClient, job.id, null, payload, false, now, priceTable, audioBucket, ttsSubjectIds, job);
      if (applied.status === 422) await db.batch([
        db.prepare("UPDATE ai_jobs SET status='cancelled',error='Bản soạn không còn hợp lệ',finished_at=?,updated_at=? WHERE id=? AND status='leased' AND apply_token IS NULL").bind(stamp,stamp,job.id),
        db.prepare("DELETE FROM prepared_daily_plans WHERE job_id=? AND EXISTS(SELECT 1 FROM ai_jobs WHERE id=? AND status='cancelled')").bind(job.id,job.id),
      ]);
    } catch (error) {
      console.error('Prepared daily plan could not be applied:', error instanceof Error ? error.message : error);
    }
  }
}
