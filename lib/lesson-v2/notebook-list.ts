import type { EvidenceDb } from "../evidence/submit.ts";

export type NotebookLessonRow = {
  id: string; title: string; completedAt: string | null; assignedDate: string;
  kind: string; slot: string; reason: string; minutes: number | null; skill: string | null;
  hasWork: number; correct: number; graded: number; attempted: number; total: number;
  solutionsSeen: number; correction: number; firstMonth: string;
};

export async function readNotebookLessons(db: EvidenceDb, learner: string, subject: string, all: boolean, offset: number, openOnly = false) {
  const limit = all ? 400 : 50;
  const { results = [] } = await db.prepare(`
    WITH page AS (
      SELECT l.*, substr((SELECT min(history.assigned_date) FROM learning_lessons history
        WHERE history.user_id=l.user_id AND history.subject_id=l.subject_id
          AND history.package_version IN ('2','3')),1,7) firstMonth
      FROM learning_lessons l WHERE user_id=? AND subject_id=? AND package_version IN ('2','3') AND (?=0 OR completed_at IS NULL)
      ORDER BY CASE WHEN ?=1 THEN assigned_date END DESC, completed_at IS NOT NULL,
        coalesce(completed_at,updated) DESC,id DESC
      LIMIT ? OFFSET ?
    ), current_attempts AS (
      SELECT a.lesson_id,a.item_id,a.attempt_no,a.support,a.status,g.result,
        row_number() OVER (PARTITION BY a.lesson_id,a.item_id ORDER BY a.attempt_no DESC) position
      FROM attempts a JOIN page l ON l.id=a.lesson_id AND l.user_id=a.learner_id
      LEFT JOIN grades g ON g.id=a.current_grade_id AND g.attempt_id=a.id
      WHERE a.status<>'void'
    ), counts AS (
      SELECT lesson_id,
        count(*) FILTER (WHERE position=1) attempted,
        count(*) FILTER (WHERE position=1 AND result IN ('partial','incorrect')) correction,
        count(*) FILTER (WHERE attempt_no=1 AND support='none' AND status='graded'
          AND result IN ('correct','partial','incorrect')) graded,
        count(*) FILTER (WHERE attempt_no=1 AND support='none' AND status='graded' AND result='correct') correct
      FROM current_attempts GROUP BY lesson_id
    )
    SELECT l.id,json_extract(l.payload,'$.title') title,l.assigned_date assignedDate,l.completed_at completedAt,
      l.kind,l.slot,l.reason,l.est_minutes minutes,l.firstMonth,
      coalesce(c.attempted,0)>0 hasWork,coalesce(c.attempted,0) attempted,
      json_array_length(l.payload,'$.items') total,coalesce(c.correct,0) correct,coalesce(c.graded,0) graded,
      coalesce(c.correction,0) correction,
      (SELECT count(*) FROM json_each(l.support) WHERE value='solution') solutionsSeen,
      (SELECT name FROM skills WHERE id=json_extract(l.payload,'$.targetSkills[0]')
        AND learner_id=l.user_id AND subject_id=l.subject_id) skill
    FROM page l LEFT JOIN counts c ON c.lesson_id=l.id
    ORDER BY CASE WHEN ?=1 THEN l.assigned_date END DESC, l.completed_at IS NOT NULL,
      coalesce(l.completed_at,l.updated) DESC,l.id DESC
  `).bind(learner, subject, Number(openOnly), Number(all), limit + 1, offset, Number(all)).all<NotebookLessonRow>();
  const hasMore = results.length > limit;
  let end = limit;
  if (all && hasMore) {
    const nextMonth = results[limit].assignedDate.slice(0, 7);
    const boundary = results.findIndex(row => row.assignedDate.startsWith(nextMonth));
    if (boundary > 0) end = boundary;
  }
  return { lessons: results.slice(0, end), nextOffset: hasMore ? offset + end : null };
}
