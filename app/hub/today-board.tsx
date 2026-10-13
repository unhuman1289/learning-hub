"use client";
import { useEffect, useState } from "react";
import type { TodayItem } from "../../lib/today";
import { buttonClass, RouteLink } from "./ui";
import type { Route } from "./use-route";
export function TodayBoard({ learner, go, onLoad }: { learner: string | null; go: (r: Route) => void; onLoad?: () => void }) {
  const [data, setData] = useState<{ items: TodayItem[]; minutes: number; targetMinutes: number } | null>(null),
    [error, setError] = useState("");
  const url = "/api/today" + (learner ? "?learner=" + encodeURIComponent(learner) : "");
  useEffect(() => {
    let alive = true;
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        const x = (await r.json()) as { error?: string; items: TodayItem[]; minutes: number; targetMinutes: number };
        if (!r.ok) throw Error(x.error || "Chưa tải được kế hoạch hôm nay.");
        if (alive) {
          setData(x);
          onLoad?.();
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [url, onLoad]);
  async function snooze(id: string) {
    setError("");
    try {
      const r = await fetch("/api/lessons/" + id + "/snooze", { method: "POST" }),
        x = (await r.json()) as { error?: string; items: TodayItem[]; minutes: number; targetMinutes: number };
      if (!r.ok) throw Error(x.error || "Chưa xác nhận để mai.");
      setData((d) => (d ? { ...d, items: d.items.filter((i) => i.lessonId !== id) } : d));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section aria-label="Việc học theo tiến độ" className="mb-5">
      {error && (
        <p role="alert" className="rounded bg-paper p-3 text-accent">
          {error}
        </p>
      )}
      {data && data.items.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2">
          {data.items.map((i) => (
            <li key={i.id} className={"rounded border border-line bg-postit-yellow p-4 shadow-paper " + (i.optional ? "opacity-70" : "")}>
              <p className="text-sm text-muted">
                {i.subjectTitle} · {i.reason}
              </p>
              <RouteLink
                route={i.lessonId ? { view: "lesson", id: i.lessonId } : { view: "subject", id: i.subjectId }}
                go={go}
                className="font-hand text-xl text-accent"
              >
                {i.title}
              </RouteLink>
              {i.optional && <p className="text-sm">Thêm nếu muốn — đã đạt mục tiêu phút hôm nay.</p>}
              {i.lessonId && !learner && (
                <button className={buttonClass("secondary", "mt-3 min-h-9")} onClick={() => void snooze(i.lessonId!)}>
                  Để mai
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
