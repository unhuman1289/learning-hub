"use client";

import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { LubeckWindow, SeasonItem, useSkyClock } from "./lubeck/window";
import { workerMessage } from "./offline-client";
import { LazyProfileSettings } from "./profile-settings-loader";
import { PaperDialog } from "./paper-dialog";
import { PostIt } from "../../components/notebook/post-it";
import { TutorPet } from "./lesson/tutor-pet";
import { TodayBoard } from "./today-board";
import { rumAfterPaint, rumNavigationStart } from "./rum";
import { words } from "./words";
import { Bookcase, OakDesk } from "../../components/notebook/house";
import { SpineShelves, type SpineBook } from "../../components/notebook/spine-shelf";
import { berlinKey, coverTitle, coverTransition, shortDate, trackIds, trackInfo, type TrackId } from "./model";
import type { LearnerSummary } from "../../lib/learners/list";
import type { ShelfApi } from "./use-shelf";
import { buttonClass, RouteLink } from "./ui";
import type { DailyApi } from "./use-daily";
import type { Route } from "./use-route";

const DeskProgress = lazy(() => import("./desk-progress").then(module => ({ default: module.DeskProgress })));
const LearnedLessons = lazy(() => import("./notebook/history").then(module => ({ default: module.LearnedLessons })));
const ContactBook = lazy(() => import("./guardian/contact-book").then(module => ({ default: module.ContactBook })));

// Each notebook's note keeps its colour; the track name is always written on it as well.
const postitColor: Record<TrackId, string> = {
  Deutsch: "bg-postit-yellow",
  AI: "bg-postit-blue",
  MTB: "bg-postit-mint",
  Cardio: "bg-postit-rose",
  "Bột": "bg-postit-lilac",
};

function subscribeNetwork(update: () => void) {
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  return () => {
    window.removeEventListener("online", update);
    window.removeEventListener("offline", update);
  };
}

function DeskPet({ enabled }: { enabled: boolean }) {
  const [greeting, setGreeting] = useState(true);
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => setGreeting(false), 720);
    return () => window.clearTimeout(timer);
  }, [enabled]);
  if (!enabled) return <span aria-hidden="true" className="tutor-pet tutor-pet-corner">
    <span className="tutor-pet-fallback">☺</span>
  </span>;
  return <TutorPet size="corner" state={greeting ? "greet" : "idle"} />;
}

export type Viewing = {
  learners: LearnerSummary[];
  /** The learner whose shelf is shown; null = the signed-in account. */
  id: string | null;
  set: (id: string | null) => void;
};

