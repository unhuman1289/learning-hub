"use client";

import { useState } from "react";
import { CalendarLeaf, LubeckWindow, SeasonItem, useBerlinClock } from "./lubeck/window";
import { DeskProgress } from "./desk-progress";
import { PostIt } from "../../components/notebook/post-it";
import {TodayBoard} from "./today-board";
import { ContactBook } from "./guardian/contact-book";
import { AlertCircle } from "lucide-react";
import { Bookcase, OakDesk, Shelf } from "../../components/notebook/house";
import { NotebookCover } from "../../components/notebook/paper";
import { berlinKey, coverTitle, coverTransition, notebookPages, shortDate, trackIds, trackInfo, type TrackId } from "./model";
import type { LearnerSummary } from "../../lib/learners/list";
import type { ShelfApi, ShelfSubject } from "./use-shelf";
import { buttonClass, RouteLink } from "./ui";
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
  const clock = useBerlinClock();
  // How dark it is outside the window; after dusk the desk lamp comes on.
  const [darkness, setDarkness] = useState(0);
  const viewedName = readOnly ? viewing.learners.find((item) => item.id === viewing.id)?.name ?? "" : "";
  const today = berlinKey(new Date());
  // The desk only holds lessons that still need attention.
  const visibleTracks=hub2?trackIds.filter(track=>shelf.subjects?.some(s=>s.legacyTrack===track)):trackIds;
  const lessons = visibleTracks.flatMap((track) => {
    const lesson = daily.data?.active.find((item) => item.track === track);
    return lesson && !lesson.completedAt ? [{ track, lesson }] : [];
  });
  const v2Lessons=daily.data?.v2Active??[];
  const loading = !daily.data && !daily.error;
  const notes = lessons.map(({ track, lesson }, index) => {
                const route: Route = { view: "notebook", track, tab: "bai", page: lesson.id };
                const isNew = lesson.assignedDate === today && !lesson.response.trim();
                return (
                  <PostIt key={lesson.id} color={postitColor[track]} index={index}>
                    <p className="flex items-center justify-between gap-2 font-hand text-base leading-5">
                      <span className="opacity-75">{trackInfo(track).title} · {lesson.content.minutes} phút</span>
                      {isNew && <span className="-rotate-6 rounded-sm border-2 border-brick px-1.5 text-sm font-semibold uppercase tracking-wide text-brick">Mới</span>}
                    </p>
                    {readOnly
                      ? <p className="mt-2 self-start font-hand text-[22px] leading-7">{lesson.content.title}</p>
                      : <RouteLink route={route} go={go} className="pencil-underline mt-2 self-start font-hand text-[22px] leading-7">{lesson.content.title}</RouteLink>}
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
                      <span className="font-hand text-base opacity-75">{isNew ? "Bài mới hôm nay" : `Đang học · nhận ${shortDate(lesson.assignedDate)}`}</span>
                      {!readOnly && <RouteLink route={route} go={go} className={buttonClass("primary", "min-h-9 px-3")}>{isNew ? "Bắt đầu" : "Học tiếp"}</RouteLink>}
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
          <h1 className="font-print text-[2.25rem] font-medium leading-tight sm:text-[2.75rem]">{readOnly ? `Kệ của ${viewedName}` : `Chào ${name}.`}</h1>
          {viewing.learners.length > 1 && (
            <label className="mt-3 inline-flex items-center gap-2 text-sm text-muted">Xem kệ của
              <select value={viewing.id ?? ""} onChange={(event) => viewing.set(event.target.value || null)} className="rounded-md border border-rule bg-paper px-2 py-1 text-ink">
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
        <OakDesk drawers lamp={darkness * 0.5}>
          <div className="mb-4 flex items-end justify-between gap-2 px-1">
            <h2 className="font-hand text-[26px] leading-8 text-oak-ink">Trên bàn hôm nay</h2>
            <SeasonItem place="desk" month={clock?.month} />
          </div>
          <TodayBoard key={viewing.id ?? "self"} learner={viewing.id} go={go} enabled={hub2} notes={notes} loadingLegacy={loading} />
          {daily.error && (
            <p role="alert" className="mt-5 flex gap-2 rounded-md bg-rose-soft px-3 py-2 text-sm leading-6 text-accent-hover">
              <AlertCircle size={16} className="mt-1 shrink-0" aria-hidden="true" />
              <span>{daily.error} {daily.error === "Sign in required" && <a href="/login" className="underline">Đăng nhập lại</a>} <button type="button" onClick={() => void daily.load()} className="underline">Tải lại</button></span>
            </p>
          )}
        </OakDesk>
        </div>

        <Bookcase
          className="lg:sticky lg:top-24"
          counterDecoration={<SeasonItem place="shelf" month={clock?.month} />}
          title={<><h2 className="font-print text-xl font-medium">Tủ sách</h2><span className="text-sm opacity-80">Lấy một cuốn sổ</span></>}
        >
          {shelf.subjects === null && <p className="col-span-full px-1 text-sm text-cabinet-ink">{shelf.error || "Đang mở tủ sách…"}</p>}
          {(shelf.subjects ?? []).map((subject) => (
            <Shelf key={subject.id}>
              {subject.legacyTrack
                ? <PreparedNotebook track={subject.legacyTrack} daily={daily} readOnly={readOnly} go={go} />
                : <TopicNotebook subject={subject} hasLesson={v2Lessons.some(l=>l.subjectId===subject.id)} go={go} />}
            </Shelf>
          ))}
          {canOpenNotebook && (
            <Shelf>
              <button type="button" onClick={onNewNotebook} className="grid aspect-[3/4] w-full place-items-center rounded-[3px_8px_8px_3px] border-2 border-dashed border-cabinet-ink/40 p-2 text-center hover:border-accent hover:bg-paper/40">
                <span className="font-hand text-lg leading-6 text-cabinet-ink/80">+ Sổ mới</span>
              </button>
            </Shelf>
          )}
          {shelf.subjects?.length === 0 && !canOpenNotebook && <p className="col-span-full px-1 text-sm text-cabinet-ink">Kệ còn trống.</p>}
        </Bookcase>
      </div>
      {hub2 && <DeskProgress key={viewing.id ?? "self"} subjects={shelf.subjects ?? []} learner={viewing.id} go={go} />}
      {/* A parent (or the admin) on someone else's shelf also gets their contact book. */}
      {hub2 && readOnly && viewing.id && shelf.subjects && <ContactBook learner={viewing.id} name={viewedName} subjects={shelf.subjects} />}
    </div>
  );
}

/** One of the five prepared notebooks, with its foundation lessons and assigned lessons. */
function PreparedNotebook({ track, daily, readOnly, go }: { track: TrackId; daily: DailyApi; readOnly: boolean; go: (route: Route) => void }) {
  const { active: current } = notebookPages(track, daily.data);
  const cover = (
    <NotebookCover
      title={coverTitle[track]}
      lines={[current && !current.completedAt ? "đang học" : "chưa có bài"]}
      className="origin-bottom transition-transform duration-200 group-hover:-translate-y-1.5 group-hover:-rotate-2"
    />
  );
  // Opening another learner's notebook comes with the guardian view (Sổ liên lạc, H6.5).
  if (readOnly) return <div className="group block rounded-md" aria-label={`Sổ ${trackInfo(track).title}`}>{cover}</div>;
  return (
    <RouteLink route={{ view: "notebook", track, tab: "bai" }} go={go} aria-label={`Mở sổ ${trackInfo(track).title}`} className="group block rounded-md" style={{ viewTransitionName: coverTransition[track] }}>
      {cover}
    </RouteLink>
  );
}


/** A notebook opened since Learning Hub 2.0. */
function TopicNotebook({ subject, hasLesson, go }: { subject: ShelfSubject; hasLesson: boolean; go: (route: Route) => void }) {
  return (
    <RouteLink route={{ view: "subject", id: subject.id }} go={go} aria-label={`Mở sổ ${subject.title}`} className="group block rounded-md" style={{ viewTransitionName: `cover-${subject.id}` }}>
      <NotebookCover
        title={subject.title}
        lines={[hasLesson ? "đang học" : "chưa có bài"]}
        className="origin-bottom transition-transform duration-200 group-hover:-translate-y-1.5 group-hover:-rotate-2"
      />
    </RouteLink>
  );
}
