import { berlinDay } from "./daily-policy";
import { readDaySql, readTargetSql, toStudyDay } from "./study-sql";

export async function readStudyDay(db: D1Database, userId: string) {
  const day = berlinDay();
  const [rows, target] = await db.batch([
    db.prepare(readDaySql).bind(userId, day),
    db.prepare(readTargetSql).bind(userId),
  ]) as unknown as [{ results?: { track: string; seconds: number }[] }, { results?: { target: number }[] }];
  return toStudyDay(day, rows.results ?? [], target.results?.[0]?.target);
}
