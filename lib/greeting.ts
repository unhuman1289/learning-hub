import type { EvidenceDb } from "./evidence/submit.ts";
import { berlinDay } from "./daily-policy.ts";

const dayAt = (day: string, offset: number) =>
  new Date(Date.parse(day) + offset * 86_400_000).toISOString().slice(0, 10);

export async function readGreetingFacts(db: EvidenceDb, learner: string, now: Date, subject: string | null = null) {
  const day = berlinDay(now);
  const week = dayAt(day, -6);
  const fortnight = dayAt(day, -13);
  const [study, grades, lessons, skills] = await Promise.all([
    db.prepare(`SELECT st.day, sum(st.seconds) seconds FROM study_time st
      JOIN subjects s ON s.learner_id=st.user_id AND (s.id=st.track OR s.legacy_track=st.track)
      WHERE st.user_id=? AND st.day<=? AND s.status='active' AND (? IS NULL OR s.id=?) GROUP BY st.day
      HAVING sum(st.seconds)>=120 ORDER BY st.day DESC LIMIT 365`)
      .bind(learner, day, subject, subject).all<{ day: string; seconds: number }>(),
    db.prepare(`SELECT a.day>=? AS recent, count(*) AS total, sum(g.result='correct') AS correct
      FROM attempts a JOIN grades g ON g.id=a.current_grade_id AND g.attempt_id=a.id
      JOIN learning_lessons l ON l.id=a.lesson_id
      JOIN subjects s ON s.id=l.subject_id AND s.learner_id=l.user_id
      WHERE a.learner_id=? AND a.day BETWEEN ? AND ? AND s.status='active' AND (? IS NULL OR s.id=?)
      AND a.attempt_no=1 AND a.support='none' AND a.status='graded'
      AND g.result IN ('correct','partial','incorrect') GROUP BY recent`)
      .bind(week, learner, fortnight, day, subject, subject).all<{ recent: number; total: number; correct: number }>(),
    db.prepare(`SELECT l.completed_at, s.title FROM learning_lessons l
      JOIN subjects s ON s.id=l.subject_id AND s.learner_id=l.user_id
      WHERE l.user_id=? AND s.status='active' AND l.package_version='2' AND (? IS NULL OR s.id=?)
      AND (l.completed_at IS NULL OR l.completed_at>=?)`)
      .bind(learner, subject, subject, dayAt(week, -1)).all<{ completed_at: string | null; title: string }>(),
    db.prepare(`SELECT st.mastery, st.next_review_day, st.last_independent_at, sk.name
      FROM skill_states st JOIN subjects s ON s.id=st.subject_id AND s.learner_id=st.learner_id
      JOIN skills sk ON sk.id=st.skill_id
      WHERE st.learner_id=? AND s.status='active' AND sk.status='active' AND (? IS NULL OR s.id=?)
      ORDER BY st.last_independent_at DESC, sk.id`)
      .bind(learner, subject, subject).all<{ mastery: string; next_review_day: string | null; last_independent_at: string | null; name: string }>(),
  ]);
  const days = new Set(study.results?.map((row) => row.day));
  let cursor = days.has(day) ? day : dayAt(day, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = dayAt(cursor, -1);
  }
  const lastDay = study.results?.[0]?.day;
  const done = (lessons.results ?? []).filter((row) => row.completed_at && berlinDay(new Date(row.completed_at)) >= week);
  const titles = new Set(done.map((row) => row.title));
  const firstTry = (recent: number) => grades.results?.find((row) => row.recent === recent) ?? { correct: 0, total: 0 };
  return {
    daysStudied14: [...days].filter((date) => date >= fortnight).length,
    streak,
    daysSinceLast: lastDay ? (Date.parse(day) - Date.parse(lastDay)) / 86_400_000 : null,
    firstTryThisWeek: firstTry(1),
    firstTryLastWeek: firstTry(0),
    lessonsDoneThisWeek: done.length,
    notebook: titles.size === 1 ? done[0].title : null,
    newlySolid: (skills.results ?? []).filter((skill) =>
      skill.mastery === "demonstrated" && skill.last_independent_at &&
      berlinDay(new Date(skill.last_independent_at)) >= week).slice(0, 2).map((skill) => skill.name),
    dueReviews: (skills.results ?? []).filter((skill) =>
      skill.mastery === "needs_review" || (skill.next_review_day && skill.next_review_day <= day)).length,
    openLessons: (lessons.results ?? []).filter((row) => !row.completed_at).length,
  };
}

