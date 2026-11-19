import type { EvidenceDb } from "./evidence/submit.ts";
import { berlinDay } from "./daily-policy.ts";
import { capitalize, tutorAddress, tutorGreeting, type TutorAddress } from "./tutor/address.ts";

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
    db.prepare(`SELECT l.completed_at, l.snoozed_until, s.title FROM learning_lessons l
      JOIN subjects s ON s.id=l.subject_id AND s.learner_id=l.user_id
      WHERE l.user_id=? AND s.status='active' AND l.package_version IN ('2','3') AND (? IS NULL OR s.id=?)
      AND (l.completed_at IS NULL OR l.completed_at>=?) ORDER BY s.title, l.id`)
      .bind(learner, subject, subject, dayAt(week, -1)).all<{ completed_at: string | null; snoozed_until: string | null; title: string }>(),
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
  const open = (lessons.results ?? []).filter(row => !row.completed_at && (!row.snoozed_until || row.snoozed_until <= day));
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
    openLessons: open.length,
    openNotebooks: [...new Set(open.map(row => row.title))],
  };
}

type Facts = Omit<Awaited<ReturnType<typeof readGreetingFacts>>, "openNotebooks"> & {
  minutesToday: number; targetMinutes: number; openNotebooks?: string[]; awaitingGrade?: boolean;
};
type CheerKind = "grading" | "goal-today" | "streak" | "better" | "solid" | "done-week" | "welcome-back" | "review" | "open" | "start";
export type Greeting = { hello: string; cheer: string | null; kind: CheerKind | null };

export function berlinHour(date: Date) {
  return Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin", hour: "numeric", hourCycle: "h23",
  }).format(date));
}

/** The learner's own clock hour from `?hour=`; anything but a whole hour 0–23 is ignored. It only chooses the words of the greeting. */
export function deviceHour(raw: string | null): number | null {
  return raw !== null && /^\d{1,2}$/.test(raw) && Number(raw) < 24 ? Number(raw) : null;
}

export function greetingFor(
  facts: Facts,
  { name, day, hour, role, address = tutorAddress(null, name) }: {
    name: string; day: string; hour: number; role: string; address?: TutorAddress;
  },
): Greeting {
  const choice = Array.from(day + name).reduce((hash, ch) => (Math.imul(hash, 31) + ch.codePointAt(0)!) >>> 0, 0) % 3;
  const period = hour < 5 || hour >= 22 ? "" : hour < 11 ? "buổi sáng" : hour < 13 ? "buổi trưa" : hour < 18 ? "buổi chiều" : "buổi tối";
  const formal = address.self === "cháu";
  const ending = formal ? "." : "!";
  const hello = tutorGreeting(address, period, ending);
  const { correct, total } = facts.firstTryThisWeek;
  const previous = facts.firstTryLastWeek;
  const n = facts.lessonsDoneThisWeek;
  const notebook = facts.notebook ? ` trong sổ ${facts.notebook}` : "";
  const skills = facts.newlySolid.join(", ");
  const due = facts.dueReviews;
  const open = facts.openLessons;
  const openNotebooks = facts.openNotebooks ?? [];
  const named = openNotebooks.slice(0, 2);
  const more = openNotebooks.length - named.length;
  const list = named.length ? `: ${more ? `${named.join(", ")} và ${more} sổ nữa` : named.join(" và ")}` : "";
  const openLine = `${open} bài đang mở${list}`;
  const variants: [CheerKind, boolean, [string, string, string]][] = [
    ["grading", !!facts.awaitingGrade, [
      "Có bài vừa nộp đang chờ chấm.", "Bài đã nộp rồi, đang chờ chấm.", "Có bài đang chờ lời phê."]],
    ["goal-today", facts.targetMinutes > 0 && facts.minutesToday >= facts.targetMinutes, [
      `Hôm nay đã học đủ ${facts.targetMinutes} phút rồi.`, `Đủ ${facts.targetMinutes} phút học hôm nay rồi.`, `Hôm nay đã đạt mục tiêu ${facts.targetMinutes} phút học.`]],
    ["streak", facts.streak >= 3, [
      `${address.call ? capitalize(address.call) + " đã" : "Đã"} học ${facts.streak} ngày liền rồi.`,
      `Đã học liền ${facts.streak} ngày rồi.`, `Giữ được nhịp học ${facts.streak} ngày liền rồi.`]],
    ["better", total >= 5 && previous.total > 0 && 10 * (correct * previous.total - previous.correct * total) >= total * previous.total, [
      `Tuần này làm đúng ngay ${correct}/${total} câu, khá hơn tuần trước.`, `Đúng ngay ${correct}/${total} câu tuần này rồi.`, `Tỉ lệ đúng ngay đã tăng, tuần này đúng ${correct}/${total} câu.`]],
    ["solid", facts.newlySolid.length > 0, [
      `Vừa nắm vững ${skills} rồi.`, `Đã tự làm tốt phần ${skills} rồi.`, `Phần ${skills} đã vững rồi.`]],
    ["done-week", n >= 2, [
      `Tuần này đã học xong ${n} bài${notebook}.`, `Đã xong ${n} bài${notebook} trong tuần rồi.`, `${n} bài${notebook} đã xong tuần này.`]],
    ["review", due > 0, [
      `Đến lúc ôn lại ${due} kỹ năng rồi.`, `Hôm nay có ${due} kỹ năng cần ôn.`, `Có ${due} kỹ năng cần ôn lại. Bắt đầu với một bài nhé.`]],
    ["open", open > 0, [
      `Hôm nay còn ${open} bài đang mở${formal ? "" : " nè"}${list}.`, `Còn ${openLine}. Học tiếp từ chỗ đang dở nhé.`, `Có ${openLine}.`]],
    ["welcome-back", facts.daysSinceLast !== null && facts.daysSinceLast >= 3, [
      "Mình bắt đầu lại với một bài ngắn nhé.", "Hôm nay bắt đầu với một bài ngắn nhé.", "Một bài ngắn cũng đủ để lấy lại nhịp."]],
    ["start", true, ["Chưa có bài nào đang mở. Chọn một cuốn sổ để bắt đầu nhé.", "Chưa có bài nào đang mở. Hôm nay mở cuốn sổ nào nhỉ?", "Chưa có bài nào đang mở. Mở sổ ra học nhé."]],
  ];
  const [kind, , messages] = variants.find(([, applies]) => applies)!;
  const star = role === "child" && ["streak", "better", "solid"].includes(kind) ? "⭐ " : "";
  return { hello, cheer: star + messages[choice], kind };
}
