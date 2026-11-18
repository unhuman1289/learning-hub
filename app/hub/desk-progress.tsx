"use client";

import { useEffect, useState } from "react";
import { cx } from "../../components/notebook/paper";
import type { NotebookOverview } from "../../lib/learner-model/overview";
import { apiJson } from "./api";
import { Dots, pencil, pencilLink, shortDay, skillLabel } from "./paper-bits";
import { RouteLink } from "./ui";
import type { Route } from "./use-route";
import type { ShelfSubject } from "./use-shelf";

const skillDots = { review: 2, learning: 2, demonstrated: 3 };
const skillNote = { review: "cần ôn", learning: "đang luyện", demonstrated: "đã vững" };
const minutes = (seconds: number) => (seconds > 0 && seconds < 60 ? "<1 phút" : `${Math.round(seconds / 60)} phút`);
/** One coloured square per started ten minutes, four at most. */
const squares = (seconds: number) => (seconds <= 0 ? 0 : Math.min(4, Math.ceil(seconds / 600)));

/**
 * A loose sheet of squared paper clipped to the desk: the quick look at one notebook. Fourteen days of study as
 * coloured squares, first answers that were right, and up to three skills. Details live in the notebook.
 */
export function DeskProgress({ subjects, learner, go }: { subjects: ShelfSubject[]; learner: string | null; go: (route: Route) => void }) {
  const [picked, setPicked] = useState<string>();
  const notebooks = subjects.filter((subject) => subject.status !== "archived");
  const active = notebooks.find((subject) => subject.id === picked) ?? notebooks.find((subject) => subject.status === "active") ?? notebooks[0];
  if (!active) return null;
  return (
    <section aria-label="Tiến độ theo sổ" className="bg-graph relative mx-auto w-full max-w-3xl -rotate-[0.4deg] rounded-[2px] p-4 pt-[2.25rem] leading-9 text-ink shadow-page sm:px-[2.25rem]">
      {/* Bulldog clip holding the sheet. */}
      <span aria-hidden="true" className="absolute -top-3 left-10 h-8 w-16 rounded-[3px] bg-iron shadow-[0_2px_3px_rgb(0_0_0/0.4)] before:absolute before:inset-x-3 before:top-1.5 before:h-1 before:rounded-full before:bg-white/25" />
      {notebooks.length > 1 && (
        <div role="group" aria-label="Chọn sổ" className="flex flex-wrap gap-x-5">
          {notebooks.map((subject) => (
            <button key={subject.id} type="button" aria-pressed={subject.id === active.id} onClick={() => setPicked(subject.id)}
              className="notebook-button notebook-choice text-xl">
              {subject.title}
            </button>
          ))}
        </div>
      )}
      <Sheet key={active.id} subject={active} learner={learner} go={go} single={notebooks.length === 1} />
    </section>
  );
}

function Sheet({ subject, learner, go, single }: { subject: ShelfSubject; learner: string | null; go: (route: Route) => void; single: boolean }) {
  const [data, setData] = useState<NotebookOverview>();
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string>();
  useEffect(() => {
    const request = new AbortController();
    const query = new URLSearchParams({ view: "overview", ...(learner ? { learner } : {}) });
    apiJson<NotebookOverview>(`/api/subjects/${subject.id}?${query}`, { signal: request.signal })
      .then((overview) => { if (!request.signal.aborted) setData(overview); })
      .catch(() => { if (!request.signal.aborted) setError(true); });
    return () => request.abort();
  }, [subject.id, learner, retry]);
  if (error) return <p role="alert">Chưa tải được tiến độ. <button type="button" className={pencilLink} onClick={() => { setError(false); setRetry((n) => n + 1); }}>Thử lại</button></p>;
  if (!data) return <p role="status" className={pencil}>Đang đọc tiến độ…</p>;

  const totals = data.days.reduce((sum, day) => ({ seconds: sum.seconds + day.seconds, active: sum.active + Number(day.seconds > 0), correct: sum.correct + day.correct, graded: sum.graded + day.graded }), { seconds: 0, active: 0, correct: 0, graded: 0 });
  const selected = data.days.find((day) => day.day === selectedDay);
  const route: Route = subject.legacyTrack ? { view: "notebook", track: subject.legacyTrack, tab: "muc-tieu" } : { view: "book", id: subject.id, page: "tien-do" };
  return (
    <div className="grid gap-x-[2.25rem] sm:grid-cols-[auto_minmax(0,1fr)]">
      <div>
        <h2 className="font-hand text-xl leading-9 text-accent">{single ? `${subject.title} · ` : ""}Ngày đã học</h2>
        {/* Each column is a day; squares sit on the paper's own grid. */}
        <div className="grid h-[4.5rem] grid-cols-7 sm:grid-cols-[repeat(14,1.75rem)]" aria-label="Phút học mỗi ngày">
          {data.days.map((day, index) => (
            <button type="button" key={day.day} aria-pressed={selectedDay === day.day} aria-label={`${shortDay(day.day)}, ${minutes(day.seconds)}`} onClick={() => setSelectedDay(day.day)}
              className={cx("notebook-choice flex min-h-11 flex-col-reverse border hover:bg-rose-soft/60 focus-visible:outline-2 focus-visible:outline-accent-paper", index < 7 && "hidden sm:flex")}>
              {Array.from({ length: squares(day.seconds) }, (_, i) => <span key={i} aria-hidden="true" className="h-[1.125rem] border border-paper bg-accent/85" />)}
            </button>
          ))}
        </div>
        <p className={cx(pencil, "flex justify-between leading-9")}>
          <span className="hidden sm:inline">{shortDay(data.days[0].day)}</span><span className="sm:hidden">{shortDay(data.days[7].day)}</span>
          <span role="status">{selected ? `${shortDay(selected.day)} · ${minutes(selected.seconds)}${selected.graded ? ` · ${selected.correct}/${selected.graded} đúng ngay` : ""}` : `${minutes(totals.seconds)} · ${totals.active} ngày`}</span>
          <span>hôm nay</span>
        </p>
      </div>
      <div className="min-w-0">
        <h2 className="font-hand text-xl leading-9 text-accent">Đúng ngay <span className="text-ink">{totals.graded ? `${totals.correct}/${totals.graded}` : "chưa có câu đã chấm"}</span></h2>
        <ul aria-label="Kỹ năng">
          {data.skills.map((skill) => (
            <li key={skill.id} className="flex items-center gap-3">
              <Dots value={skillDots[skill.state]} label={skillNote[skill.state]} />
              <span className="min-w-0 flex-1 truncate">{skillLabel(skill.name)}</span>
              <span className={cx(pencil, "leading-9", skill.state === "review" && "text-brick")}>{skillNote[skill.state]}</span>
            </li>
          ))}
        </ul>
        {!data.skills.length && <p className={cx(pencil, "leading-9")}>Chưa đánh giá kỹ năng.</p>}
        <RouteLink route={route} go={go} className={cx(pencilLink, "leading-9")}>Xem chi tiết trong sổ →</RouteLink>
      </div>
    </div>
  );
}