export function Desk({ name, ownerId, go, daily, shelf, viewing, canOpenNotebook, onNewNotebook, hub2 = false }: {
  ownerId: string;
  name: string;
  go: (route: Route) => void;
  daily: DailyApi;
  shelf: ShelfApi;
  viewing: Viewing;
  canOpenNotebook: boolean;
  onNewNotebook: () => void;
  hub2?: boolean;
}) {
  // Looking at a child's (guardian) or anyone's (admin) shelf is read-only; their own notes stay private.
  const readOnly = viewing.id !== null;
  // The date, the hour and the greeting are the learner's own; sun, moon and weather are Lübeck's.
  const clock = useSkyClock();
  // How dark it is outside the window; after dusk the desk lamp comes on.
  const [darkness, setDarkness] = useState(0);
  const [showProgress, setShowProgress] = useState(false);
  const [showContactBook, setShowContactBook] = useState(false);
  const [drawer, setDrawer] = useState<"learned" | "settings" | null>(null);
  const selfId = viewing.learners.find((item) => item.relation === "self")?.id;
  const viewedName = readOnly ? viewing.learners.find((item) => item.id === viewing.id)?.name ?? "" : "";
  const today = berlinKey(new Date());
  const [postItsDay, setPostItsDay] = useState<string | null>(null);
  const online = useSyncExternalStore(subscribeNetwork, () => navigator.onLine, () => true);
  useEffect(() => {
    try {
      if (sessionStorage.getItem("lh-postits-day") === today) return;
      sessionStorage.setItem("lh-postits-day", today);
      const frame = requestAnimationFrame(() => setPostItsDay(today));
      return () => cancelAnimationFrame(frame);
    } catch { /* Animation is optional. */ }
  }, [today]);
  const data = shelf.today;
  const ownDeskReady = hub2 && !readOnly && !!data;
  const prefetchId = data?.items.find(item => item.lessonId)?.lessonId;
  useEffect(() => {
    if (!hub2 || !prefetchId || shelf.offline) return;
    let cancelled = false;
    const run = () => {
      const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
      if (cancelled || document.hidden || connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? "")) return;
      void import("./lesson/prefetch").then(module => {
        if (!cancelled) module.prefetchLesson(ownerId, viewing.id, prefetchId);
      });
    };
    let idle = 0;
    const delay = window.setTimeout(() => {
      idle = window.requestIdleCallback ? window.requestIdleCallback(run) : window.setTimeout(run, 0);
    }, 4000);
    return () => { cancelled = true; clearTimeout(delay); if (window.cancelIdleCallback) window.cancelIdleCallback(idle); else clearTimeout(idle); };
  }, [hub2, prefetchId, ownerId, viewing.id, shelf.offline]);
  useEffect(() => {
    if (ownDeskReady) return rumAfterPaint("desk", rumNavigationStart("desk"));
  }, [ownDeskReady]);
  const animate = postItsDay === today;
  // The desk only holds lessons that still need attention.
  const visibleTracks=hub2?trackIds.filter(track=>shelf.subjects?.some(s=>s.legacyTrack===track)):trackIds;
  const lessons = visibleTracks.flatMap((track) => {
    const lesson = daily.data?.active.find((item) => item.track === track);
    return lesson && !lesson.completedAt ? [{ track, lesson }] : [];
  });
  const activeSubjects = new Set(data?.items.filter(item => item.lessonId).map(item => item.subjectId));
  const feedbackSubjects = new Set(data?.items.filter(item => item.hasFeedback).map(item => item.subjectId));
  const loading = !daily.data && !daily.error;
  const subjects = shelf.subjects ?? [];
  const spineBooks: SpineBook[] = subjects.map((subject) => {
    if (subject.legacyTrack && !hub2) {
      const track = subject.legacyTrack;
      const current = daily.data?.active.find(lesson => lesson.track === track);
      return {
        id: subject.id, title: coverTitle[track], status: current && !current.completedAt ? "đang học" : "chưa có bài",
        route: readOnly ? null : { view: "notebook", track, tab: "bai" }, transition: coverTransition[track],
      };
    }
    return {
      id: subject.id, title: subject.title, hasFeedback: feedbackSubjects.has(subject.id), status: activeSubjects.has(subject.id) ? "đang học" : subject.status === "setup" ? "đang chuẩn bị" : "xem sổ",
      route: { view: "book", id: subject.id }, transition: `cover-${subject.id}`,
    };
  });
  // The cupboard doors open the two things that used to be desk drawers.
  const doors = hub2 ? [
    { label: "Bài đã học", onOpen: () => setDrawer("learned") },
    ...(!readOnly && selfId ? [{ label: "Cài đặt", onOpen: () => setDrawer("settings") }] : []),
  ] : [];
  const notes = (highlightFirst: boolean) => lessons.map(({ track, lesson }, index) => {
                const route: Route = { view: "notebook", track, tab: "bai", page: lesson.id };
                const isNew = lesson.assignedDate === today && !lesson.response.trim();
                return (
                  <PostIt key={lesson.id} color={postitColor[track]} index={index} animate={animate}>
                    <p className="flex items-center justify-between gap-2 font-hand text-base leading-5">
                      <span className="opacity-75">{trackInfo(track).title} · {lesson.content.minutes} phút</span>
                      {isNew && <span className="-rotate-6 rounded-sm border-2 border-brick px-1.5 text-sm font-semibold uppercase tracking-wide text-brick">Mới</span>}
                    </p>
                    <p className="mt-2 self-start font-hand text-[22px] leading-7">{lesson.content.title}</p>
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
                      <span className="font-hand text-base opacity-75">{isNew ? "Bài mới hôm nay" : `Đang học · nhận ${shortDate(lesson.assignedDate)}`}</span>
                      {!readOnly && <RouteLink route={route} go={go} className={buttonClass(highlightFirst && index === 0 ? "primary" : "secondary", highlightFirst && index === 0 ? undefined : "text-postit-ink")}>{lesson.response.trim() ? words.action.continue : words.action.open}</RouteLink>}
                    </div>
                  </PostIt>
                );
    });

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8">
      {/* Entering the study: a greeting by the garden window. */}
      <section className="flex items-start gap-3 sm:items-center sm:gap-4">
        <DeskPet key={viewing.id ?? ownerId} enabled={data?.tutor?.enabled === true} />
        <div className="min-w-0">
          <h1 className="font-print text-[2rem] font-medium leading-tight sm:text-[2.75rem]">{data?.greeting.hello ?? (readOnly ? `Bàn của ${viewedName}` : `Chào ${name}.`)}</h1>
          {clock && <time className="mt-1 block text-xs text-muted" dateTime={[clock.month, clock.day].map(part => String(part).padStart(2, "0")).join("-")}>
            {clock.weekday}, ngày {clock.day} tháng {clock.month}
          </time>}
          {data?.greeting.cheer && <p className="mt-1 font-hand text-lg leading-snug text-accent">{data.greeting.cheer}</p>}
          {viewing.learners.length > 1 && (
            <label className="mt-3 inline-flex items-center gap-2 text-sm text-muted">Xem bàn của
              <select value={viewing.id ?? ""} onChange={(event) => { window.dispatchEvent(new Event("lh:profile-change")); viewing.set(event.target.value || null); }} className="min-h-11 rounded-md border border-rule bg-paper px-2 py-1 text-ink-paper">
                {viewing.learners.map((item) => (
                  <option key={item.id} value={item.relation === "self" ? "" : item.id}>{item.relation === "self" ? `${item.name} (tôi)` : item.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      </section>

      {(!online || shelf.offline) && <p role="status" className="rounded-sm bg-paper px-4 py-3 text-sm text-ink-paper shadow-page">
        Đang mất mạng. Kết nối lại để cập nhật bàn học.
      </p>}

      <div className="grid min-w-0 items-start gap-7 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-8">
        <div className="min-w-0">
          <LubeckWindow clock={clock} onDarkness={setDarkness} waitingForDesk={hub2 && !data && !shelf.error} className="relative z-[1] mx-auto max-w-[44rem]" />
          <section aria-label="Bàn học">
            <OakDesk lamp={darkness * 0.5} apron>
              <div className="flex min-w-0 items-end gap-2 sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <TodayBoard key={`${viewing.id ?? "self"}:${data?.study.day ?? today}`} learner={viewing.id} go={go} notes={notes} items={data?.items ?? []}
                    loading={hub2 ? !data && !shelf.error : loading}
                    emptyShelf={shelf.subjects?.length === 0} adaptiveSubjects={data?.adaptiveSubjects ?? []} preparing={data?.preparing ?? []}
                    animate={animate}
                    loadError={hub2 ? shelf.error : daily.error} reload={hub2 ? shelf.load : daily.load} />
                </div>
                <SeasonItem place="desk" month={clock?.month} className="h-20 w-14 shrink-0 sm:h-[103px] sm:w-[84px]" />
              </div>
            </OakDesk>
          </section>
        </div>

        <Bookcase
          doors={doors}
          title={<h2 className="font-print text-2xl font-medium">Kệ sách</h2>}
        >
          {shelf.subjects === null
            ? <p role="status" className="px-2 pb-3 text-sm text-cabinet-ink">{shelf.error || "Đang mở kệ sách…"}</p>
            : <SpineShelves key={viewing.id ?? "self"} books={spineBooks} go={go}
                endDecoration={<SeasonItem place="shelf" month={clock?.month} />}
                onNew={canOpenNotebook && spineBooks.length ? onNewNotebook : null} />}
          {canOpenNotebook && shelf.subjects?.length === 0 && <button type="button" onClick={onNewNotebook}
            className={buttonClass("primary", "m-2 justify-self-start")}>Mở sổ</button>}
        </Bookcase>
      </div>
      {drawer === "learned" && <PaperDialog title="Bài đã học" labelId="drawer-learned" onClose={() => setDrawer(null)}>
        <Suspense fallback={<p role="status">Đang mở bài đã học…</p>}><LearnedLessons subjects={shelf.subjects ?? []} learner={viewing.id} go={(route) => { setDrawer(null); go(route); }} /></Suspense>
      </PaperDialog>}
      {drawer === "settings" && selfId && <PaperDialog title="Cài đặt" labelId="drawer-settings" onClose={() => setDrawer(null)}>
        <LazyProfileSettings learner={selfId} title="Về bạn" />
        <button type="button" className={buttonClass("secondary", "mt-4")} onClick={async event => { const button = event.currentTarget; try { if (!await workerMessage("clear")) throw new Error(); button.textContent = "Đã xoá cache"; } catch { button.textContent = "Chưa xoá được cache"; } }}>Xoá cache</button>
      </PaperDialog>}
      {hub2 && !!shelf.subjects?.length && (
        <details className="mx-auto w-full max-w-3xl" onToggle={event => setShowProgress(event.currentTarget.open)}>
          <summary className="notebook-button notebook-secondary w-fit cursor-pointer">Tiến độ theo sổ</summary>
          {showProgress && <Suspense fallback={<p role="status">Đang mở tiến độ…</p>}><DeskProgress key={viewing.id ?? "self"} subjects={shelf.subjects} learner={viewing.id} go={go} /></Suspense>}
        </details>
      )}
      {/* A parent (or the admin) on someone else's shelf also gets their contact book. */}
      {hub2 && readOnly && viewing.id && shelf.subjects && (
        <details className="mx-auto w-full max-w-3xl" onToggle={event => setShowContactBook(event.currentTarget.open)}>
          <summary className="notebook-button notebook-secondary w-fit cursor-pointer">Sổ liên lạc</summary>
          {showContactBook && <Suspense fallback={<p role="status">Đang mở sổ liên lạc…</p>}><ContactBook key={viewing.id} learner={viewing.id} name={viewedName} subjects={shelf.subjects} /></Suspense>}
        </details>
      )}
    </div>
  );
}
