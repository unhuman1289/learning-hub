import { tracks } from "../content.ts";
import type { lessons, projects } from "../legacy-content.ts";
import { legacyLessonTracks } from "../legacy-lesson-tracks.ts";
import { learningTracks, type LearningTrack } from "../../lib/daily-policy.ts";

export type TrackId = LearningTrack;
export type StaticLesson = (typeof lessons)[number];
export type Project = (typeof projects)[number];

export const trackIds = learningTracks;

export const coverTitle: Record<TrackId, string> = {
  AI: "AI & Eng.",
  MTB: "MTB",
  Cardio: "Cardio",
  Deutsch: "Deutsch",
  "Bột": "Bột",
};

/** ASCII name per notebook, used for view-transition-name (the cover flies from shelf to desk). */
export const coverTransition: Record<TrackId, string> = {
  AI: "cover-ai",
  MTB: "cover-mtb",
  Cardio: "cover-cardio",
  Deutsch: "cover-deutsch",
  "Bột": "cover-bot",
};

export function trackInfo(id: TrackId) {
  return tracks.find((track) => track.id === id)!;
}

export function isTrack(value: string | null): value is TrackId {
  return !!value && (learningTracks as readonly string[]).includes(value);
}

export function findStaticTrack(id: string): TrackId | null {
  return Object.hasOwn(legacyLessonTracks, id) ? legacyLessonTracks[id] : null;
}

const berlinDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" });
export const berlinKey = (value: Date | string) => berlinDate.format(new Date(value));

/** "2026-10-09" → "09.10" for margin dates. */
export function shortDate(day: string) {
  const [, month, date] = day.slice(0, 10).split("-");
  return month && date ? `${date}.${month}` : day;
}

export function timeOf(value: string) {
  return new Date(value).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
}

/** "09.10, 22:25" in Berlin time. */
export function dateTimeOf(value: string) {
  return `${shortDate(berlinKey(value))}, ${timeOf(value)}`;
}
