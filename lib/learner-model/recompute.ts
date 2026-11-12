import {roadmapProgressWrite} from '../roadmap/progress.ts';
import type { EvidenceDb } from '../evidence/submit.ts';
import {berlinDay} from '../daily-policy.ts';
import {addDays} from './rules.ts';
import { ApiError } from '../api-error.ts';
import { sha256Hex } from '../auth/automation.ts';
import { clampMastery, computeSkillState, evidenceFingerprint, type Evidence, type ErrorCategory, type Mastery } from './rules.ts';

export async function skillEvidence(db: EvidenceDb, learnerId: string, skillId: string) {
  const { results = [] } = await db
    .prepare(
      `SELECT a.id,a.submission_id,a.created_at,a.activity,a.support,a.attempt_no,a.status,a.context,i.stage,i.flag,
 g.result,g.errors,coalesce((SELECT d.errors FROM attempt_diagnoses d WHERE d.attempt_id=a.id ORDER BY d.created_at DESC LIMIT 1),'[]') AS diagnoses FROM attempts a JOIN grades g ON g.id=a.current_grade_id
 JOIN lesson_items i ON i.lesson_id=a.lesson_id AND i.item_id=a.item_id
 WHERE a.learner_id=? AND EXISTS(SELECT 1 FROM json_each(a.skill_ids) WHERE value=?) ORDER BY a.created_at,a.id`,
    )
    .bind(learnerId, skillId)
    .all<Record<string, unknown>>();
  return results.map((r) => ({
    id: r.id as string,
    submissionId: r.submission_id as string,
    at: r.created_at as string,
    activity: r.activity as Evidence['activity'],
    result: r.result as Evidence['result'],
    support: r.support as Evidence['support'],
    attemptNo: r.attempt_no as number,
    status: r.status as Evidence['status'],
    context: r.context as Evidence['context'],
    stage: r.stage as string,
    itemVoid: r.flag === 'item_void',
    errors: (
      [...JSON.parse(r.errors as string), ...JSON.parse(String(r.diagnoses ?? '[]'))] as {
        skillId?: string;
        label: string;
        category: ErrorCategory;
        unverified?: boolean;
      }[]
    )
      .filter((e) => !e.unverified && (!e.skillId || e.skillId === skillId))
      .map((e) => ({ label: e.label, category: e.category })),
  })) as Evidence[];
}

