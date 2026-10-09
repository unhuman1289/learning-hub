import { lessons, projects, tracks } from "../content";
import { getLessonDetail, type LessonDetail, type LessonSource } from "../lesson-content";
import { learningTracks, type LearningTrack } from "../../lib/daily-policy";
import type { DailyLesson, DailyView } from "../../lib/daily-types";

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

/** One page of a notebook: either an assigned D1 lesson or a prepared foundation lesson. */
export type Page =
  | { kind: "daily"; id: string; track: TrackId; title: string; lesson: DailyLesson; archived: boolean }
  | { kind: "static"; id: string; track: TrackId; title: string; lesson: StaticLesson; detail: LessonDetail | null };

export function notebookPages(track: TrackId, daily: DailyView | null) {
  const archived = (daily?.history ?? [])
    .filter((lesson) => lesson.track === track)
    .sort((a, b) => a.assignedDate.localeCompare(b.assignedDate));
  const active = (daily?.active ?? []).filter((lesson) => lesson.track === track);
  const assigned: Page[] = [
    ...archived.map((lesson) => ({ kind: "daily" as const, id: lesson.id, track, title: lesson.content.title, lesson, archived: true })),
    ...active.map((lesson) => ({ kind: "daily" as const, id: lesson.id, track, title: lesson.content.title, lesson, archived: false })),
  ];
  const foundation: Page[] = lessons
    .filter((lesson) => lesson.track === track)
    .map((lesson) => ({ kind: "static" as const, id: lesson.id, track, title: lesson.title, lesson, detail: getLessonDetail(lesson.id) }));
  return { assigned, foundation, active: active[0] ?? null };
}

export function findStaticTrack(id: string): TrackId | null {
  const lesson = lessons.find((item) => item.id === id);
  return lesson && isTrack(lesson.track) ? lesson.track : null;
}

export function staticSources(lesson: StaticLesson, detail: LessonDetail | null): LessonSource[] {
  if (detail?.sources.length) return detail.sources;
  return lesson.source ? [{
    title: lesson.sourceName,
    url: lesson.source,
    readScope: "Liên kết có trong bản xuất hiện tại; phạm vi đọc chưa được ghi nhận trong bài này.",
    retrievedAt: "",
    publishedAt: null,
  }] : [];
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
