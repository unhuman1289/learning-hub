import { ApiError } from '../api-error.ts';
import { berlinDay } from '../daily-policy.ts';
import type { EvidenceDb } from '../evidence/submit.ts';

export async function lessonSummary(db: EvidenceDb, learnerId: string, lessonId: string, now = new Date()) {
  const lesson = await db.prepare("SELECT subject_id FROM learning_lessons WHERE id=? AND user_id=? AND package_version='2'")
    .bind(lessonId, learnerId).first<{ subject_id: string }>();
  if (!lesson) throw new ApiError(404, 'Không tìm thấy bài.');
  const [work, time, comments, skills] = await Promise.all([
    db.prepare(`WITH ranked AS (
      SELECT a.item_id,a.attempt_no,a.status,a.support,g.result,j.status AS job_status,
        row_number() OVER (PARTITION BY a.item_id ORDER BY a.attempt_no DESC) AS position
      FROM attempts a LEFT JOIN grades g ON g.id=a.current_grade_id
      JOIN submissions s ON s.id=a.submission_id LEFT JOIN ai_jobs j ON j.id=s.ai_job_id
      WHERE a.lesson_id=? AND a.learner_id=?
    ) SELECT i.item_id,i.skill_ids,r.attempt_no,r.status,r.result,r.job_status,r.support,
      CASE json_extract(l.support,'$.'||i.item_id) WHEN 'solution' THEN 1 ELSE 0 END AS solution_seen,
      CASE json_extract(l.support,'$.'||i.item_id) WHEN 'hint1' THEN 1 WHEN 'hint2' THEN 2 ELSE 0 END AS hints,
      coalesce((SELECT max(CASE a.support WHEN 'hint1' THEN 1 WHEN 'hint2' THEN 2 ELSE 0 END)
        FROM attempts a WHERE a.lesson_id=i.lesson_id AND a.item_id=i.item_id AND a.learner_id=i.learner_id),0) AS past_hints
      FROM lesson_items i JOIN learning_lessons l ON l.id=i.lesson_id
      LEFT JOIN ranked r ON r.item_id=i.item_id AND r.position=1 WHERE i.lesson_id=? AND i.learner_id=?`)
      .bind(lessonId, learnerId, lessonId, learnerId)
      .all<{ item_id: string; skill_ids: string; attempt_no: number | null; status: string | null; result: string | null; job_status: string | null; support: string | null; solution_seen: number; hints: number; past_hints: number }>(),
    db.prepare('SELECT seconds FROM study_time WHERE user_id=? AND day=? AND track=?')
      .bind(learnerId, berlinDay(now), lesson.subject_id).first<{ seconds: number }>(),
    db.prepare(`SELECT json_extract(j.outcome,'$.summary') AS summary FROM submissions s
      JOIN ai_jobs j ON j.id=s.ai_job_id AND j.status='succeeded'
      WHERE s.lesson_id=? AND s.learner_id=? AND json_type(j.outcome,'$.summary')='text'
      ORDER BY s.created_at DESC,s.rowid DESC LIMIT 5`).bind(lessonId, learnerId).all<{ summary: string }>(),
    db.prepare('SELECT id,name FROM skills WHERE subject_id=? AND learner_id=?').bind(lesson.subject_id, learnerId).all<{ id: string; name: string }>(),
  ]);
  const items = work.results ?? [];
  const names = new Map((skills.results ?? []).map((s) => [s.id,s.name]));
  const needsPractice = new Set<string>();
  for (const item of items) if (item.result === 'partial' || item.result === 'incorrect') {
    for (const id of JSON.parse(item.skill_ids) as string[]) {
      const name = names.get(id);
      if (name) needsPractice.add(name);
    }
  }
  return {
    total: items.length,
    correctFirst: items.filter((i) => i.result === 'correct' && i.attempt_no === 1 && i.support !== 'solution').length,
    correctAfterRetry: items.filter((i) => i.result === 'correct' && (i.attempt_no ?? 0) > 1 && i.support !== 'solution').length,
    needsCorrection: items.filter((i) => i.result === 'incorrect' || i.result === 'partial').length,
    unanswered: items.filter((i) => i.attempt_no === null && !i.solution_seen).length,
    solutionsSeen: items.filter((i) => i.solution_seen || i.support === "solution").length,
    pending: items.filter((i) => i.status === 'pending' || i.status === 'grading' || (
      i.attempt_no !== null && !i.result && ['queued','leased'].includes(i.job_status ?? '')
    )).filter((i) => !['cancelled','failed','expired'].includes(i.job_status ?? '')).length,
    hintsUsed: items.reduce((n, i) => n + Math.max(i.hints,i.past_hints), 0),
    minutes: Math.floor((time?.seconds ?? 0) / 60),
    needsPractice: [...needsPractice],
    comments: [...new Set((comments.results ?? []).map((row) => row.summary).filter(Boolean))],
  };
}
export type LessonSummaryData = Awaited<ReturnType<typeof lessonSummary>>;
