import { lessons } from "../legacy-content.ts";
import { getLessonDetail, type LessonDetail, type LessonSource } from "../lesson-content.ts";
import type { DailyLesson, DailyView } from "../../lib/daily-types";
import type { StaticLesson, TrackId } from "./model.ts";

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

