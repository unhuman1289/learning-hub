import { ApiError } from '../api-error.ts';
import { cutoffFor } from '../daily-policy.ts';
import type { EvidenceDb } from '../evidence/submit.ts';
import type { Job } from './context/common.ts';
import { primaryBlocksDailySql, primarySnapshotSql } from './daily-eligibility.ts';

export const dailyContextChangedMessage = 'Sổ hoặc bài đang học đã thay đổi; cần soạn lại với ngữ cảnh mới.';

export class DailyContextChanged extends ApiError {
  constructor() {
    super(409, dailyContextChangedMessage);
    this.name = 'DailyContextChanged';
  }
}

// The submitted primary can have one or more assessment jobs. Wait for their
// writes to settle before spending a model call or recording a prepared plan.
export const pendingPrimaryAssessmentSql = `ai_jobs.ref_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM submissions sub JOIN ai_jobs assess
    ON assess.dedupe_key='assess:submission:' || sub.learner_id || ':' || sub.id
  WHERE sub.lesson_id=ai_jobs.ref_id AND sub.learner_id=ai_jobs.learner_id
    AND assess.status IN ('queued','leased')
)`;

// Checks the lease's stored snapshot. Reuse this predicate when storing a prepared result.
export const dailyContextMatchesSql = `ai_jobs.context_snapshot IS NOT NULL
  AND NOT (${pendingPrimaryAssessmentSql})
  AND (ai_jobs.subject_id IS NULL OR json_array_length(ai_jobs.context_snapshot,'$.subjects')=1)
  AND NOT EXISTS (
    SELECT 1 FROM json_each(ai_jobs.context_snapshot,'$.subjects') c
    LEFT JOIN subjects s ON s.id=json_extract(c.value,'$.subjectId') AND s.learner_id=ai_jobs.learner_id
    WHERE s.id IS NULL OR s.status<>'active' OR s.ai_enabled<>1
      OR s.revision<>json_extract(c.value,'$.revision')
      OR (CASE WHEN s.legacy_track IS NULL OR ai_jobs.adaptive=1
        THEN (${primarySnapshotSql(true, 's.learner_id', 's.id')})
        ELSE (${primarySnapshotSql(false, 's.learner_id', 's.id')}) END)
        IS NOT json_extract(c.value,'$.slot.openPrimaryLessonId')
      OR ((s.legacy_track IS NULL OR ai_jobs.adaptive=1) AND (NOT EXISTS (
        SELECT 1 FROM learning_lessons l WHERE l.user_id=s.learner_id AND l.subject_id=s.id AND l.slot='primary'
          AND l.package_version IN ('2','3') AND (${primaryBlocksDailySql(true)})
      )) IS NOT json_extract(c.value,'$.slot.eligibleForPrimary'))
      OR (SELECT CASE WHEN completed_at IS NULL THEN id END FROM learning_lessons
        WHERE user_id=s.learner_id AND subject_id=s.id AND slot='review'
        ORDER BY assigned_date DESC,updated DESC,id DESC LIMIT 1)
        IS NOT json_extract(c.value,'$.slot.openReviewSetId')
  )`;

export function dailyContextBindings(day: string) {
  return [day, cutoffFor(day)];
}

export async function assertDailyContext(db: EvidenceDb, job: Job) {
  const current = await db.prepare(`SELECT 1 FROM ai_jobs WHERE ${dailyContextMatchesSql}
    AND id=? AND status='leased' AND lease_token_sha256=?`)
    .bind(...dailyContextBindings(job.learning_day), job.id, job.lease_token_sha256).first();
  if (!current) throw new DailyContextChanged();
}

/** A lease that spent nothing can be rebuilt. An already generated draft ends here. */
export async function finishStaleDailyLease(db: EvidenceDb, job: Job, now = new Date()) {
  const stamp = now.toISOString();
  const saved = await db.prepare(`UPDATE ai_jobs SET
    status=CASE WHEN openai_calls=0 THEN 'queued' ELSE 'failed' END,
    finished_at=CASE WHEN openai_calls=0 THEN NULL ELSE ? END, error=?, updated_at=?,
    lease_token_sha256=NULL, lease_expires_at=NULL
    WHERE id=? AND status='leased' AND lease_token_sha256=? AND apply_token IS NULL
      AND NOT EXISTS(SELECT 1 FROM prepared_daily_plans WHERE job_id=ai_jobs.id)
    RETURNING status`).bind(stamp, dailyContextChangedMessage, stamp, job.id, job.lease_token_sha256).first<{ status: string }>();
  if (!saved) throw new ApiError(409, 'Lease vừa thay đổi.');
  return saved;
}
