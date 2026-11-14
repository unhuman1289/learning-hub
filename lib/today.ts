import type { EvidenceDb } from './evidence/submit.ts';
import { berlinHour, greetingFor, readGreetingFacts } from "./greeting.ts";
import { readDaySql, toStudyDay } from './study-sql.ts';
import { berlinDay } from './daily-policy.ts';
export type TodayItem = {
  id: string;
  lessonId: string | null;
  subjectId: string;
  title: string;
  subjectTitle: string;
  category: 'correction' | 'review' | 'unfinished' | 'new' | 'exploration';
  minutes: number;
  reason: string;
  optional: boolean;
  hasWork?: boolean;
  assignedDay: string | null;
};
const rank = { correction: 0, review: 1, unfinished: 2, new: 3, exploration: 4 };
export function sortToday(rows: (TodayItem & { weight?: number })[], minutes: number, target: number) {
  return [...rows]
    .sort((a, b) => rank[a.category] - rank[b.category] || (b.weight ?? 0) - (a.weight ?? 0) || a.id.localeCompare(b.id, 'en'))
    .map((r) => ({ ...r, optional: minutes >= target }));
}
/** `hour` is the learner's own clock hour (greeting words only); without it the greeting follows Berlin. */
export async function todayFor(db: EvidenceDb, learner: string, now = new Date(), viewer = learner, hour: number | null = null) {
  const day = berlinDay(now);
  const [setting, { results: studyRows = [] }, { results = [] }, { results: due = [] }, facts] = await Promise.all([
    db
      .prepare('SELECT st.daily_target_minutes, st.role, coalesce(st.display_name,u.name) name FROM "user" u LEFT JOIN learner_settings st ON st.user_id=u.id WHERE u.id=?')
      .bind(learner)
      .first<{ daily_target_minutes: number | null; name: string; role: string | null }>(),
    db
    .prepare(readDaySql)
    .bind(learner, day)
    .all<{ track: string; seconds: number }>(),
    db
    .prepare(
      `SELECT l.id,l.subject_id,json_extract(l.payload,'$.title') AS title,l.assigned_date,l.slot,l.est_minutes,s.title AS subject_title,s.weight,s.system_kind,
 EXISTS(SELECT 1 FROM attempts a JOIN grades g ON g.id=a.current_grade_id WHERE a.lesson_id=l.id AND a.status='graded' AND g.result IN ('incorrect','partial') AND NOT EXISTS(SELECT 1 FROM attempts newer WHERE newer.lesson_id=a.lesson_id AND newer.item_id=a.item_id AND newer.attempt_no>a.attempt_no)) AS correction,
 EXISTS(SELECT 1 FROM attempts a WHERE a.lesson_id=l.id) AS has_work
 FROM learning_lessons l JOIN subjects s ON s.id=l.subject_id AND s.learner_id=l.user_id WHERE l.user_id=? AND l.completed_at IS NULL AND s.status='active' AND (l.snoozed_until IS NULL OR l.snoozed_until<=?) AND l.package_version IN ('2','3') ORDER BY l.assigned_date,l.id`,
    )
    .bind(learner, day)
    .all<Record<string, unknown>>(),
    db
    .prepare(
      `SELECT st.subject_id,s.title,s.weight,count(*) AS n FROM skill_states st JOIN subjects s ON s.id=st.subject_id AND s.learner_id=st.learner_id WHERE st.learner_id=? AND st.next_review_day<=? AND s.status='active' GROUP BY st.subject_id`,
    )
    .bind(learner, day)
    .all<{ subject_id: string; title: string; weight: number; n: number }>(),
    viewer === learner ? readGreetingFacts(db, learner, now) : null,
  ]);
  const rows: (TodayItem & { weight?: number })[] = results.map((r) => ({
    id: String(r.id),
    lessonId: String(r.id),
    subjectId: String(r.subject_id),
    title: String(r.title),
    subjectTitle: String(r.subject_title),
    category:
      r.correction === 1
        ? 'correction'
        : r.slot === 'extra'
          ? r.system_kind === 'explore' ? 'exploration' : 'new'
          : r.slot === 'review'
            ? 'review'
            : r.assigned_date === day
              ? 'new'
              : 'unfinished',
    minutes: Number(r.est_minutes),
    reason:
      r.correction === 1
        ? 'Có câu cần sửa lại'
        : r.slot === 'extra' && r.system_kind !== 'explore'
          ? 'Bài mới'
          : r.slot === 'review'
            ? 'Ôn lại'
          : r.assigned_date === day
            ? 'Bài mới hôm nay'
            : 'Làm tiếp bài hôm trước',
    optional: false,
    hasWork: r.has_work === 1,
    assignedDay: String(r.assigned_date),
    weight: Number(r.weight),
  }));
  for (const r of due)
    if (!rows.some((x) => x.subjectId === r.subject_id && x.category === 'review'))
      rows.push({
        id: 'due:' + r.subject_id,
        lessonId: null,
        subjectId: r.subject_id,
        subjectTitle: r.title,
        title: 'Ôn lại ' + r.n + ' kỹ năng',
        category: 'review',
        minutes: 0,
        reason: '',
        optional: false,
        assignedDay: null,
        weight: r.weight,
      });
  const study = toStudyDay(day, studyRows, setting?.daily_target_minutes);
  const minutes = Object.values(study.seconds).reduce<number>((sum, seconds) => sum + (seconds ?? 0), 0) / 60;
  const { targetMinutes } = study;
  const name = setting?.name ?? "bạn";
  const greeting = facts
    ? greetingFor({ ...facts, minutesToday: minutes, targetMinutes },
      { name, day, hour: hour ?? berlinHour(now), role: setting?.role ?? "adult" })
    : { hello: `Bàn của ${name}`, cheer: null, kind: null };
  return {
    greeting,
    day,
    minutes,
    targetMinutes,
    study,
    items: sortToday(rows, minutes, targetMinutes),
  };
}
