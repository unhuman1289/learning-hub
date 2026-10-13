import type { EvidenceDb } from '../evidence/submit.ts';
import type { AssessContext, AssessResult } from '../contracts/ai-common.ts';
import {
  computeSkillState,
  evidenceFingerprint,
  clampMastery,
  clampReviewDays,
  addDays,
  canResolveError,
  type Evidence,
  type Mastery,
} from './rules.ts';
import { skillEvidence } from './recompute.ts';
import { sha256Hex } from '../auth/automation.ts';
import type { Job } from '../ai-jobs/context/common.ts';
import { berlinDay } from '../daily-policy.ts';
export async function prepareJobStates(db: EvidenceDb, job: Job, context: AssessContext, result: AssessResult, token: string, now: Date) {
  const ids = [
    ...new Set([
      ...result.grades.flatMap((g) => context.attempts.find((a) => a.attemptId === g.attemptId)?.skills ?? []),
      ...result.diagnosis.flatMap((g) => context.attempts.find((a) => a.attemptId === g.attemptId)?.skills ?? []),
      ...result.masteryProposals.map((p) => p.skillId),
      ...result.reviewProposals.map((p) => p.skillId),
      ...result.errorPatternUpdates.flatMap((p) => context.openErrorPatterns.find((e) => e.patternId === p.patternId)?.skillId ?? []),
    ]),
  ];
  const statements: ReturnType<EvidenceDb['prepare']>[] = [],
    guards: { skillId: string; revision: number }[] = [],
    clipped: unknown[] = [];
  for (const id of ids) {
    const old = await db
      .prepare('SELECT revision FROM skill_states WHERE skill_id=? AND learner_id=?')
      .bind(id, job.learner_id)
      .first<{ revision: number }>();
    guards.push({ skillId: id, revision: old?.revision ?? -1 });
    const rows = await skillEvidence(db, job.learner_id, id),
      byId = new Map(rows.map((r) => [r.id, r]));
    for (const g of result.grades) {
      const a = context.attempts.find((a) => a.attemptId === g.attemptId);
      if (!a?.skills.includes(id)) continue;
      const row = await db
        .prepare('SELECT created_at,submission_id,context,status FROM attempts WHERE id=? AND learner_id=?')
        .bind(a.attemptId, job.learner_id)
        .first<{ created_at: string; submission_id: string; context: Evidence['context']; status: string }>();
      if (!row) continue;
      byId.set(a.attemptId, {
        id: a.attemptId,
        submissionId: row.submission_id,
        at: row.created_at,
        activity: a.activity as Evidence['activity'],
        result: g.result,
        support: a.support as Evidence['support'],
        attemptNo: a.attemptNo,
        status: 'graded',
        context: row.context,
        stage: a.stage,
        errors: g.errors.filter((e) => e.skillId === id).map((e) => ({ label: e.label, category: e.category })),
      });
    }
    for (const d of result.diagnosis) {
      const a = byId.get(d.attemptId);
      if (a) a.errors = [...(a.errors ?? []), ...d.errors.filter((e) => e.skillId === id).map((e) => ({ label: e.label, category: e.category }))];
    }
    const evidence = [...byId.values()].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)),
      state = computeSkillState(evidence, now);
    let mastery: Mastery = state.mastery,
      source = 'rules',
      reason = 'Tính từ bài làm đã chấm';
    const p = result.masteryProposals.find((p) => p.skillId === id);
    if (p) {
      const v = clampMastery(p.status, state.masteryCeiling);
      mastery = v.mastery;
      source = 'ai';
      reason = p.reason;
      if (v.clipped) clipped.push({ skillId: id, field: 'mastery', requested: p.status, applied: v.mastery });
    }
    let next = state.review.nextReviewDay,
      kind = state.review.kind;
    const review = result.reviewProposals.find((p) => p.skillId === id);
    if (review && state.review.intervalDays && !state.review.maintained) {
      const days = clampReviewDays(review.inDays, state.review.intervalDays);
      next = addDays(berlinDay(now), days);
      kind = review.kind;
      if (days !== review.inDays) clipped.push({ skillId: id, field: 'review', requested: review.inDays, applied: days });
    }
    const columns = [
      'skill_id',
      'learner_id',
      'subject_id',
      'mastery',
      'mastery_ceiling',
      'mastery_source',
      'mastery_reason',
      'dim_knowledge',
      'dim_recognition',
      'dim_application',
      'dim_retention',
      'exposure',
      'recent_exposure',
      'stuck_on',
      'attempts_total',
      'last_attempt_at',
      'last_independent_at',
      'review_interval_days',
      'next_review_day',
      'review_kind',
      'review_step_day',
      'maintained',
      'evidence_hash',
      'recompute_token',
      'updated_at',
      'revision',
    ];
    const values = [
      id,
      job.learner_id,
      context.subject.subjectId,
      mastery,
      state.masteryCeiling,
      source,
      reason,
      state.dimensions.knowledge,
      state.dimensions.recognition,
      state.dimensions.application,
      state.dimensions.retention,
      JSON.stringify(state.exposure),
      JSON.stringify(state.recentExposure),
      state.stuckOn,
      state.attemptsTotal,
      state.lastAttemptAt,
      state.lastIndependentAt,
      state.review.intervalDays,
      next,
      kind,
      state.review.stepDay,
      state.review.maintained ? 1 : 0,
      await sha256Hex(evidenceFingerprint(evidence)),
      token,
      now.toISOString(),
      (old?.revision ?? -1) + 1,
    ];
    const gate = 'EXISTS(SELECT 1 FROM ai_jobs WHERE id=? AND apply_token=?)';
    statements.push(
      db
        .prepare(
          `INSERT INTO skill_states(${columns.join(',')}) SELECT ${columns.map(() => '?').join(',')} WHERE ${gate} ON CONFLICT(skill_id) DO UPDATE SET ${columns
            .slice(1)
            .map((c) => `${c}=excluded.${c}`)
            .join(',')}`,
        )
        .bind(...values, job.id, token),
    );
    statements.push(
      db
        .prepare(`UPDATE error_patterns SET status='resolved',resolved_at=? WHERE skill_id=? AND learner_id=? AND ${gate}`)
        .bind(now.toISOString(), id, job.learner_id, job.id, token),
    );
    for (const error of state.errors) {
      const patternId = 'err_' + (await sha256Hex(id + ':' + error.labelNorm)).slice(0, 20);
      const update = result.errorPatternUpdates.find((p) => p.patternId === patternId);
      if (update?.action === 'resolve' && canResolveError(error, evidence, update.evidenceAttemptIds, now)) {
        error.status = 'resolved';
        error.resolvedAt = now.toISOString();
      }
      statements.push(
        db
          .prepare(
            `INSERT INTO error_patterns(id,learner_id,subject_id,skill_id,label,label_norm,category,confidence,status,occurrences,days_seen,example_attempt_ids,first_seen_at,last_seen_at,resolved_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${gate} ON CONFLICT(skill_id,label_norm) DO UPDATE SET label=excluded.label,category=excluded.category,confidence=excluded.confidence,status=excluded.status,occurrences=excluded.occurrences,days_seen=excluded.days_seen,example_attempt_ids=excluded.example_attempt_ids,last_seen_at=excluded.last_seen_at,resolved_at=excluded.resolved_at`,
          )
          .bind(
            patternId,
            job.learner_id,
            context.subject.subjectId,
            id,
            error.label,
            error.labelNorm,
            error.category,
            error.confidence,
            error.status,
            error.occurrences,
            error.daysSeen,
            JSON.stringify(error.exampleAttemptIds),
            error.firstSeenAt,
            error.lastSeenAt,
            error.resolvedAt,
            job.id,
            token,
          ),
      );
    }
  }
  return { statements, guards, clipped };
}