/** Read revision before evidence; a newer computation wins. Pattern writes use a unique batch token. */
export async function recomputeSkill(db: EvidenceDb, learnerId: string, skillId: string, now = new Date(), lessonId?:string) {
  for (let retry = 0; retry < 3; retry++) {
    // Skill and current state in one query; a request on Workers Free may make only ~50 D1 queries.
    const row = await db
      .prepare(
        `SELECT sk.subject_id,st.skill_id AS state_skill,st.revision,st.evidence_hash,st.mastery,st.mastery_source,st.mastery_reason,st.review_source,
           st.next_review_day,st.review_kind,st.mastery_ceiling,st.dim_retention,st.recent_exposure,st.stuck_on
         FROM skills sk LEFT JOIN skill_states st ON st.skill_id=sk.id WHERE sk.id=? AND sk.learner_id=?`,
      )
      .bind(skillId, learnerId)
      .first<{
        subject_id: string;
        state_skill: string | null;
        revision: number;
        evidence_hash: string;
        mastery: Mastery;
        mastery_source: string;
        mastery_reason: string;
        review_source: string;
        next_review_day: string | null;
        review_kind: string | null;
        mastery_ceiling: string;
        dim_retention: number;
        recent_exposure: string;
        stuck_on: string | null;
      }>();
    if (!row) throw new ApiError(404, 'Không tìm thấy kỹ năng.');
    const skill = { subject_id: row.subject_id },
      old = row.state_skill ? row : null;
    const rows = await skillEvidence(db, learnerId, skillId),
      state = computeSkillState(rows, now),
      hash = await sha256Hex(evidenceFingerprint(rows));
    // With no new evidence, AI decisions stand: mastery while within the rules ceiling, the review
    // date it proposed, and the error patterns it resolved. New evidence recomputes everything.
    const unchanged = !!old && old.evidence_hash === hash;
    const preserve = unchanged && old.mastery_source !== 'rules' && !clampMastery(old.mastery, state.masteryCeiling).clipped;
    const keepReview = unchanged && old.review_source === 'ai';
    // The nightly refresh only matters when time moved a value (overdue review, 14-day exposure); skip no-op writes.
    if (
      unchanged &&
      (preserve ? old.mastery : state.mastery) === old.mastery &&
      state.masteryCeiling === old.mastery_ceiling &&
      state.dimensions.retention === old.dim_retention &&
      JSON.stringify(state.recentExposure) === old.recent_exposure &&
      (state.stuckOn ?? null) === old.stuck_on &&
      (keepReview || state.review.nextReviewDay === old.next_review_day)
    ) {
      // Mark it checked so the nightly refresh moves on to other skills.
      await db.prepare('UPDATE skill_states SET updated_at=? WHERE skill_id=? AND revision=?').bind(now.toISOString(), skillId, old.revision).run();
      return state;
    }
    const token = crypto.randomUUID(),
      stamp = now.toISOString(),
      revision = old?.revision ?? -1;
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
      'review_source',
      'evidence_hash',
      'recompute_token',
      'updated_at',
      'revision',
    ];
    const values = [
      skillId,
      learnerId,
      skill.subject_id,
      preserve ? old.mastery : state.mastery,
      state.masteryCeiling,
      preserve ? old.mastery_source : 'rules',
      preserve ? old.mastery_reason : 'Tính từ bài làm đã chấm',
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
      keepReview ? old.next_review_day : state.review.nextReviewDay,
      keepReview ? old.review_kind : state.review.kind,
      state.review.stepDay,
      state.review.maintained ? 1 : 0,
      keepReview ? 'ai' : 'rules',
      hash,
      token,
      stamp,
      revision + 1,
    ];
    const write = db
      .prepare(
        `INSERT INTO skill_states(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')}) ON CONFLICT(skill_id) DO UPDATE SET ${columns
          .slice(1)
          .map((c) => `${c}=excluded.${c}`)
          .join(',')} WHERE skill_states.revision=?`,
      )
      .bind(...values, revision);
    const gate = 'EXISTS(SELECT 1 FROM skill_states WHERE skill_id=? AND recompute_token=?)';
    const statements = [
      write,
      db
        .prepare(
          'UPDATE subjects SET revision=revision+1 WHERE id=? AND learner_id=? AND EXISTS(SELECT 1 FROM skill_states WHERE skill_id=? AND recompute_token=?)',
        )
        .bind(skill.subject_id, learnerId, skillId, token),
    ];
    if (!unchanged)
      statements.push(
        db.prepare(`UPDATE error_patterns SET status='resolved',resolved_at=? WHERE skill_id=? AND ${gate}`).bind(stamp, skillId, skillId, token),
      );
    for (const p of unchanged ? [] : state.errors) {
      const id = 'err_' + (await sha256Hex(skillId + ':' + p.labelNorm)).slice(0, 20);
      statements.push(
        db
          .prepare(
            `INSERT INTO error_patterns(id,learner_id,subject_id,skill_id,label,label_norm,category,confidence,status,occurrences,days_seen,example_attempt_ids,first_seen_at,last_seen_at,resolved_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${gate} ON CONFLICT(skill_id,label_norm) DO UPDATE SET label=excluded.label,category=excluded.category,confidence=excluded.confidence,status=excluded.status,occurrences=excluded.occurrences,days_seen=excluded.days_seen,example_attempt_ids=excluded.example_attempt_ids,first_seen_at=excluded.first_seen_at,last_seen_at=excluded.last_seen_at,resolved_at=excluded.resolved_at`,
          )
          .bind(
            id,
            learnerId,
            skill.subject_id,
            skillId,
            p.label,
            p.labelNorm,
            p.category,
            p.confidence,
            p.status,
            p.occurrences,
            p.daysSeen,
            JSON.stringify(p.exampleAttemptIds),
            p.firstSeenAt,
            p.lastSeenAt,
            p.resolvedAt,
            skillId,
            token,
          ),
      );
    }
    if(lessonId)statements.push(roadmapProgressWrite(db,learnerId,lessonId,now,gate,[skillId,token]));
    statements.push(db.prepare('SELECT recompute_token FROM skill_states WHERE skill_id=?').bind(skillId));
    const results = (await db.batch(statements)) as { results?: { recompute_token: string }[] }[];
    if (results.at(-1)?.results?.[0]?.recompute_token === token) return state;
  }
  throw new ApiError(409, 'Tiến độ vừa thay đổi. Tính lại từ dữ liệu mới.');
}
export async function recomputeSubmission(db: EvidenceDb, learnerId: string, submissionId: string, now = new Date()) {
  const { results = [] } = await db
    .prepare(
      'SELECT DISTINCT j.value AS skill,a.lesson_id FROM attempts a,json_each(a.skill_ids) j JOIN skills sk ON sk.id=j.value AND sk.learner_id=a.learner_id WHERE a.learner_id=? AND a.submission_id=?',
    )
    .bind(learnerId, submissionId)
    .all<{ skill: string; lesson_id:string }>();
  for (const r of results) await recomputeSkill(db, learnerId, r.skill, now,r.lesson_id);
}
export async function readSubjectSkills(db: EvidenceDb, learnerId: string, subjectId: string) {
  const { results = [] } = await db
    .prepare(
      `SELECT s.*,st.mastery,st.mastery_ceiling,st.dim_knowledge,st.dim_recognition,st.dim_application,st.dim_retention,st.next_review_day,st.review_kind,st.maintained,st.attempts_total,st.last_attempt_at,st.recent_exposure,st.stuck_on,st.revision AS state_revision FROM skills s LEFT JOIN skill_states st ON st.skill_id=s.id WHERE s.learner_id=? AND s.subject_id=? ORDER BY s.path_order,s.id`,
    )
    .bind(learnerId, subjectId)
    .all<Record<string, unknown>>();
  const { results: errors = [] } = await db
    .prepare('SELECT * FROM error_patterns WHERE learner_id=? AND subject_id=? ORDER BY last_seen_at DESC')
    .bind(learnerId, subjectId)
    .all<Record<string, unknown>>();
  return {skills:results,errors};
}
export async function readSubjectEffort(db:EvidenceDb,learnerId:string,subjectId:string,now=new Date()){
  const from=addDays(berlinDay(now),-13);
  const effort=await db.prepare(`SELECT
 (SELECT coalesce(sum(seconds),0)/60.0 FROM study_time WHERE user_id=? AND day>=? AND track IN (?,coalesce((SELECT legacy_track FROM subjects WHERE id=? AND learner_id=?),''))) AS minutes,
 (SELECT count(DISTINCT day) FROM study_time WHERE user_id=? AND day>=? AND seconds>0 AND track IN (?,coalesce((SELECT legacy_track FROM subjects WHERE id=? AND learner_id=?),''))) AS days,
 (SELECT count(*) FROM attempts WHERE learner_id=? AND subject_id=? AND day>=?) AS attempts,
 (SELECT count(*) FROM attempts WHERE learner_id=? AND subject_id=? AND day>=? AND attempt_no>1) AS retries`).bind(learnerId,from,subjectId,subjectId,learnerId,learnerId,from,subjectId,subjectId,learnerId,learnerId,subjectId,from,learnerId,subjectId,from).first<{minutes:number;days:number;attempts:number;retries:number}>();
  return effort;
}
