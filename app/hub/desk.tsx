"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Bookcase, GardenWindow, OakDesk, Shelf } from "../../components/notebook/house";
import { NotebookCover, cx } from "../../components/notebook/paper";
import { berlinKey, coverTitle, coverTransition, dateTimeOf, isTrack, notebookPages, shortDate, trackIds, trackInfo, type TrackId } from "./model";
import type { LearnerSummary } from "../../lib/learners/list";
import type { ShelfApi, ShelfSubject } from "./use-shelf";
import { buttonClass, RouteLink } from "./ui";
import type { DailyApi } from "./use-daily";
import type { Route } from "./use-route";
import type { Log, WorkspaceApi } from "./use-workspace";

// Each notebook's note keeps its colour; the track name is always written on it as well.
const postitColor: Record<TrackId, string> = {
  Deutsch: "bg-postit-yellow",
  AI: "bg-postit-blue",
  MTB: "bg-postit-mint",
  Cardio: "bg-postit-rose",
  "Bột": "bg-postit-lilac",
};
const tilts = [-1.6, 1.2, -0.8, 1.8, -1.2, 0.9, -1.9];

export type Viewing = {
  learners: LearnerSummary[];
  /** The learner whose shelf is shown; null = the signed-in account. */
  id: string | null;
  set: (id: string | null) => void;
};

