import type { NotebookOverview } from "../../../lib/learner-model/overview";
import { Dots, shortDay, skillLabel } from "../paper-bits";
import { words } from "../words";

export function BookProgress({ data, child }: { data: NotebookOverview; child: boolean }) {
  const correct = data.days.reduce((sum, day) => sum + day.correct, 0);
  const graded = data.days.reduce((sum, day) => sum + day.graded, 0);
  const studied = data.days.slice(-7).filter(day => day.seconds > 0).length;
  const filled = graded > 0 ? Math.round(correct * 10 / graded) : 0;
  const state = { demonstrated: [3, words.skillState.demonstrated], review: [2, words.skillState.needs_review], learning: [2, words.skillState.developing] } as const;
  const groups = [
    ["g", "Ngữ pháp"], ["p", "Chính tả, dấu câu"], ["n", "Diễn đạt tự nhiên"], [null, null],
  ] as const;
  return <div className="bg-graph grid gap-5 p-3 sm:p-5">
    <section aria-label={words.place.days}>
      <h2 className="font-hand text-2xl">{words.place.days}</h2>
      {child && <p className="font-hand text-lg"><span aria-hidden="true">⭐</span> {studied} ngày học tuần này</p>}
      <ul className="grid grid-cols-7 gap-1 lg:grid-cols-14">
        {data.days.map(day => <li key={day.day} aria-label={`${shortDay(day.day)}, ${Math.floor(day.seconds / 60)} phút`}
          title={`${shortDay(day.day)} · ${Math.floor(day.seconds / 60)} phút`}
          className={`grid min-h-11 min-w-0 place-items-center text-center font-hand text-sm ${day.seconds > 0 ? "border border-transparent bg-ok-soft" : "border border-dashed border-rule"}`}>
          {child && day.seconds >= 600 ? "⭐" : shortDay(day.day)}
        </li>)}
      </ul>
    </section>
    <section>
      <h2 className="font-hand text-2xl">Đúng ngay</h2>
      {graded ? <><p>{correct}/{graded} câu</p><div role="meter" aria-label="Câu đúng ngay" aria-valuenow={correct} aria-valuemin={0} aria-valuemax={graded}
        className="mt-1 grid max-w-xs grid-cols-10 gap-1">
        {Array.from({ length: 10 }, (_, index) => <span key={index} aria-hidden="true"
          className={`aspect-square border ${index < filled ? "border-ok bg-ok-soft" : "border-dashed border-rule"}`} />)}
      </div></> : <p>Chưa có câu đã chấm.</p>}
    </section>
    <section>
      <h2 className="font-hand text-2xl">Kỹ năng</h2>
      {data.skills.length ? groups.map(([facet, title]) => {
        const skills = data.skills.filter(skill => skill.facet === facet);
        return skills.length > 0 && <div key={facet ?? "other"}>
          {title && <h3 className="mt-2 font-hand text-lg">{title}</h3>}
          <ul>{skills.map(skill => <li key={skill.id} className="flex flex-wrap items-center gap-x-3">
            <Dots value={state[skill.state][0]} label={state[skill.state][1]} />
            <span>{skillLabel(skill.name)}</span><span className="text-sm text-muted">{state[skill.state][1]}</span>
          </li>)}</ul>
        </div>;
      }) : <p>Chưa có kỹ năng nào.</p>}
    </section>
    {data.errors.length > 0 && <section>
      <h2 className="font-hand text-2xl">{words.place.mistakes}</h2>
      <ul>{data.errors.map(error => <li key={error.id} className="font-hand text-lg text-brick">{error.label.replace(/^[GPN]:\s*/, "")} · {error.occurrences} lần</li>)}</ul>
    </section>}
  </div>;
}
