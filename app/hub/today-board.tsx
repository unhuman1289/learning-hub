"use client";
import { PostIt } from "../../components/notebook/post-it";
import { useState, type ReactNode, type Dispatch, type SetStateAction } from "react";
import type { Greeting } from "../../lib/greeting";
import { words } from "./words";
import type { TodayItem } from "../../lib/today";
import { apiJson } from "./api";
import { postitAction } from "./paper-bits";
import { buttonClass, RouteLink } from "./ui";
import type { Route } from "./use-route";
export type TodayData = { items: TodayItem[]; minutes: number; targetMinutes: number; greeting: Greeting };
export function TodayBoard({ learner, go, enabled, notes, loadingLegacy, data, setData, loadError, animate }: {
  learner: string | null; go: (r: Route) => void; enabled: boolean; notes: ReactNode[]; loadingLegacy: boolean;
  data: TodayData | null; setData: Dispatch<SetStateAction<TodayData | null>>; loadError: string; animate: boolean;
}) {
  const [error, setError] = useState("");
  async function snooze(id: string) {
    setError("");
    try {
      const r = await fetch("/api/lessons/" + id + "/snooze", { method: "POST" }),
        x = (await r.json()) as { error?: string; items: TodayItem[]; minutes: number; targetMinutes: number };
      if (!r.ok) throw Error(x.error || "Chưa xác nhận để mai.");
      setData((d) => (d ? { ...d, items: d.items.filter((i) => i.lessonId !== id) } : d));
    } catch (e) {
      setError(e instanceof TypeError ? words.error.offline : words.error.unknown);
    }
  }
  // "Skills are due" has no lesson to open yet: ask for a practice lesson, then show the notebook where it arrives.
  async function practise(subjectId: string) {
    setError("");
    const post = (json: unknown) => apiJson("/api/requests", { method: "POST", json });
    try {
      await post({ mode: "practice", subjectId, clientRequestId: crypto.randomUUID() }).catch(() => post({ kind: "extra_practice", subjectId, urgency: "now", text: "Luyện tập" }));
      go({ view: "book", id: subjectId });
    } catch (e) {
      setError(e instanceof TypeError ? words.error.offline : words.error.unknown);
    }
  }
  return (
    <section aria-label="Việc học theo tiến độ" >
      {(error || loadError) && (
        <p role="alert" className="rounded bg-paper p-3 text-accent">
          {error || loadError}
        </p>
      )}
      {(!!data?.items.length || notes.length > 0) ? (
        <ul className="grid gap-x-5 gap-y-7 px-1 pb-2 pt-2 sm:grid-cols-2 xl:grid-cols-3">
          {data?.items.map((i, index) => (
            <PostIt key={i.id} color="bg-postit-yellow" index={index} animate={animate}>
              <p className="font-hand text-base leading-5">
                {i.subjectTitle}{i.minutes ? ` · ${i.minutes} phút` : ""}
              </p>
              <p className="mt-2 break-words font-hand text-[22px] leading-7">{i.title}</p>
              <p className="mt-2 font-hand text-base leading-6">{i.reason || null}</p>
              {i.optional && i.category === "exploration" && <p className="mt-2 text-sm leading-6">Thêm nếu muốn — đã đạt mục tiêu phút hôm nay.</p>}
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
                {i.lessonId || learner ? (
                  <RouteLink route={i.lessonId ? { view: "lesson", id: i.lessonId } : { view: "book", id: i.subjectId }} go={go} className={postitAction}>
                    {i.hasWork ? words.action.continue : words.action.open}
                  </RouteLink>
                ) : (
                  <button type="button" className={postitAction} onClick={() => void practise(i.subjectId)}>{words.request.practice}</button>
                )}
              {i.lessonId && !learner && (
                <button className={buttonClass("ghost", "min-h-11 text-postit-ink hover:text-postit-ink")} onClick={() => void snooze(i.lessonId!)}>
                  {words.action.later}
                </button>
              )}
              </div>
            </PostIt>
          ))}
          {notes}
        </ul>
      ) : !error && !loadError && <p className="px-1 pb-6 pt-2 font-hand text-xl leading-8 text-oak-ink">
        {loadingLegacy || (enabled && !data) ? "Đang mở các sổ…" : "Chọn một cuốn sổ để xin bài mới."}
      </p>}
    </section>
  );
}
