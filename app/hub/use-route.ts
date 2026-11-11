"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { findStaticTrack, isTrack, type TrackId } from "./model";

export type NotebookTab = "bai" | "muc-luc" | "muc-tieu" | "tai-lieu";
export type Route =
  | { view: "desk" }
  | { view: "admin" }
  | { view: "notebook"; track: TrackId; tab: NotebookTab; page?: string }
  | { view: "subject"; id: string }
  | { view: "lesson"; id: string };

const tabs: NotebookTab[] = ["bai", "muc-luc", "muc-tieu", "tai-lieu"];

export function parseRoute(search: string): Route {
  const params = new URLSearchParams(search);
  const v2=params.get("bai2");
  if(v2&&/^les_[0-9a-f]{20}$/.test(v2))return {view:"lesson",id:v2};
  const legacyLesson = params.get("lesson");
  if (legacyLesson) {
    const track = findStaticTrack(legacyLesson);
    if (track) return { view: "notebook", track, tab: "bai", page: legacyLesson };
  }
  const track = params.get("so");
  if (isTrack(track)) {
    const tab = params.get("tab") as NotebookTab | null;
    return { view: "notebook", track, tab: tab && tabs.includes(tab) ? tab : "bai", page: params.get("bai") ?? undefined };
  }
  const subject = params.get("sach");
  if (subject && /^sub_[0-9a-f]{20}$/.test(subject)) return { view: "subject", id: subject };
  const page = params.get("trang");
  if (page === "quan-tri") return { view: "admin" };
  return { view: "desk" };
}

export function routeHref(route: Route) {
  const params = new URLSearchParams();
  if (route.view === "lesson") params.set("bai2",route.id);
  if (route.view === "admin") params.set("trang", "quan-tri");
  if (route.view === "subject") params.set("sach", route.id);
  if (route.view === "notebook") {
    params.set("so", route.track);
    if (route.tab !== "bai") params.set("tab", route.tab);
    if (route.page) params.set("bai", route.page);
  }
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

/** Which physical action a navigation looks like; drives the CSS view transitions in globals.css. */
function transitionKind(from: Route, to: Route): "open" | "close" | "turn" | "fade" {
  if (to.view === "notebook" && (from.view !== "notebook" || from.track !== to.track)) return "open";
  if (from.view === "notebook" && to.view !== "notebook") return "close";
  if (from.view === "notebook" && to.view === "notebook" && to.tab === "bai" && from.page !== to.page) return "turn";
  return "fade";
}

type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void) => { finished: Promise<void> } };

/** Address-bar routing inside the signed-in page, so lessons can be resumed and shared. */
export function useRoute() {
  const [route, setRoute] = useState<Route>({ view: "desk" });
  const current = useRef(route);
  useEffect(() => {
    current.current = route;
  }, [route]);

  useEffect(() => {
    const sync = () => setRoute(parseRoute(window.location.search));
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const go = useCallback((next: Route) => {
    const href = routeHref(next);
    if (href !== `${window.location.pathname}${window.location.search}`) window.history.pushState({}, "", href);
    const update = () => {
      flushSync(() => setRoute(next));
      window.scrollTo({ top: 0 });
    };
    const doc = document as ViewTransitionDocument;
    if (!doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      update();
      return;
    }
    const root = document.documentElement;
    root.dataset.vt = transitionKind(current.current, next);
    doc.startViewTransition(update).finished.finally(() => {
      delete root.dataset.vt;
    });
  }, []);

  return { route, go };
}
