import type { BookPage, NotebookTab, Route } from "./use-route";

const pageForTab: Partial<Record<NotebookTab, BookPage>> = { bai: "hom-nay", "muc-luc": "muc-luc", "muc-tieu": "cai-dat" };

/**
 * An old notebook address (`?so=Deutsch`) opens the same notebook's book once Hub 2 has a notebook for that track.
 * Only the Tài liệu tab and a single old v1 lesson (`bai=`) have no place in the book and keep the old screen.
 */
export function bookForLegacy(route: Route, subjects: { id: string; legacyTrack: string | null }[] | null | undefined): Route | null {
  if (route.view !== "notebook" || route.page || !subjects) return null;
  const page = pageForTab[route.tab];
  const subject = subjects.find((item) => item.legacyTrack === route.track);
  return page && subject ? { view: "book", id: subject.id, page } : null;
}
