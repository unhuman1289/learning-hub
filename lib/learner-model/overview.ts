import { berlinDay } from '../daily-policy.ts';
import type { EvidenceDb } from '../evidence/submit.ts';
import { addDays } from './rules.ts';

export async function readNotebookOverview(db: EvidenceDb, learner: string, subject: string, legacyTrack: string | null, now = new Date(), includeSuspected = true) {
  const today = berlinDay(now);
  const start = addDays(today, -13);
  const [study, attempts, skills, errors] = await Promise.all([
    db.prepare(
      'SELECT day,sum(seconds) AS seconds FROM study_time WHERE user_id=? AND day BETWEEN ? AND ? AND (track=? OR track=?) GROUP BY day',
    ).bind(learner, start, today, subject, legacyTrack).all<{ day: string; seconds: number }>(),
    db.prepare(
      `SELECT a.day, count(*) AS total, sum(g.result='correct') AS correct
       FROM attempts a JOIN grades g ON g.id=a.current_grade_id AND g.attempt_id=a.id
       WHERE a.learner_id=? AND a.subject_id=? AND a.day BETWEEN ? AND ?
         AND a.attempt_no=1 AND a.support='none' AND a.status='graded'
         AND g.result IN ('correct','partial','incorrect')
       GROUP BY a.day`,
    ).bind(learner, subject, start, today).all<{ day: string; total: number; correct: number }>(),
    db.prepare(
      `SELECT k.id,k.key,k.name,st.mastery,st.next_review_day AS reviewDay
       FROM skills k JOIN skill_states st ON st.skill_id=k.id AND st.learner_id=k.learner_id
       WHERE k.learner_id=? AND k.subject_id=? AND k.status<>'retired' AND st.mastery<>'not_assessed'
       ORDER BY CASE
         WHEN st.mastery='needs_review' OR st.next_review_day<=? THEN 0
         WHEN st.mastery IN ('introduced','developing') THEN 1
         ELSE 2 END, k.path_order,k.id
       LIMIT 3`,
    ).bind(learner, subject, today).all<{ id: string; key: string; name: string; mastery: string; reviewDay: string | null }>(),
    db.prepare(
      `SELECT e.id,e.label,e.occurrences,e.days_seen AS daysSeen,e.confidence,e.status
       FROM error_patterns e JOIN skills k ON k.id=e.skill_id AND k.learner_id=e.learner_id AND k.subject_id=e.subject_id
       WHERE e.learner_id=? AND e.subject_id=? AND e.status IN ('open','improving')
         AND e.occurrences>0 AND k.status<>'retired'
         AND (e.confidence='confirmed' OR ?=1)
       ORDER BY (e.confidence='confirmed') DESC, e.occurrences DESC, e.days_seen DESC, e.last_seen_at DESC, e.id
       LIMIT 3`,
    ).bind(learner, subject, Number(includeSuspected)).all<{
      id: string; label: string; occurrences: number; daysSeen: number;
      confidence: 'confirmed' | 'suspected'; status: 'open' | 'improving';
    }>(),
  ]);
  const timeByDay = new Map((study.results ?? []).map(row => [row.day, row.seconds]));
  const answersByDay = new Map((attempts.results ?? []).map(row => [row.day, row]));
  const days = Array.from({ length: 14 }, (_, i) => {
    const day = addDays(start, i);
    const answers = answersByDay.get(day);
    return { day, seconds: timeByDay.get(day) ?? 0, correct: answers?.correct ?? 0, graded: answers?.total ?? 0 };
  });
  return {
    days,
    errors: errors.results ?? [],
    skills: (skills.results ?? []).map(skill => ({
      id: skill.id,
      name: skill.name,
      facet: /^[gpn]-/.test(skill.key) ? skill.key[0] : null,
      state: skill.mastery === 'needs_review' || (skill.reviewDay && skill.reviewDay <= today)
        ? 'review' as const : skill.mastery === 'demonstrated' ? 'demonstrated' as const : 'learning' as const,
    })),
  };
}

export type NotebookOverview = Awaited<ReturnType<typeof readNotebookOverview>>;
