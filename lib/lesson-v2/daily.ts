import type { Db } from '../subjects/service.ts';
import { berlinDay } from '../daily-policy.ts';
/** Desk summaries only: never include keys, hidden hints or another learner's work. */
export async function readCurrentV2(db: Db, learnerId: string, day = berlinDay()) {
  const { results = [] } = await db
    .prepare(
      `SELECT l.id,json_extract(l.payload,'$.title') title,s.title subjectTitle,l.subject_id subjectId,l.assigned_date assignedDate,l.est_minutes minutes
 FROM learning_lessons l JOIN subjects s ON s.id=l.subject_id AND s.learner_id=l.user_id
 WHERE l.user_id=? AND l.package_version IN ('2','3') AND l.completed_at IS NULL AND l.assigned_date<=? AND (l.snoozed_until IS NULL OR l.snoozed_until<=?) AND s.status='active'
 ORDER BY l.assigned_date,l.updated LIMIT 50`,
    )
    .bind(learnerId, day, day)
    .all();
  return results;
}