type Facts = Awaited<ReturnType<typeof readGreetingFacts>> & { minutesToday: number; targetMinutes: number };
type CheerKind = "goal-today" | "streak" | "better" | "solid" | "done-week" | "welcome-back" | "review" | "open" | "start";
export type Greeting = { hello: string; cheer: string | null; kind: CheerKind | null };

export function berlinHour(date: Date) {
  return Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin", hour: "numeric", hourCycle: "h23",
  }).format(date));
}

export function greetingFor(facts: Facts, { name, day, hour, role }: { name: string; day: string; hour: number; role: string }): Greeting {
  const choice = Array.from(day + name).reduce((hash, ch) => (Math.imul(hash, 31) + ch.codePointAt(0)!) >>> 0, 0) % 3;
  const hello = (hour >= 5 && hour < 10 ? ["Chào buổi sáng", "Buổi sáng vui nhé", "Chào sáng nay"]
    : hour >= 10 && hour < 13 ? ["Chào bạn", "Chào", "Rất vui gặp bạn"]
    : hour >= 13 && hour < 18 ? ["Chào buổi chiều", "Buổi chiều vui nhé", "Chào bạn chiều nay"]
    : hour >= 18 && hour < 22 ? ["Chào buổi tối", "Buổi tối vui nhé", "Chào bạn tối nay"]
    : ["Khuya rồi", "Chào bạn", "Chào bạn đêm nay"])[choice] + `, ${name}.`;
  const { correct, total } = facts.firstTryThisWeek;
  const previous = facts.firstTryLastWeek;
  const n = facts.lessonsDoneThisWeek;
  const notebook = facts.notebook ? ` ${facts.notebook}` : "";
  const skills = facts.newlySolid.join(", ");
  const due = facts.dueReviews;
  const variants: [CheerKind, boolean, [string, string, string]][] = [
    ["goal-today", facts.targetMinutes > 0 && facts.minutesToday >= facts.targetMinutes, [
      `Bạn đã học đủ ${facts.targetMinutes} phút hôm nay.`, `Hôm nay bạn đã đạt mục tiêu ${facts.targetMinutes} phút.`, `Đủ ${facts.targetMinutes} phút học rồi, bạn có thể nghỉ nhé.`]],
    ["streak", facts.streak >= 3, [`Bạn đã học ${facts.streak} ngày liền. Giữ nhịp nhé!`, `${facts.streak} ngày liền bạn đều dành thời gian học.`, `Bạn giữ nhịp học ${facts.streak} ngày rồi.`]],
    ["better", total >= 5 && previous.total > 0 && 10 * (correct * previous.total - previous.correct * total) >= total * previous.total, [
      `Tuần này bạn đúng ngay ${correct}/${total} câu, khá hơn tuần trước.`, `Bạn làm đúng ngay ${correct}/${total} câu, nhỉnh hơn tuần trước.`, `Bạn tiến bộ rồi: đúng ngay ${correct}/${total} câu tuần này.`]],
    ["solid", facts.newlySolid.length > 0, [`Bạn vừa nắm vững: ${skills}.`, `Bạn đã tự làm tốt: ${skills}.`, `Bạn đã vững phần ${skills}.`]],
    ["done-week", n >= 2, [`Tuần này bạn đã xong ${n} bài${notebook}.`, `Bạn đã hoàn thành ${n} bài${notebook} trong tuần.`, `${n} bài${notebook} đã xong tuần này. Bạn cứ giữ nhịp nhé.`]],
    ["welcome-back", facts.daysSinceLast !== null && facts.daysSinceLast >= 3, ["Mừng bạn quay lại! Hôm nay một bài ngắn là đủ.", "Chào mừng bạn trở lại. Bắt đầu với bài ngắn nhé.", "Bạn có thể lấy lại nhịp bằng một bài ngắn."]],
    ["review", due > 0, [`Có ${due} kỹ năng cần ôn lại. Bạn chọn một bài luyện nhé.`, `Bạn có ${due} kỹ năng để ôn hôm nay.`, `Ôn lại ${due} kỹ năng nhé, bạn có thể bắt đầu từ một bài.`]],
    ["open", facts.openLessons > 0, ["Bạn còn bài đang mở. Làm tiếp nhé.", "Bài đang học vẫn chờ bạn làm tiếp.", "Bạn có thể mở lại bài đang làm."]],
    ["start", true, ["Chọn một cuốn sổ để bắt đầu nhé.", "Bạn muốn mở cuốn sổ nào hôm nay?", "Bạn có thể bắt đầu từ một cuốn sổ."]],
  ];
  const [kind, , messages] = variants.find(([, applies]) => applies)!;
  const star = role === "child" && ["streak", "better", "solid"].includes(kind) ? "⭐ " : "";
  return { hello, cheer: star + messages[choice], kind };
}
