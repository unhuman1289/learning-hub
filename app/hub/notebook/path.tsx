"use client";

import { useCallback, useState } from "react";
import type { ComponentProps } from "react";
import type { NotebookReport } from "../../../lib/notebook-report";
import type { NotebookOverview } from "../../../lib/learner-model/overview";
import { Dots, pencil, pencilLink, shortDay, skillLabel } from "../paper-bits";
import { words } from "../words";
import type { RoadmapProgress } from "../../../lib/roadmap/report";
import { PaperConfirm } from "../paper-confirm";

function RoadmapProgressView({ progress, subjectId, learner, canEdit, onChange, onPractice }: {
  progress: RoadmapProgress; subjectId: string; learner: string | null; canEdit: boolean;
  onChange: () => void; onPractice: () => void;
}) {
  const [skip, setSkip] = useState<{stepId:string;title:string} | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [request, setRequest] = useState<{ stepId: string; id: string } | null>(null);

  async function act(action: "skip" | "practice", stepId: string) {
    const next = action === "practice"
      ? request?.stepId === stepId ? request : {stepId, id: crypto.randomUUID()}
      : null;
    if (next) setRequest(next);
    setBusy(true);
    setError("");
    try {
      const query = learner ? "?" + new URLSearchParams({learner}) : "";
      const response = await fetch("/api/subjects/" + encodeURIComponent(subjectId) + "/roadmap" + query, {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({action, stepId, ...(next ? {clientRequestId:next.id} : {})}),
      });
      if (!response.ok) {
        if (response.status < 500) setRequest(null);
        const body = await response.json().catch(() => null) as {error?: string} | null;
        throw new Error(body?.error || "Chưa lưu được. Bạn thử lại nhé.");
      }
      setRequest(null);
      setSkip(null);
      onChange();
      if (action === "practice") onPractice();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chưa lưu được. Bạn thử lại nhé.");
      setSkip(null);
    } finally {
      setBusy(false);
    }
  }

  return <section aria-labelledby="roadmap-heading">
    <h2 id="roadmap-heading" className="mb-3 font-print text-2xl">Đường học</h2>
    <ol className="ml-1.5 border-l border-rule">
      {progress.done.slice().reverse().map(step => <li key={step.stepId} className="notebook-step text-ok">
        <p className="font-medium text-ink-paper">{step.title}</p>
        <p className="font-hand text-lg">{step.passedVia === "learner" ? "Đã bỏ qua" : "Đã làm được"}</p>
        {!learner && <button className={pencilLink} disabled={busy} onClick={() => void act("practice", step.stepId)}>Học lại</button>}
      </li>)}
      {progress.current && <li aria-current="step" className="notebook-step text-accent-paper">
        <p className="font-medium text-ink-paper">{progress.current.title}</p>
        <p className="font-hand text-lg">Đang luyện{progress.current.levelLabel && " · " + progress.current.levelLabel}</p>
        {progress.missingSourceStepIds?.includes(progress.current.stepId) && <p className="text-sm text-warn">Đang chờ bổ sung nguồn</p>}
      </li>}
      {progress.next.map(step => <li key={step.stepId} className="notebook-step text-muted-paper">
        <p className="text-ink-paper">{step.title}</p>
        <p className="font-hand text-lg">Sắp tới</p>
        {progress.missingSourceStepIds?.includes(step.stepId) && <p className="text-sm text-warn">Đang chờ bổ sung nguồn</p>}
        {canEdit && <button className={pencilLink} disabled={busy} onClick={() => setSkip(step)}>Bỏ qua bước</button>}
      </li>)}
    </ol>
    {progress.whyNext && <p className="mt-3 border-l border-accent pl-3 text-sm text-ink-paper">{progress.whyNext}</p>}
    {!!progress.sources.length && <details className="mt-2"><summary className={pencilLink + " cursor-pointer"}>Nguồn học</summary>
      <ul>{progress.sources.map(source => <li key={source.url}><a href={source.url} className={pencilLink}>{source.title}</a> · {source.publisher}</li>)}</ul>
    </details>}
    {error && <p role="alert" className="text-brick">{error}</p>}
    <PaperConfirm open={!!skip} message={skip ? "Bỏ qua “" + skip.title + "”?" : ""}
      confirmLabel="Bỏ qua" onConfirm={() => { if (skip && !busy) void act("skip", skip.stepId); }} onCancel={() => setSkip(null)} />
  </section>;
}

type Props = Omit<ComponentProps<typeof RoadmapProgressView>, "progress"> & { data: NotebookOverview & { report: NotebookReport }; child: boolean; showProgress?: boolean; roadmap?: ComponentProps<typeof RoadmapProgressView>["progress"] | null };

export function NotebookPath({ data, child, roadmap, showProgress, ...actions }: Props) {
  const progressDetails = useCallback((element: HTMLDetailsElement | null) => {
    if (element && showProgress) element.open = true;
  }, [showProgress]);
  const correct = data.days.reduce((sum, day) => sum + day.correct, 0);
  const graded = data.days.reduce((sum, day) => sum + day.graded, 0);
  const studied = data.days.slice(-7).filter(day => day.seconds > 0).length;
  const filled = graded > 0 ? Math.round(correct * 10 / graded) : 0;
  const state = { demonstrated: [3, words.skillState.demonstrated], review: [2, words.skillState.needs_review], learning: [2, words.skillState.developing] } as const;
  const groups = [
    ["g", "Ngữ pháp"], ["p", "Chính tả, dấu câu"], ["n", "Diễn đạt tự nhiên"], [null, null],
  ] as const;
  return <div className="grid gap-4">
    {roadmap ? <RoadmapProgressView key={actions.subjectId} progress={roadmap} {...actions} />
      : <section><h2 className="font-print text-2xl">Đường học</h2>
        {data.report.next.length ? <ol className="mt-3 ml-1.5 border-l border-rule">{data.report.next.map((title, index) =>
          <li key={index} className="notebook-step text-muted-paper"><p className="text-ink-paper">{title}</p><p className="font-hand text-lg">Sắp tới</p></li>)}</ol>
          : <p className={pencil}>Sổ chưa có các bước học.</p>}
      </section>}
    {!!data.report.solid.length && <section>
      <h2 className="font-print text-2xl text-ok">Đã làm được</h2>
      <ul className="mt-1 list-inside list-disc">{data.report.solid.map(skill => <li key={skill}>{skillLabel(skill)}</li>)}</ul>
    </section>}
    <details ref={progressDetails}>
      <summary className="min-h-11 cursor-pointer content-center font-hand text-xl text-accent-paper">Tiến độ chi tiết</summary>
      <div className="grid gap-4">
        <section aria-label={words.place.days}>
          <h2 className="font-hand text-2xl">{words.place.days}</h2>
          {child && <p className="font-hand text-lg"><span aria-hidden="true">⭐</span> {studied} ngày học tuần này</p>}
          <ul className="grid grid-cols-7 gap-1 2xl:grid-cols-14">
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
      </div>
    </details>
  </div>;
}
