"use client";

import { useEffect, useId, useState } from "react";
import { ArrowUpRight, Check, CircleDot, Paperclip, RotateCcw } from "lucide-react";
import { cx } from "../../components/notebook/paper";
import type { NotebookOverview } from "../../lib/learner-model/overview";
import { apiJson } from "./api";
import { RouteLink } from "./ui";
import type { Route } from "./use-route";
import type { ShelfSubject } from "./use-shelf";

const skillStatus = {
  review: { icon: RotateCcw, label: "Cần ôn", color: "text-accent" },
  learning: { icon: CircleDot, label: "Đang luyện", color: "text-muted" },
  demonstrated: { icon: Check, label: "Đã vững", color: "text-ink" },
};

const dateLabel = (day: string) => `${day.slice(8)}/${day.slice(5, 7)}`;
const minutes = (seconds: number) => seconds > 0 && seconds < 60 ? "<1 phút" : `${Math.round(seconds / 60)} phút`;

export function DeskProgress({ subjects, learner, go }: {
  subjects: ShelfSubject[]; learner: string | null; go: (route: Route) => void;
}) {
  const groupId = useId();
  const [picked, setPicked] = useState<string>();
  const notebooks = subjects.filter(subject => subject.status !== "archived");
  const active = notebooks.find(subject => subject.id === picked) ?? notebooks.find(subject => subject.status === "active") ?? notebooks[0];
  if (!active) return null;
  return <section className="min-w-0" aria-label="Tiến độ theo sổ">
    <div role="tablist" aria-label="Sổ học" className="relative z-10 -mb-px flex max-w-full items-end gap-1.5 overflow-x-auto px-2 pt-1">
      {notebooks.map((subject, index) => {
        const selected = subject.id === active.id;
        return <button key={subject.id} type="button" role="tab" id={groupId + subject.id}
          aria-controls={groupId + "-panel"} aria-selected={selected} tabIndex={selected ? 0 : -1}
          onClick={() => setPicked(subject.id)}
          onKeyDown={event => {
            let next;
            if (event.key === "ArrowRight") next = (index + 1) % notebooks.length;
            else if (event.key === "ArrowLeft") next = (index + notebooks.length - 1) % notebooks.length;
            else if (event.key === "Home") next = 0;
            else if (event.key === "End") next = notebooks.length - 1;
            else return;
            event.preventDefault();
            setPicked(notebooks[next].id);
            document.getElementById(groupId + notebooks[next].id)?.focus();
          }}
          className={cx("flex min-h-11 max-w-52 shrink-0 items-center gap-2 rounded-t-lg border px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-accent", selected ? "border-line border-b-paper bg-paper text-accent-hover" : "border-line bg-paper-2 text-ink hover:bg-rose-soft")}>
          <Paperclip size={16} aria-hidden="true" className={cx("shrink-0", selected && "-rotate-12 text-accent")} />
          <span className="truncate">{subject.title}</span>
        </button>;
      })}
    </div>
    <div id={groupId + "-panel"} role="tabpanel" aria-labelledby={groupId + active.id}
      className="rounded-md border border-line bg-paper p-4 text-ink shadow-page sm:p-6">
      <ProgressPanel key={active.id} subject={active} learner={learner} go={go} />
    </div>
  </section>;
}

