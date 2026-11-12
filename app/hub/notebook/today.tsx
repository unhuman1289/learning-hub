import type { NotebookOverview } from "../../../lib/learner-model/overview";
import type { ShelfSubject } from "../use-shelf";
import { pencil, skillLabel } from "../paper-bits";
import { words } from "../words";

export function RecentNotebookReport({ data, subject }: { data: NotebookOverview | null; subject: ShelfSubject }) {
  const sums = (days: NotebookOverview["days"]) => days.reduce((sum, day) => ({
    seconds: sum.seconds + day.seconds,
    days: sum.days + Number(day.seconds > 0),
    graded: sum.graded + day.graded,
    correct: sum.correct + day.correct,
  }), { seconds: 0, days: 0, graded: 0, correct: 0 });
  const current = sums(data?.days.slice(-7) ?? []);
  const previous = sums(data?.days.slice(0, 7) ?? []);
  const solid = data?.skills.filter(skill => skill.state === "demonstrated") ?? [];
  const errors = data?.errors.slice(0, 2) ?? [];
  const next = subject.roadmap?.slice(0, 3) ?? [];
  return <section aria-label="Tiến độ gần đây" className="min-w-0 border-t border-rule pt-2 md:border-t-0">
    <h2 className="font-print text-2xl">Tuần này</h2>
    {!data ? <p className={pencil}>Đang đọc tiến độ…</p> : <>
      {current.seconds || current.graded ? <>
        <p>{current.days} ngày học · {Math.floor(current.seconds / 60)} phút</p>
        {!!current.graded && <p>Đúng ngay {current.correct}/{current.graded} câu
          {!!previous.graded && <span className={pencil}> · Tuần trước {previous.correct}/{previous.graded}</span>}
        </p>}
      </> : <p className={pencil}>Tiến độ tuần này sẽ hiện sau khi bạn học.</p>}
      {!!solid.length && <p className="font-hand text-lg text-ok">Đã vững · {solid.map(skill => skillLabel(skill.name)).join(", ")}</p>}
      {!!errors.length && <p className="font-hand text-lg text-brick">{words.place.mistakes} · {errors.map(error => error.label.replace(/^[GPN]:\s*/, "")).join(", ")}</p>}
    </>}
    {!!next.length && <><h3 className="mt-3 font-hand text-xl text-accent">{words.place.next}</h3>
      <ol className="ml-5 list-decimal">{next.map((step, i) => <li key={i}>{step.title}</li>)}</ol></>}
  </section>;
}