export function Desk({ name, isAdmin, go, daily, workspace, shelf, viewing, canOpenNotebook, onNewNotebook }: {
  name: string;
  isAdmin: boolean;
  go: (route: Route) => void;
  daily: DailyApi;
  workspace: WorkspaceApi;
  shelf: ShelfApi;
  viewing: Viewing;
  canOpenNotebook: boolean;
  onNewNotebook: () => void;
}) {
  // Looking at a child's (guardian) or anyone's (admin) shelf is read-only; their own notes stay private.
  const readOnly = viewing.id !== null;
  const viewedName = readOnly ? viewing.learners.find((item) => item.id === viewing.id)?.name ?? "" : "";
  const today = berlinKey(new Date());
  const date = new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Berlin" }).format(new Date());
  // The desk only holds what needs attention: lessons still to learn, and notes due for review.
  const lessons = trackIds.flatMap((track) => {
    const lesson = daily.data?.active.find((item) => item.track === track);
    return lesson && !lesson.completedAt ? [{ track, lesson }] : [];
  });
  const v2Lessons=daily.data?.v2Active??[];
  const finished = trackIds.filter((track) => daily.data?.active.find((item) => item.track === track)?.completedAt);
  const reviews = readOnly ? [] : workspace.data.logs
    .filter((log) => log.due && log.due <= today && !workspace.data.done.includes(log.id))
    .sort((x, y) => (x.due ?? "").localeCompare(y.due ?? ""));
  const health = daily.data?.health;
  const pending = usePendingCount(isAdmin);
  const loading = !daily.data && !daily.error;

  const summary = loading
    ? "Đang mở các sổ…"
    : [(lessons.length+v2Lessons.length) && `${lessons.length+v2Lessons.length} bài đang chờ`, reviews.length && `${reviews.length} mục cần ôn`].filter(Boolean).join(" và ") || "Bàn học đang gọn";

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8">
      {/* Entering the study: a greeting by the garden window. */}
      <section className="grid items-end gap-6 md:grid-cols-[minmax(0,1fr)_15rem]">
        <div>
          <p className="font-hand text-xl text-accent first-letter:uppercase">{date}</p>
          <h1 className="font-print text-[2.25rem] font-medium leading-tight sm:text-[2.75rem]">{readOnly ? `Kệ của ${viewedName}` : `Chào ${name}.`}</h1>
          <p className="mt-1 text-muted">{summary}{loading || readOnly ? "" : ". Chọn một tờ trên bàn, hoặc lấy sổ từ tủ."}{readOnly ? ". Chỉ xem; bài làm và ghi chú chỉ người học sửa được." : ""}</p>
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
        <GardenWindow className="hidden h-36 md:block" />
      </section>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <OakDesk drawers className="min-w-0">
          <h2 className="px-1 pb-4 font-hand text-[26px] leading-8 text-oak-ink">Trên bàn hôm nay</h2>

          {lessons.length + v2Lessons.length + reviews.length > 0 ? (
            <ul className="grid gap-x-5 gap-y-7 px-1 pb-2 pt-2 sm:grid-cols-2 xl:grid-cols-3">
              {lessons.map(({ track, lesson }, index) => {
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
              })}
              {v2Lessons.map((lesson,index)=><PostIt key={lesson.id} color="bg-postit-yellow" index={lessons.length+index}><p className="font-hand text-base">{lesson.subjectTitle} · {lesson.minutes??'—'} phút</p><RouteLink route={{view:'lesson',id:lesson.id}} go={go} className="pencil-underline mt-2 font-hand text-[22px] leading-7">{lesson.title}</RouteLink><RouteLink route={{view:'lesson',id:lesson.id}} go={go} className={buttonClass('primary','mt-auto self-start')}>Học tiếp</RouteLink></PostIt>)}
              {reviews.map((log, index) => (
                <ReviewNote key={log.id} log={log} index={lessons.length + index} today={today} go={go} onReviewed={() => void workspace.toggleDone(log.id)} />
              ))}
            </ul>
          ) : (
            <p className="px-1 pb-6 pt-2 font-hand text-xl leading-8 text-oak-ink">
              {loading ? "Đang mở các sổ…" : "Bàn đang gọn: không có bài mới hay mục nào cần ôn. Lấy một cuốn sổ từ tủ để đọc lại bài cũ."}
            </p>
          )}

          {finished.length > 0 && (
            <p className="mt-5 px-1 text-sm leading-6 text-oak-ink">
              Đã học xong: {finished.map((track) => trackInfo(track).title).join(", ")}. Bài tiếp theo có vào sáng mai.
            </p>
          )}
          {daily.error && (
            <p role="alert" className="mt-5 flex gap-2 rounded-md bg-rose-soft px-3 py-2 text-sm leading-6 text-accent-hover">
              <AlertCircle size={16} className="mt-1 shrink-0" aria-hidden="true" />
              <span>{daily.error} {daily.error === "Sign in required" && <a href="/login" className="underline">Đăng nhập lại</a>} <button type="button" onClick={() => void daily.load()} className="underline">Tải lại</button></span>
            </p>
          )}
          {daily.data && (
            <p className="mt-3 px-1 text-sm leading-6 text-oak-ink opacity-90">
              {daily.data.lastRun ? `Lần kiểm tra bài mới gần nhất: ${dateTimeOf(daily.data.lastRun.updated)}.` : "Chưa có lần kiểm tra bài mới nào."}
              {health && (health.stale || health.latestFailed) && <span className="font-semibold"> Lần soạn bài gần nhất chưa thành công; bài cũ vẫn giữ nguyên.</span>}
            </p>
          )}
          {isAdmin && pending > 0 && (
            <p className="px-1 text-sm leading-6">
              <RouteLink route={{ view: "admin" }} go={go} className="font-semibold text-oak-ink underline underline-offset-2">{pending} tài khoản đang chờ duyệt</RouteLink>
            </p>
          )}
        </OakDesk>

        <Bookcase
          className="lg:sticky lg:top-24"
          title={<><h2 className="font-print text-xl font-medium">Tủ sách</h2><span className="text-sm opacity-80">Lấy một cuốn sổ</span></>}
        >
          {shelf.subjects === null && <p className="col-span-full px-1 text-sm text-cabinet-ink">{shelf.error || "Đang mở tủ sách…"}</p>}
          {(shelf.subjects ?? []).map((subject) => (
            <Shelf key={subject.id}>
              {subject.legacyTrack
                ? <PreparedNotebook track={subject.legacyTrack} daily={daily} workspace={workspace} readOnly={readOnly} go={go} />
                : <TopicNotebook subject={subject} go={go} />}
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
    </div>
  );
}

/** One of the five prepared notebooks, with its foundation lessons and assigned lessons. */
function PreparedNotebook({ track, daily, workspace, readOnly, go }: { track: TrackId; daily: DailyApi; workspace: WorkspaceApi; readOnly: boolean; go: (route: Route) => void }) {
  const { assigned, foundation, active: current } = notebookPages(track, daily.data);
  const learned = assigned.filter((page) => page.kind === "daily" && page.lesson.completedAt).length + (readOnly ? 0 : foundation.filter((page) => workspace.data.done.includes(page.id)).length);
  const cover = (
    <NotebookCover
      title={coverTitle[track]}
      lines={[readOnly ? `${learned}/${assigned.length} bài được giao` : `${learned}/${assigned.length + foundation.length} bài`, current ? (current.completedAt ? "chờ bài mới" : "đang học") : "chưa có bài"]}
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

const topicStatus: Record<ShelfSubject["status"], string> = { setup: "đang lập lộ trình", active: "đang học", paused: "tạm dừng", archived: "đã cất" };

/** A notebook opened since Learning Hub 2.0. */
function TopicNotebook({ subject, go }: { subject: ShelfSubject; go: (route: Route) => void }) {
  return (
    <RouteLink route={{ view: "subject", id: subject.id }} go={go} aria-label={`Mở sổ ${subject.title}`} className="group block rounded-md" style={{ viewTransitionName: `cover-${subject.id}` }}>
      <NotebookCover
        title={subject.title}
        lines={[topicStatus[subject.status], subject.skillCount ? `${subject.skillCount} kỹ năng` : "chưa có bài"]}
        className="origin-bottom transition-transform duration-200 group-hover:-translate-y-1.5 group-hover:-rotate-2"
      />
    </RouteLink>
  );
}

/** A post-it pressed onto the desk, slightly tilted; it straightens and lifts on hover. */
function PostIt({ color, index, taped = false, children }: { color: string; index: number; taped?: boolean; children: ReactNode }) {
  return (
    <li
      style={{ "--tilt": `${tilts[index % tilts.length]}deg`, animationDelay: `${150 + index * 110}ms` } as CSSProperties}
      className={cx("postit flex min-h-44 flex-col rounded-[1px] p-4 animate-stick [rotate:var(--tilt)] hover:-translate-y-1 hover:[rotate:0deg] focus-within:[rotate:0deg]", color, taped && "pt-6")}
    >
      {/* Review notes are held down by a strip of paper tape. */}
      {taped && <span aria-hidden="true" className="absolute -top-3 left-1/2 h-6 w-24 -translate-x-1/2 -rotate-3 bg-paper/70 shadow-[0_1px_2px_rgb(0_0_0/0.18)] [clip-path:polygon(3%_0,97%_4%,100%_50%,96%_100%,2%_96%,0_50%)]" />}
      {children}
    </li>
  );
}

function ReviewNote({ log, index, today, go, onReviewed }: { log: Log; index: number; today: string; go: (route: Route) => void; onReviewed: () => void }) {
  const track = isTrack(log.track) ? log.track : null;
  const overdue = !!log.due && log.due < today;
  return (
    <PostIt color={track ? postitColor[track] : "bg-postit-yellow"} index={index} taped>
      <p className="flex items-center gap-1.5 font-hand text-base leading-5">
        <RotateCcw size={14} aria-hidden="true" />
        <span className="font-semibold">Cần ôn</span>
        <span className="opacity-75">· {log.kind}{track ? ` · ${trackInfo(track).title}` : ""}</span>
      </p>
      <p className="mt-2 line-clamp-4 whitespace-pre-wrap break-words font-hand text-lg leading-6">{log.body}</p>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
        <span className={cx("font-hand text-base", overdue ? "font-semibold text-brick" : "opacity-75")}>{overdue ? `Quá hạn từ ${shortDate(log.due!)}` : "Đến hạn hôm nay"}</span>
        <span className="flex items-center gap-2">
          {track && <RouteLink route={{ view: "notebook", track, tab: "ghi-chu" }} go={go} className="pencil-underline font-hand text-base">Mở sổ</RouteLink>}
          <button type="button" onClick={onReviewed} className={buttonClass("secondary", "min-h-9 px-3")}>Đã ôn</button>
        </span>
      </div>
    </PostIt>
  );
}

function usePendingCount(isAdmin: boolean) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!isAdmin) return;
    let current = true;
    fetch("/api/admin/users", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ users?: unknown[] }> : { users: [] })
      .then((body) => { if (current) setCount(body.users?.length ?? 0); })
      .catch(() => {});
    return () => { current = false; };
  }, [isAdmin]);
  return count;
}
