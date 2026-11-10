import { learningTracks, type LearningTrack } from './daily-policy.ts';

/** Default daily study target for an account that has not chosen one. */
export const DEFAULT_TARGET_MINUTES = 45;
export const MIN_TARGET_MINUTES = 5;
export const MAX_TARGET_MINUTES = 720;
/** One client report covers at most two minutes; the client flushes every 30 seconds. */
export const MAX_REPORT_SECONDS = 120;
const MAX_DAY_SECONDS = 24 * 60 * 60;

/** A notebook key: a legacy track name, or the id of a notebook opened since 0007 (`sub_…`). */
export type StudyKey = LearningTrack | `sub_${string}`;
export type StudyDay = {day: string; targetMinutes: number; seconds: Partial<Record<StudyKey, number>>};
const SUBJECT_KEY = /^sub_[0-9a-f]{20}$/;

export function isSubjectKey(value: unknown): value is `sub_${string}` {
  return typeof value === 'string' && SUBJECT_KEY.test(value);
}

export function isStudyKey(value: unknown): value is StudyKey {
  return isStudyTrack(value) || isSubjectKey(value);
}

export function isStudyTrack(value: unknown): value is LearningTrack {
  return typeof value === 'string' && (learningTracks as readonly string[]).includes(value);
}

export function validReportSeconds(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_REPORT_SECONDS;
}

export function validTargetMinutes(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= MIN_TARGET_MINUTES && (value as number) <= MAX_TARGET_MINUTES;
}

/** Adds measured seconds to one account/day/notebook, never beyond a full day. */
export const addSecondsSql = `INSERT INTO study_time (user_id, day, track, seconds, updated) VALUES (?, ?, ?, ?, ?)
ON CONFLICT(user_id, day, track) DO UPDATE SET seconds = MIN(${MAX_DAY_SECONDS}, study_time.seconds + excluded.seconds), updated = excluded.updated`;

export const setTargetSql = `INSERT INTO learner_settings (user_id, daily_target_minutes, updated) VALUES (?, ?, ?)
ON CONFLICT(user_id) DO UPDATE SET daily_target_minutes = excluded.daily_target_minutes, updated = excluded.updated`;

export const readDaySql = 'SELECT track, seconds FROM study_time WHERE user_id = ? AND day = ?';
export const readTargetSql = 'SELECT daily_target_minutes AS target FROM learner_settings WHERE user_id = ?';

export function toStudyDay(day: string, rows: {track: string; seconds: number}[], target: number | null | undefined): StudyDay {
  const seconds: StudyDay['seconds'] = {};
  for (const row of rows) if (isStudyKey(row.track)) seconds[row.track] = Number(row.seconds) || 0;
  return {day, targetMinutes: target ?? DEFAULT_TARGET_MINUTES, seconds};
}
