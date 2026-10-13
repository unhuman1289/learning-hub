"use client";

import { useCallback, useEffect, useState } from "react";
import { apiJson } from "./api";
import { DisputeResolver, type DisputeItem } from "./dispute-resolver";
import { QualityTable, type QualityRow } from "./quality-table";
import type { LearnerSummary } from "../../lib/learners/list";

/** Admin: disputes waiting for a person (adults' disputes come here) and grading quality across notebooks. */
export function AdminDisputes() {
  const [disputes, setDisputes] = useState<(DisputeItem & { learnerId: string })[] | null>(null),
    [quality, setQuality] = useState<QualityRow[] | null>(null),
    [names, setNames] = useState(new Map<string, string>()),
    [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let live = true;
    Promise.all([
      apiJson<{ disputes: (DisputeItem & { learnerId: string })[] }>("/api/disputes?scope=needs_human"),
      apiJson<{ quality: QualityRow[] }>("/api/admin/quality"),
      apiJson<{ learners: LearnerSummary[] }>("/api/learners"),
    ])
      .then(([d, q, l]) => {
        if (!live) return;
        setDisputes(d.disputes);
        setQuality(q.quality);
        setNames(new Map(l.learners.map((x) => [x.id, x.name])));
        setError("");
      })
      .catch((e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [version]);
  return (
    <div className="grid gap-4">
      <h2 className="font-print text-2xl font-medium">Chấm sai cần xem</h2>
      {error && <p role="alert">{error}</p>}
      {!disputes ? <p className="text-muted">Đang tải…</p> : disputes.length ? disputes.map((d) => (
        <div key={d.id}>
          <p className="text-sm font-semibold">{names.get(d.learnerId) ?? "Người học"}</p>
          <DisputeResolver dispute={d} learner={d.learnerId} onDone={load} />
        </div>
      )) : <p className="text-muted">Không có phản đối nào đang chờ.</p>}
      <h3 className="mt-4 font-print text-xl font-medium">Chất lượng chấm</h3>
      {quality ? <QualityTable rows={quality} names={names} /> : <p className="text-muted">Đang tải…</p>}
    </div>
  );
}
