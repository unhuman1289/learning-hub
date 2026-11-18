"use client";
import { PostIt } from "../../components/notebook/post-it";
import { useState, type ReactNode } from "react";
import { words } from "./words";
import type { TodayItem } from "../../lib/today";
import { apiJson } from "./api";
import { buttonClass, RouteLink } from "./ui";
import type { Route } from "./use-route";
const openAction = "brick inline-flex min-h-11 items-center px-3 font-hand text-lg";

export function TodayBoard({ learner, go, notes, items, loading, emptyShelf, adaptiveSubjects, preparing, loadError, reload, animate }: {
  learner: string | null;
  go: (route: Route) => void;
  notes: ReactNode[];
  items: TodayItem[];
  loading: boolean;
  emptyShelf: boolean;
  adaptiveSubjects: string[];
  preparing: { subjectId: string; title: string; writing: boolean }[];
  loadError: string;
  reload: () => Promise<void>;
  animate: boolean;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [snoozed, setSnoozed] = useState<string[]>([]);
  const firstBySubject = new Map<string, TodayItem>();
  for (const item of items) {
    if (!snoozed.includes(item.id) && !firstBySubject.has(item.subjectId)) firstBySubject.set(item.subjectId, item);
  }

  async function snooze(id: string) {
    setBusy(id);
    setError("");
    try {
      await apiJson("/api/lessons/" + id + "/snooze", { method: "POST" });
      setSnoozed(ids => [...ids, id]);
      await reload();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function practise(item: TodayItem) {
    setBusy(item.id);
    setError("");
    try {
      await apiJson("/api/requests", {
        method: "POST", json: adaptiveSubjects.includes(item.subjectId)
          ? { mode: "practice", subjectId: item.subjectId, clientRequestId: crypto.randomUUID() }
          : { kind: "extra_practice", subjectId: item.subjectId, urgency: "now", text: "Luyện tập" },
      });
      go({ view: "book", id: item.subjectId });
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const waiting = preparing.filter(job => !firstBySubject.has(job.subjectId));
  const message = loading ? "Đang mở các sổ…"
    : emptyShelf ? learner ? "Chưa có sổ nào." : "Chưa có sổ nào. Mở sổ đầu tiên để bắt đầu."
    : "Chọn một cuốn sổ để xin bài mới.";

  return (
    <section aria-label="Bài tiếp theo" aria-busy={loading}>
      {(error || loadError) && (
        <p role="alert" className="mb-3 rounded-sm bg-paper px-3 py-2 text-sm text-ink-paper">
          {error || loadError} {loadError && <button type="button" className="min-h-11 underline" onClick={() => void reload()}>Thử lại</button>}
        </p>
      )}
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-4 px-1 py-2">
        {[...firstBySubject.values()].map((item, index) => (
          <PostIt key={item.id} color="bg-postit-yellow" index={index} animate={animate} compact>
            <p className="font-hand text-base leading-5">{item.subjectTitle}{item.minutes > 0 ? ` · ${item.minutes} phút` : ""}</p>
            <p className="mt-1 break-words font-hand text-[22px] leading-6">{item.title}</p>
            {item.reason && <p className="mt-1 font-hand text-base leading-5">{item.reason}</p>}
            <div className="mt-auto flex flex-wrap items-center gap-x-3 pt-2">
              {item.lessonId || learner ? (
                <RouteLink route={item.lessonId ? { view: "lesson", id: item.lessonId, correction: item.category === "correction" ? true : undefined } : { view: "book", id: item.subjectId }}
                  go={go} className={openAction}>
                  {item.hasWork ? "Học tiếp" : item.lessonId ? words.action.open : "Mở sổ"}
                </RouteLink>
              ) : (
                <button type="button" disabled={busy !== null} className={openAction} onClick={() => void practise(item)}>{words.request.practice}</button>
              )}
              {item.lessonId && !learner && (
                <button type="button" disabled={busy !== null}
                  className={buttonClass("ghost", "min-h-11 px-0 text-postit-ink hover:text-postit-ink")}
                  onClick={() => void snooze(item.lessonId!)}>{words.action.later}</button>
              )}
            </div>
          </PostIt>
        ))}
        {notes}
        {waiting.map(({ subjectId, title, writing }, index) => (
          <PostIt key={subjectId} color="bg-postit-yellow" index={firstBySubject.size + index} compact>
            <p className="font-hand text-xl" role="status">{writing ? "Đang soạn bài" : "Đang chờ soạn bài"} · {title}</p>
          </PostIt>
        ))}
        {!firstBySubject.size && !notes.length && !waiting.length && !loadError && (
          <PostIt color="bg-postit-yellow" index={0} compact>
            <p role="status" className="font-hand text-xl leading-6">{message}</p>
          </PostIt>
        )}
      </ul>
    </section>
  );
}
