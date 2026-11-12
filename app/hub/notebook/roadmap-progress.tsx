"use client";

import { useState } from "react";
import type { RoadmapProgress } from "../../../lib/roadmap/report";
import { pencil, pencilLink } from "../paper-bits";
import { PaperConfirm } from "../paper-confirm";

export function RoadmapProgressView({ progress, subjectId, learner, canEdit, onChange, onPractice }: {
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

  return <section className="grid gap-3 border-b border-rule pb-4" aria-label="Đường học">
    <h2 className="font-hand text-2xl">Đường học <span className={pencil}>{progress.position.index}/{progress.position.total}</span></h2>
    {progress.current && <p><span className="font-semibold">Đang luyện</span> · {progress.current.title}{progress.current.levelLabel && " · " + progress.current.levelLabel}</p>}
    {!!progress.done.length && <div>
      <h3 className="font-semibold text-ok">Đã làm được</h3>
      <ul className="grid gap-1">{progress.done.map(step => <li key={step.stepId} className="flex flex-wrap items-baseline gap-x-3">
        <span>{step.title}{step.passedVia === "learner" && <span className={pencil}> · Đã bỏ qua</span>}</span>
        {!learner && <button className={pencilLink} disabled={busy} onClick={() => void act("practice", step.stepId)}>Học lại</button>}
      </li>)}</ul>
    </div>}
    {!!progress.next.length && <div>
      <h3 className="font-semibold">Sắp tới</h3>
      <ol className="list-inside list-decimal">{progress.next.map(step => <li key={step.stepId}>
        {step.title}
        {canEdit && <button className={pencilLink + " ml-3"} disabled={busy} onClick={() => setSkip(step)}>Bỏ qua bước</button>}
      </li>)}</ol>
    </div>}
    {progress.whyNext && <p className={pencil}>{progress.whyNext}</p>}
    {!!progress.sources.length && <details><summary className={pencilLink}>Nguồn của bài</summary>
      <ul>{progress.sources.map(source => <li key={source.url}><a href={source.url} className={pencilLink}>{source.title}</a> · {source.publisher}</li>)}</ul>
    </details>}
    {error && <p role="alert" className="text-brick">{error}</p>}
    <PaperConfirm open={!!skip} message={skip ? "Bỏ qua “" + skip.title + "”?" : ""}
      confirmLabel="Bỏ qua" onConfirm={() => { if (skip && !busy) void act("skip", skip.stepId); }} onCancel={() => setSkip(null)} />
  </section>;
}
