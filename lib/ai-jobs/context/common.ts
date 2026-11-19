import type { EvidenceDb } from '../../evidence/submit.ts';
import { sha256Hex } from '../../auth/automation.ts';
import { safeText } from '../../automation/privacy.ts';
import { readSubjectSkills } from '../../learner-model/recompute.ts';
import { canAdvance, cutoffFor } from '../../daily-policy.ts';
import { wholeLessonSubmissionSql } from '../daily-eligibility.ts';
export { safeText } from '../../automation/privacy.ts';
export type Job = {
  adaptive?: number;
  id: string;
  kind: 'plan' | 'assess';
  purpose: string;
  trigger: string;
  learner_id: string;
  subject_id: string | null;
  ref_id: string | null;
  learning_day: string;
  status: string;
  lease_client_id: string | null;
  lease_token_sha256: string | null;
  lease_expires_at: string | null;
  lease_count: number;
  context_hash: string | null;
  context_snapshot: string | null;
  result_hash: string | null;
  outcome: string | null;
  created_at: string;
  expires_at: string;
  validation_failures: number;
};
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
        .map((k) => JSON.stringify(k) + ':' + canonical((value as Record<string, unknown>)[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export async function contextHash(value: unknown) {
  return 'sha256:' + (await sha256Hex(canonical(value)));
}
export async function learnerContext(db: EvidenceDb, id: string, environment: string) {
  const settings = await db
    .prepare('SELECT role,display_name,explain_language,daily_target_minutes,preferences,ai_budget,personal_prompt FROM learner_settings WHERE user_id=?')
    .bind(id)
    .first<Record<string, unknown>>();
  return {
    public: {
      ref: 'lrn_' + (await sha256Hex(environment + ':' + id)).slice(0, 12),
      displayName: safeText(settings?.display_name || 'Người học').slice(0, 80),
      role: settings?.role === 'child' ? ('child' as const) : ('adult' as const),
      explainLanguage: String(settings?.explain_language ?? 'vi'),
      personalPrompt: safeText(settings?.personal_prompt ?? '').slice(0, 4000),
    },
    settings,
  };
}
export async function skillContext(db: EvidenceDb, learnerId: string, subjectId: string) {
  const data = await readSubjectSkills(db, learnerId, subjectId);
  return {
    skills: data.skills.map((s) => ({
      skillId: String(s.id),
      key: String(s.key),
      name: safeText(s.name),
      pathOrder: Number(s.path_order),
      prerequisites: JSON.parse(s.prerequisites as string),
      status: String(s.status),
      mastery: String(s.mastery ?? 'not_assessed'),
      masteryCeiling: String(s.mastery_ceiling ?? 'not_assessed'),
      dims: {
        knowledge: Number(s.dim_knowledge ?? 0),
        recognition: Number(s.dim_recognition ?? 0),
        application: Number(s.dim_application ?? 0),
        retention: Number(s.dim_retention ?? 0),
      },
      exposure14d: JSON.parse(String(s.recent_exposure ?? '{}')),
      stuckOn: s.stuck_on ?? null,
      nextReviewDay: typeof s.next_review_day === 'string' ? s.next_review_day : null,
      reviewKind: s.review_kind ?? null,
      maintained: s.maintained === 1,
    })),
    errors: await (async () => {
      // Example answers for every pattern in one query.
      const ids = [...new Set(data.errors.flatMap((e) => JSON.parse(e.example_attempt_ids as string) as string[]))];
      const answers = new Map<string, string>();
      // D1 binds at most 100 parameters per query.
      for (let start = 0; start < ids.length; start += 90) {
        const chunk = ids.slice(start, start + 90);
        const { results = [] } = await db
          .prepare(`SELECT id, answer FROM attempts WHERE learner_id=? AND id IN (${chunk.map(() => '?').join(',')})`)
          .bind(learnerId, ...chunk)
          .all<{ id: string; answer: string }>();
        for (const r of results) answers.set(r.id, r.answer);
      }
      return data.errors.map((e) => {
        const examples = (JSON.parse(e.example_attempt_ids as string) as string[]).flatMap((id) => (answers.has(id) ? [safeText(answers.get(id))] : []));
        return {
          patternId: String(e.id),
          skillId: String(e.skill_id),
          label: safeText(e.label),
          category: String(e.category),
          confidence: String(e.confidence),
          status: String(e.status),
          occurrences: Number(e.occurrences),
          daysSeen: Number(e.days_seen),
          examples,
          intervention: safeText(e.intervention),
        };
      });
    })(),
  };
}
export async function slots(db: EvidenceDb, learner: string, subject: string, day: string, useSubmission = false) {
  const { results = [] } = await db
    .prepare(
      `SELECT id,slot,assigned_date,completed_at,package_version,${useSubmission ? `CASE WHEN slot='primary' THEN (${wholeLessonSubmissionSql}) END` : 'NULL'} AS submitted_at
       FROM learning_lessons l WHERE user_id=? AND subject_id=? AND slot IN ('primary','review') ORDER BY assigned_date DESC,updated DESC,id DESC`,
    )
    .bind(learner, subject)
    .all<{ id: string; slot: string; assigned_date: string; completed_at: string | null; package_version: string; submitted_at: string | null }>();
  const primary = results.find((r) => r.slot === 'primary' && !r.completed_at) ?? results.find((r) => r.slot === 'primary'),
    review = results.find((r) => r.slot === 'review');
  const preceding = useSubmission ? results.find(r => r.slot === 'primary' && r.package_version !== '1') : undefined;
  const submissionReason = !preceding ? 'empty'
    : preceding.assigned_date >= day ? 'already_assigned_today'
    : !preceding.submitted_at ? 'unsubmitted'
    : preceding.submitted_at >= cutoffFor(day) ? 'submitted_after_cutoff'
    : 'submitted_before_cutoff';
  return {
    openPrimaryLessonId: useSubmission ? preceding?.id ?? null : primary && !primary.completed_at ? primary.id : null,
    eligibleForPrimary: useSubmission ? ['empty', 'submitted_before_cutoff'].includes(submissionReason) : canAdvance(primary ? { assignedDate: primary.assigned_date, completedAt: primary.completed_at } : undefined, day),
    reason: useSubmission ? submissionReason : !primary ? 'empty' : !primary.completed_at ? 'unfinished' : primary.assigned_date===day ? 'already_assigned_today' : canAdvance({assignedDate:primary.assigned_date,completedAt:primary.completed_at},day) ? 'completed_before_cutoff' : 'completed_after_cutoff',
    openReviewSetId: review && !review.completed_at ? review.id : null,
    eligibleForReview: !review || (!!review.completed_at && review.assigned_date !== day),
  };
}
