"use client";

import { useEffect, useState } from "react";
import { CalendarLeaf, LubeckWindow, SeasonItem, useBerlinClock, useDeviceClock } from "./lubeck/window";
import { DeskProgress } from "./desk-progress";
import { LearnedLessons } from "./learned-lessons";
import { PaperDialog } from "./paper-dialog";
import { ProfileSettings } from "./profile-settings";
import { PostIt } from "../../components/notebook/post-it";
import { TodayBoard, type TodayData } from "./today-board";
import { useLiveRefresh } from "./use-live-refresh";
import { apiJson } from "./api";
import { words } from "./words";
import { ContactBook } from "./guardian/contact-book";
import { SketchIcon } from "./sketch-icons";
import { Bookcase, OakDesk } from "../../components/notebook/house";
import { SpineShelves, type SpineBook } from "../../components/notebook/spine-shelf";
import { berlinKey, coverTitle, coverTransition, notebookPages, shortDate, trackIds, trackInfo, type TrackId } from "./model";
import type { LearnerSummary } from "../../lib/learners/list";
import type { ShelfApi } from "./use-shelf";
import { postitAction } from "./paper-bits";
import { RouteLink } from "./ui";
import type { DailyApi } from "./use-daily";
import type { Route } from "./use-route";

// Each notebook's note keeps its colour; the track name is always written on it as well.
const postitColor: Record<TrackId, string> = {
  Deutsch: "bg-postit-yellow",
  AI: "bg-postit-blue",
  MTB: "bg-postit-mint",
  Cardio: "bg-postit-rose",
  "Bột": "bg-postit-lilac",
};

/** The greeting follows the learner's own hour, read each time the desk asks. */
const fetchToday = (url: string) => apiJson<TodayData>(`${url}${url.includes("?") ? "&" : "?"}hour=${new Date().getHours()}`);

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
  // The sky is Lübeck's; the date and the greeting are the learner's own.
  const clock = useBerlinClock();
  const deviceDay = useDeviceClock();
  // How dark it is outside the window; after dusk the desk lamp comes on.
  const [darkness, setDarkness] = useState(0);
  const [drawer, setDrawer] = useState<"learned" | "settings" | null>(null);
  const selfId = viewing.learners.find((item) => item.relation === "self")?.id;
  const viewedName = readOnly ? viewing.learners.find((item) => item.id === viewing.id)?.name ?? "" : "";
  const today = berlinKey(new Date());
  const [todayData, setTodayData] = useState<{ url: string; value: TodayData | null } | null>(null);
  const [todayError, setTodayError] = useState("");
  const [postItsDay, setPostItsDay] = useState<string | null>(null);
  const todayUrl = "/api/today" + (viewing.id ? "?learner=" + encodeURIComponent(viewing.id) : "");
  useEffect(() => {
    if (!hub2) return;
    let live = true;
    fetchToday(todayUrl).then(value => {
      if (live) { setTodayData({ url: todayUrl, value }); setTodayError(""); }
    }).catch(() => { if (live) setTodayError(words.error.unknown); });
    return () => { live = false; };
  }, [hub2, todayUrl]);
  useLiveRefresh(async () => {
    const value = await fetchToday(todayUrl);
    setTodayData({ url: todayUrl, value });
    setTodayError("");
  }, hub2);
  useEffect(() => {
    try {
      if (sessionStorage.getItem("lh-postits-day") === today) return;
      sessionStorage.setItem("lh-postits-day", today);
      const frame = requestAnimationFrame(() => setPostItsDay(today));
      return () => cancelAnimationFrame(frame);
    } catch { /* Animation is optional. */ }
  }, [today]);
  const data = todayData?.url === todayUrl ? todayData.value : null;
  const animate = postItsDay === today;
  // The desk only holds lessons that still need attention.
  const visibleTracks=hub2?trackIds.filter(track=>shelf.subjects?.some(s=>s.legacyTrack===track)):trackIds;
  const lessons = visibleTracks.flatMap((track) => {
    const lesson = daily.data?.active.find((item) => item.track === track);
    return lesson && !lesson.completedAt ? [{ track, lesson }] : [];
  });
  const v2Lessons=daily.data?.v2Active??[];
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
      id: subject.id, title: subject.title, status: v2Lessons.some(l => l.subjectId === subject.id) ? "đang học" : "chưa có bài",
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
        <CalendarLeaf clock={deviceDay} />
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

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0">
        {/* The window sits on the wall directly above the desk; its sill meets the desk top. */}
        <LubeckWindow clock={clock} onDarkness={setDarkness} className="mx-auto max-w-[44rem]" />
        <OakDesk lamp={darkness * 0.5}>
          <div className="mb-4 flex items-end justify-between gap-2 px-1">
            <h2 className="font-hand text-[26px] leading-8 text-oak-ink">Trên bàn hôm nay</h2>
            <SeasonItem place="desk" month={clock?.month} />
          </div>
          <TodayBoard key={viewing.id ?? "self"} learner={viewing.id} go={go} enabled={hub2} notes={notes} loadingLegacy={loading}
            data={data} loadError={todayError} animate={animate}
            setData={update => setTodayData(current => ({
              url: todayUrl,
              value: typeof update === "function" ? update(current?.url === todayUrl ? current.value : null) : update,
            }))} />
          {daily.error && (
            <p role="alert" className="mt-5 flex gap-2 rounded-md bg-rose-soft px-3 py-2 text-sm leading-6 text-accent-hover">
              <SketchIcon name="notice" size={16} className="mt-1 shrink-0" />
              <span>{daily.error} {daily.error === "Sign in required" && <a href="/login" className="underline">Đăng nhập lại</a>} <button type="button" onClick={() => void daily.load()} className="underline">Tải lại</button></span>
            </p>
          )}
        </OakDesk>
        </div>

        <Bookcase
          // Two shelves of spines still fit the screen; more than that scroll with the page.
          className={subjects.length < 15 ? "lg:sticky lg:top-24" : undefined}
          doors={doors}
          counterDecoration={<SeasonItem place="shelf" month={clock?.month} />}
          title={<><h2 className="font-print text-xl font-medium">Tủ sách</h2><span className="text-sm opacity-80">Lấy một cuốn sổ</span></>}
        >
          {shelf.subjects === null && <p className="px-1 text-sm text-cabinet-ink">{shelf.error || "Đang mở tủ sách…"}</p>}
          {shelf.subjects !== null && <SpineShelves books={spineBooks} go={go} onNew={canOpenNotebook ? onNewNotebook : null} />}
        </Bookcase>
      </div>
      {drawer === "learned" && <PaperDialog title="Bài đã học" labelId="drawer-learned" onClose={() => setDrawer(null)}>
        <LearnedLessons subjects={shelf.subjects ?? []} learner={viewing.id} go={(route) => { setDrawer(null); go(route); }} />
      </PaperDialog>}
      {drawer === "settings" && selfId && <PaperDialog title="Cài đặt" labelId="drawer-settings" onClose={() => setDrawer(null)}>
        <ProfileSettings learner={selfId} title="Về bạn" />
      </PaperDialog>}
      {hub2 && <DeskProgress key={viewing.id ?? "self"} subjects={shelf.subjects ?? []} learner={viewing.id} go={go} />}
      {/* A parent (or the admin) on someone else's shelf also gets their contact book. */}
      {hub2 && readOnly && viewing.id && shelf.subjects && <ContactBook learner={viewing.id} name={viewedName} subjects={shelf.subjects} />}
    </div>
  );
}
