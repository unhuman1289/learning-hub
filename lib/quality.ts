import type { EvidenceDb } from './evidence/submit.ts';
import { berlinDay } from './daily-policy.ts';
import { addDays } from './learner-model/rules.ts';

/**
 * Grading quality per notebook (AI-API §8.7): answers the AI graded, how many were disputed, how many
 * were overturned (by AI recheck or a parent's different grade) and faulty answer keys, over 14 and 30 days.
 */
export type QualityRow = { learnerId: string; subjectId: string; subjectTitle: string; days: 14 | 30; aiGraded: number; disputed: number; overturned: number; keyIssues: number };

export async function gradingQuality(db: EvidenceDb, learnerId: string | null, now = new Date()): Promise<QualityRow[]> {
  const today = berlinDay(now),
    rows: QualityRow[] = [];
  for (const days of [14, 30] as const) {
    const since = addDays(today, -(days - 1));
    const { results = [] } = await db
      .prepare(
        `SELECT s.learner_id AS learnerId, s.id AS subjectId, s.title AS subjectTitle,
           (SELECT count(*) FROM grades g JOIN attempts a ON a.id=g.attempt_id WHERE a.subject_id=s.id AND g.grader='ai' AND g.created_at>=?) AS aiGraded,
           (SELECT count(*) FROM disputes d JOIN attempts a ON a.id=d.attempt_id WHERE a.subject_id=s.id AND d.created_at>=?) AS disputed,
           (SELECT count(*) FROM disputes d JOIN attempts a ON a.id=d.attempt_id WHERE a.subject_id=s.id AND d.status='overturned' AND d.created_at>=?) AS overturned,
           (SELECT count(*) FROM lesson_items i WHERE i.subject_id=s.id AND i.flag='key_issue' AND i.created_at>=?) AS keyIssues
         FROM subjects s WHERE s.status<>'archived' ${learnerId ? 'AND s.learner_id=?' : ''} ORDER BY s.learner_id, s.weight DESC, s.title`,
      )
      .bind(since, since, since, since, ...(learnerId ? [learnerId] : []))
      .all<Omit<QualityRow, 'days'>>();
    for (const row of results)
      if (!learnerId && !row.aiGraded && !row.disputed && !row.keyIssues) continue;
      else rows.push({ ...row, days, aiGraded: Number(row.aiGraded), disputed: Number(row.disputed), overturned: Number(row.overturned), keyIssues: Number(row.keyIssues) });
  }
  return rows;
}
