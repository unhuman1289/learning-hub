import { berlinDay } from "./daily-policy.ts";
import { berlinHour, greetingFor, readGreetingFacts } from "./greeting.ts";
import type { EvidenceDb } from "./evidence/submit.ts";
import type { NotebookOverview } from "./learner-model/overview.ts";

export async function readNotebookReport(db: EvidenceDb, learner: string, subject: string, overview: NotebookOverview | Promise<NotebookOverview>, now: Date, role: string, roadmap: { title: string }[] = []) {
  const [data, facts] = await Promise.all([overview, readGreetingFacts(db, learner, now, subject)]);
  const week = data.days.slice(-7);
  const previous = data.days.slice(0, 7);
  const tally = (days: NotebookOverview["days"]) => days.reduce((total, day) => ({
    correct: total.correct + day.correct, total: total.total + day.graded,
  }), { correct: 0, total: 0 });
  const daysStudied = week.filter(day => day.seconds > 0).length;
  const minutes = Math.floor(week.reduce((sum, day) => sum + day.seconds, 0) / 60);
  const current = tally(week);
  const last = tally(previous);
  return {
    month: berlinDay(now).slice(0, 7),
    daysStudied, minutes, current, previous: last,
    lessonsDone: facts.lessonsDoneThisWeek,
    solid: facts.newlySolid,
    due: facts.dueReviews,
    next: roadmap.slice(0, 3).map(step => step.title),
    errors: data.errors.slice(0, 2).map(error => error.label),
    cheer: greetingFor({ ...facts, firstTryThisWeek: current, firstTryLastWeek: last, minutesToday: 0, targetMinutes: 0 },
      { name: "", day: berlinDay(now), hour: berlinHour(now), role }).cheer,
  };
}

export type NotebookReport = Awaited<ReturnType<typeof readNotebookReport>>;
