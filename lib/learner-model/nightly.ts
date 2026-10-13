import type { EvidenceDb } from '../evidence/submit.ts';
import { berlinDay } from '../daily-policy.ts';
import { addDays } from './rules.ts';
import { recomputeSkill } from './recompute.ts';

/**
 * A cron run on Workers Free may make only ~50 D1 queries and each recompute takes ~5, so the nightly
 * refresh only touches skills whose state can change with time alone: a review coming due, or exposure
 * leaving the 14-day window. Submissions and AI jobs already recompute the skills they touch.
 */
export const NIGHTLY_SKILL_LIMIT = 6;

export async function refreshSkills(db: EvidenceDb, now: Date, limit = NIGHTLY_SKILL_LIMIT) {
  const today = berlinDay(now);
  const { results = [] } = await db
    .prepare(
      `SELECT st.skill_id AS id, st.learner_id FROM skill_states st
       JOIN skills s ON s.id = st.skill_id JOIN subjects n ON n.id = s.subject_id
       WHERE s.status = 'active' AND n.status = 'active' AND substr(st.updated_at, 1, 10) < ?
         AND ((st.next_review_day IS NOT NULL AND st.next_review_day <= ?) OR st.last_attempt_at >= ?)
       ORDER BY st.updated_at LIMIT ?`,
    )
    .bind(today, today, addDays(today, -15), limit)
    .all<{ id: string; learner_id: string }>();
  let failed = 0;
  for (const skill of results) {
    try {
      await recomputeSkill(db, skill.learner_id, skill.id, now);
    } catch (error) {
      failed++;
      console.error('Nightly skill refresh failed:', error instanceof Error ? error.message : error);
    }
  }
  return { refreshed: results.length - failed, failed };
}

export async function expireAttachments(db: EvidenceDb, now: Date) {
  const stamp = now.toISOString();
  await db.prepare('UPDATE attachments SET deleted_at=? WHERE deleted_at IS NULL AND expires_at<=?').bind(stamp, stamp).run();
}