function ProgressPanel({ subject, learner, go }: {
  subject: ShelfSubject; learner: string | null; go: (route: Route) => void;
}) {
  const [data, setData] = useState<NotebookOverview>();
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string>();
  useEffect(() => {
    const request = new AbortController();
    const query = new URLSearchParams({ view: "overview", ...(learner ? { learner } : {}) });
    apiJson<NotebookOverview>(`/api/subjects/${subject.id}?${query}`, { signal: request.signal })
      .then(overview => { if (!request.signal.aborted) setData(overview); })
      .catch(() => { if (!request.signal.aborted) setError(true); });
    return () => request.abort();
  }, [subject.id, learner, retry]);
  if (error) return <p role="alert">Chưa tải được tiến độ. <button type="button" className="text-accent underline" onClick={() => { setError(false); setRetry(n => n + 1); }}>Thử lại</button></p>;
  if (!data) return <p role="status" className="text-sm text-muted">Đang tải tiến độ…</p>;

  const totals = data.days.reduce((sum, day) => ({
    seconds: sum.seconds + day.seconds,
    active: sum.active + Number(day.seconds > 0),
    correct: sum.correct + day.correct,
    graded: sum.graded + day.graded,
  }), { seconds: 0, active: 0, correct: 0, graded: 0 });
  const maxSeconds = Math.max(60, ...data.days.map(day => day.seconds));
  const selected = data.days.find(day => day.day === selectedDay);
  const route: Route = subject.legacyTrack ? { view: "notebook", track: subject.legacyTrack, tab: "muc-tieu" } : { view: "subject", id: subject.id };
  return <div className="grid gap-5 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] sm:gap-7">
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h2 className="font-print text-xl font-semibold">Nhịp học</h2>
        <span className="text-sm tabular-nums text-muted">{minutes(totals.seconds)} · {totals.active}/14 ngày</span>
      </div>
      <div className="mt-2 grid h-20 grid-cols-[repeat(14,minmax(0,1fr))] gap-0.5" aria-label="Phút học mỗi ngày">
        {data.days.map(day => <button type="button" key={day.day} aria-pressed={selectedDay === day.day}
          aria-label={`${dateLabel(day.day)}, ${minutes(day.seconds)}`} onClick={() => setSelectedDay(day.day)}
          className={cx("flex min-w-0 items-end rounded-sm px-px pb-px hover:bg-rose-soft focus-visible:outline-2 focus-visible:outline-accent sm:px-0.5", selectedDay === day.day && "bg-rose-soft")}>
          <span aria-hidden="true" className={cx("w-full rounded-t-sm", day.seconds ? "bg-accent" : "bg-rule")}
            style={{ height: day.seconds ? `${Math.max(7, day.seconds / maxSeconds * 100)}%` : "3px" }} />
        </button>)}
      </div>
      <p className="mt-1 flex justify-between text-xs tabular-nums text-muted">
        <span>{dateLabel(data.days[0].day)}</span>
        {selected && <span role="status">{dateLabel(selected.day)} · {minutes(selected.seconds)}{selected.graded ? ` · ${selected.correct}/${selected.graded} đúng ngay` : ""}</span>}
        <span>Hôm nay</span>
      </p>
    </div>
    <div className="min-w-0 border-t border-line pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-print text-xl font-semibold">Đúng ngay</h2>
        {totals.graded ? <span className="text-lg font-semibold tabular-nums">{totals.correct}/{totals.graded}</span> : <span className="text-sm text-muted">Chưa có câu đã chấm</span>}
      </div>
      {totals.graded > 0 && <div className="mt-1 h-2 overflow-hidden rounded-sm bg-rule" role="img" aria-label={`${totals.correct} trên ${totals.graded} câu đúng ở lần đầu, không gợi ý`}>
        <div className="h-full bg-accent" style={{ width: `${totals.correct / totals.graded * 100}%` }} />
      </div>}
      {data.skills.length > 0 ? <ul aria-label="Kỹ năng" className="mt-3 grid gap-1">
        {data.skills.map(skill => {
          const { icon: Icon, label, color } = skillStatus[skill.state];
          return <li key={skill.id} className="flex items-center gap-2 text-sm">
            <Icon size={15} aria-hidden="true" className={cx("shrink-0", color)} />
            <span className="min-w-0 flex-1 break-words">{skill.name}</span>
            <span className={cx("shrink-0 text-xs", color)}>{label}</span>
          </li>;
        })}
      </ul> : <p className="mt-3 text-sm text-muted">Chưa đánh giá kỹ năng.</p>}
    </div>
    <div className="border-t border-line pt-3 sm:col-span-2">
      <h2 className="font-print text-xl font-semibold">Lỗi lặp</h2>
      <ErrorBars errors={data.errors} />
      <RouteLink route={route} go={go} className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent-hover hover:underline">
        Xem sổ <ArrowUpRight size={15} aria-hidden="true" />
      </RouteLink>
    </div>
  </div>;
}

function ErrorBars({ errors }: { errors: NotebookOverview["errors"] }) {
  if (!errors.length) return <p className="mt-1 text-sm text-muted">Chưa ghi nhận lỗi lặp.</p>;
  const maxOccurrences = Math.max(...errors.map(error => error.occurrences));
  return <ul className="mt-2 grid gap-2 sm:grid-cols-3 sm:gap-5" aria-label="Lỗi còn cần theo dõi">
    {errors.map(error => {
      const confirmed = error.confidence === "confirmed";
      return <li key={error.id} className="min-w-0">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="min-w-0 break-words font-medium">{error.label}</span>
          <span className="shrink-0 tabular-nums">{error.occurrences} lần</span>
        </div>
        <div aria-hidden="true" className="mt-1 h-1.5 overflow-hidden rounded-sm bg-rule">
          <div className={cx("h-full", confirmed ? "bg-accent" : "bg-muted")} style={{ width: `${error.occurrences / maxOccurrences * 100}%` }} />
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {confirmed ? `Đã xác nhận · ${error.daysSeen} ngày` : "Đang theo dõi"}
          {error.status === "improving" && " · Đang cải thiện"}
        </p>
      </li>;
    })}
  </ul>;
}
