import type { EvidenceDb } from '../evidence/submit.ts';
import { ApiError } from '../api-error.ts';
import { sha256Hex } from '../auth/automation.ts';
import { computeSkillState, evidenceFingerprint, type Evidence, type ErrorCategory } from './rules.ts';

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
      }[]
    )
      .filter((e) => !e.skillId || e.skillId === skillId)
      .map((e) => ({ label: e.label, category: e.category })),
  })) as Evidence[];
}

/** Read revision before evidence; a newer computation wins. Pattern writes use a unique batch token. */
export async function recomputeSkill(db: EvidenceDb, learnerId: string, skillId: string, now = new Date()) {
  const skill = await db
    .prepare('SELECT subject_id FROM skills WHERE id=? AND learner_id=?')
    .bind(skillId, learnerId)
    .first<{ subject_id: string }>();
  if (!skill) throw new ApiError(404, 'Không tìm thấy kỹ năng.');
  for (let retry = 0; retry < 3; retry++) {
    const old = await db
      .prepare('SELECT revision,evidence_hash,mastery,mastery_source,mastery_reason FROM skill_states WHERE skill_id=?')
      .bind(skillId)
      .first<{ revision: number; evidence_hash: string; mastery: string; mastery_source: string; mastery_reason: string }>();
    const rows = await skillEvidence(db, learnerId, skillId),
      state = computeSkillState(rows, now),
      hash = await sha256Hex(evidenceFingerprint(rows));
    const preserve = old && old.evidence_hash === hash && old.mastery_source !== 'rules';
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
      state.review.nextReviewDay,
      state.review.kind,
      state.review.stepDay,
      state.review.maintained ? 1 : 0,
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
      db.prepare(`UPDATE error_patterns SET status='resolved',resolved_at=? WHERE skill_id=? AND ${gate}`).bind(stamp, skillId, skillId, token),
    ];
    for (const p of state.errors) {
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
    await db.batch(statements);
    const saved = await db.prepare('SELECT recompute_token FROM skill_states WHERE skill_id=?').bind(skillId).first<{ recompute_token: string }>();
    if (saved?.recompute_token === token) return state;
  }
  throw new ApiError(409, 'Tiến độ vừa thay đổi. Tính lại từ dữ liệu mới.');
}
export async function recomputeSubmission(db: EvidenceDb, learnerId: string, submissionId: string, now = new Date()) {
  const { results = [] } = await db
    .prepare(
      'SELECT DISTINCT j.value AS skill FROM attempts a,json_each(a.skill_ids) j JOIN skills sk ON sk.id=j.value AND sk.learner_id=a.learner_id WHERE a.learner_id=? AND a.submission_id=?',
    )
    .bind(learnerId, submissionId)
    .all<{ skill: string }>();
  for (const r of results) await recomputeSkill(db, learnerId, r.skill, now);
}
export async function readSubjectSkills(db: EvidenceDb, learnerId: string, subjectId: string) {
  const { results = [] } = await db
    .prepare(
      `SELECT s.*,st.mastery,st.mastery_ceiling,st.dim_knowledge,st.dim_recognition,st.dim_application,st.dim_retention,st.next_review_day,st.review_kind,st.maintained,st.recent_exposure,st.stuck_on,st.revision AS state_revision FROM skills s LEFT JOIN skill_states st ON st.skill_id=s.id WHERE s.learner_id=? AND s.subject_id=? ORDER BY s.path_order,s.id`,
    )
    .bind(learnerId, subjectId)
    .all<Record<string, unknown>>();
  const { results: errors = [] } = await db
    .prepare('SELECT * FROM error_patterns WHERE learner_id=? AND subject_id=? ORDER BY last_seen_at DESC')
    .bind(learnerId, subjectId)
    .all<Record<string, unknown>>();
  return { skills: results, errors };
}
