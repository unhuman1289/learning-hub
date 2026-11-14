"use client";

import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { CalendarLeaf, LubeckWindow, SeasonItem, useSkyClock } from "./lubeck/window";
import { PaperDialog } from "./paper-dialog";
import { ProfileSettings } from "./profile-settings";
import { PostIt } from "../../components/notebook/post-it";
import { TodayBoard } from "./today-board";
import { words } from "./words";
import { Bookcase, OakDesk } from "../../components/notebook/house";
import { SpineShelves, type SpineBook } from "../../components/notebook/spine-shelf";
import { berlinKey, coverTitle, coverTransition, notebookPages, shortDate, trackIds, trackInfo, type TrackId } from "./model";
import type { LearnerSummary } from "../../lib/learners/list";
import type { ShelfApi } from "./use-shelf";
import { postitAction } from "./paper-bits";
import { RouteLink } from "./ui";
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

export type Viewing = {
  learners: LearnerSummary[];
  /** The learner whose shelf is shown; null = the signed-in account. */
  id: string | null;
  set: (id: string | null) => void;
};

export function Desk({ name, go, daily, shelf, viewing, canOpenNotebook, onNewNotebook, hub2 = false }: {
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
  const animate = postItsDay === today;
  // The desk only holds lessons that still need attention.
  const visibleTracks=hub2?trackIds.filter(track=>shelf.subjects?.some(s=>s.legacyTrack===track)):trackIds;
  const lessons = visibleTracks.flatMap((track) => {
    const lesson = daily.data?.active.find((item) => item.track === track);
    return lesson && !lesson.completedAt ? [{ track, lesson }] : [];
  });
  const activeSubjects = new Set(data?.items.filter(item => item.lessonId).map(item => item.subjectId));
  const loading = !daily.data && !daily.error;
  const subjects = shelf.subjects ?? [];
  const spineBooks: SpineBook[] = subjects.map((subject) => {
    if (subject.legacyTrack && !hub2) {
      const track = subject.legacyTrack;
      const current = notebookPages(track, daily.data).active;
      return {
        id: subject.id, title: coverTitle[track], status: current && !current.completedAt ? "đang học" : "chưa có bài",
        route: readOnly ? null : { view: "notebook", track, tab: "bai" }, transition: coverTransition[track],
      };
    }
    return {
      id: subject.id, title: subject.title, status: activeSubjects.has(subject.id) ? "đang học" : subject.status === "setup" ? "đang chuẩn bị" : "xem sổ",
      route: { view: "book", id: subject.id }, transition: `cover-${subject.id}`,
    };
  });
  // The cupboard doors open the two things that used to be desk drawers.
  const doors = hub2 ? [
    { label: "Bài đã học", onOpen: () => setDrawer("learned") },
    ...(!readOnly && selfId ? [{ label: "Cài đặt", onOpen: () => setDrawer("settings") }] : []),
  ] : [];
  const notes = lessons.map(({ track, lesson }, index) => {
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
                      {!readOnly && <RouteLink route={route} go={go} className={postitAction}>{lesson.response.trim() ? words.action.continue : words.action.open}</RouteLink>}
                    </div>
                  </PostIt>
                );
    });

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8">
      {/* Entering the study: a greeting by the garden window. */}
      <section className="flex items-center gap-4">
        <CalendarLeaf clock={clock} />
        <div className="min-w-0">
          <h1 className="font-print text-[2.25rem] font-medium leading-tight sm:text-[2.75rem]">{data?.greeting.hello ?? (readOnly ? `Bàn của ${viewedName}` : `Chào ${name}.`)}</h1>
          <p aria-live="off" className="min-h-7 font-hand text-lg text-accent">{data?.greeting.cheer}</p>
          {viewing.learners.length > 1 && (
            <label className="mt-3 inline-flex items-center gap-2 text-sm text-muted">Xem bàn của
              <select value={viewing.id ?? ""} onChange={(event) => viewing.set(event.target.value || null)} className="min-h-11 rounded-md border border-rule bg-paper px-2 py-1 text-ink-paper">
                {viewing.learners.map((item) => (
                  <option key={item.id} value={item.relation === "self" ? "" : item.id}>{item.relation === "self" ? `${item.name} (tôi)` : item.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      </section>

      {!online && <p role="status" className="rounded-sm bg-paper px-4 py-3 text-sm text-ink-paper shadow-page">
        Đang mất mạng. Kết nối lại để cập nhật bàn học.
      </p>}

      <div className="grid min-w-0 items-start gap-7 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-8">
        <div className="min-w-0">
          <LubeckWindow clock={clock} onDarkness={setDarkness} className="relative z-[1] mx-auto max-w-[44rem]" />
          <section aria-label="Bàn học">
            <OakDesk lamp={darkness * 0.5} apron>
              <div className="flex min-w-0 items-end gap-2 sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <TodayBoard key={`${viewing.id ?? "self"}:${data?.study.day ?? today}`} learner={viewing.id} go={go} notes={notes} items={data?.items ?? []}
                    loading={hub2 ? !data && !shelf.error : loading}
                    emptyShelf={shelf.subjects?.length === 0} adaptiveSubjects={data?.adaptiveSubjects ?? []} preparing={data?.preparing ?? []}
                    gradingWaits={data?.gradingWaits ?? false} animate={animate}
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
            className="brick m-2 min-h-11 justify-self-start px-4 font-hand text-lg">Mở sổ</button>}
        </Bookcase>
      </div>
      {drawer === "learned" && <PaperDialog title="Bài đã học" labelId="drawer-learned" onClose={() => setDrawer(null)}>
        <Suspense fallback={<p role="status">Đang mở bài đã học…</p>}><LearnedLessons subjects={shelf.subjects ?? []} learner={viewing.id} go={(route) => { setDrawer(null); go(route); }} /></Suspense>
      </PaperDialog>}
      {drawer === "settings" && selfId && <PaperDialog title="Cài đặt" labelId="drawer-settings" onClose={() => setDrawer(null)}>
        <ProfileSettings learner={selfId} title="Về bạn" />
      </PaperDialog>}
      {hub2 && !!shelf.subjects?.length && (
        <details className="mx-auto w-full max-w-3xl" onToggle={event => setShowProgress(event.currentTarget.open)}>
          <summary className="w-fit cursor-pointer py-3 font-hand text-lg text-accent">Tiến độ theo sổ</summary>
          {showProgress && <Suspense fallback={<p role="status">Đang mở tiến độ…</p>}><DeskProgress key={viewing.id ?? "self"} subjects={shelf.subjects} learner={viewing.id} go={go} /></Suspense>}
        </details>
      )}
      {/* A parent (or the admin) on someone else's shelf also gets their contact book. */}
      {hub2 && readOnly && viewing.id && shelf.subjects && (
        <details className="mx-auto w-full max-w-3xl" onToggle={event => setShowContactBook(event.currentTarget.open)}>
          <summary className="w-fit cursor-pointer py-3 font-hand text-lg text-accent">Sổ liên lạc</summary>
          {showContactBook && <Suspense fallback={<p role="status">Đang mở sổ liên lạc…</p>}><ContactBook key={viewing.id} learner={viewing.id} name={viewedName} subjects={shelf.subjects} /></Suspense>}
        </details>
      )}
    </div>
  );
}
