"use client";

import { useCallback, useEffect, useState } from "react";
import { RuledPage } from "../../../components/notebook/paper";
import { fieldClass, labelClass } from "../paper-dialog";
import { buttonClass, PageLabel } from "../ui";
import { apiJson, learnerQuery } from "../api";
import { DisputeResolver, type DisputeItem } from "../dispute-resolver";
import { QualityTable, type QualityRow } from "../quality-table";
import { RequestDialog, RequestList, useRequests, type RequestKind } from "../requests-panel";
import type { ShelfSubject } from "../use-shelf";
import { ProfileSettings } from "../profile-settings";

type Settings = { dailyTargetMinutes: number; aiBudget: Record<string, number> | null };
const budgetFields = [
  ["assessPerDay", "Số lần chấm mỗi ngày"],
  ["recheckPerDay", "Số lần chấm lại mỗi ngày"],
  ["requestNowPerDay", "Yêu cầu soạn ngay mỗi ngày"],
] as const;

/**
 * Sổ liên lạc (PLAN H6.5): what a parent (or the admin) handles for one learner. Settings, planner
 * notes, disputes waiting for a person, and how well grading went. Only shown on someone else's shelf.
 */
export function ContactBook({ learner, name, subjects }: { learner: string; name: string; subjects: ShelfSubject[] }) {
  const [disputes, setDisputes] = useState<DisputeItem[] | null>(null),
    [quality, setQuality] = useState<QualityRow[] | null>(null),
    [error, setError] = useState(""),
    [open, setOpen] = useState<{ kind: RequestKind; subjectId: string } | null>(null);
  const requests = useRequests(learner);
  const active = subjects.filter((s) => s.status === "active" || s.status === "setup");
  const [subjectId, setSubjectId] = useState(active[0]?.id ?? "");

  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let live = true;
    Promise.all([
      apiJson<{ disputes: DisputeItem[] }>(`/api/disputes${learnerQuery(learner)}`),
      apiJson<{ quality: QualityRow[] }>(`/api/quality${learnerQuery(learner)}`),
    ])
      .then(([d, q]) => {
        if (!live) return;
        setDisputes(d.disputes.filter((x) => x.status === "needs_human" || x.status === "open" || !!x.recheckGrade));
        setQuality(q.quality);
        setError("");
      })
      .catch((e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [learner, version]);

  return (
    <RuledPage as="section" className="rounded-[2px] shadow-page">
      <h2 className="relative top-2.5 font-hand text-[32px] leading-[3.5rem] text-accent">Sổ liên lạc · {name}</h2>
      {error && <p role="alert">{error}</p>}

      <PageLabel className="mt-7">Phản đối cần xem</PageLabel>
      {!disputes ? <p className="text-muted">Đang tải…</p> : disputes.length ? (
        <div className="grid gap-4">{disputes.map((d) => <DisputeResolver key={d.id} dispute={d} learner={learner} onDone={load} />)}</div>
      ) : <p className="text-muted">Không có phản đối nào đang chờ.</p>}

      <PageLabel className="mt-7">Dặn người soạn bài</PageLabel>
      {active.length ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className={labelClass}>Sổ
            <select className={fieldClass} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              {active.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </label>
          <button type="button" className={buttonClass("secondary")} disabled={!subjectId} onClick={() => setOpen({ kind: "school_topic", subjectId })}>Tuần này ở trường</button>
          <button type="button" className={buttonClass("secondary")} disabled={!subjectId} onClick={() => setOpen({ kind: "note", subjectId })}>Lời dặn</button>
        </div>
      ) : <p className="text-muted">Chưa có sổ đang học.</p>}
      {requests.requests && <RequestList requests={requests.requests} />}
      {open && <RequestDialog kind={open.kind} subjectId={open.subjectId} learner={learner} onClose={() => setOpen(null)} onSent={requests.load} />}

      <PageLabel className="mt-7">Cài đặt</PageLabel>
      <SettingsForm learner={learner} />
      <ProfileSettings learner={learner} title={"Hồ sơ của " + name} />

      <PageLabel className="mt-7">Chất lượng chấm</PageLabel>
      {quality ? <QualityTable rows={quality} /> : <p className="text-muted">Đang tải…</p>}
    </RuledPage>
  );
}

function SettingsForm({ learner }: { learner: string }) {
  const [settings, setSettings] = useState<Settings | null>(null),
    [state, setState] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    apiJson<{ settings: Settings }>(`/api/learners/${encodeURIComponent(learner)}/settings`)
      .then((value) => setSettings(value.settings))
      .catch((e: Error) => setError(e.message));
  }, [learner]);
  if (!settings) return <p className="text-muted">{error || "Đang tải…"}</p>;
  async function save(form: FormData) {
    setState("Đang lưu…");
    setError("");
    try {
      const budget = Object.fromEntries(budgetFields.flatMap(([key]) => (form.get(key) ? [[key, Number(form.get(key))]] : [])));
      const value = await apiJson<{ settings: Settings }>(`/api/learners/${encodeURIComponent(learner)}/settings`, {
        method: "PATCH",
        json: { dailyTargetMinutes: Number(form.get("minutes")), aiBudget: Object.keys(budget).length ? budget : null },
      });
      setSettings(value.settings);
      setState("Đã lưu.");
    } catch (e) {
      setState("");
      setError((e as Error).message);
    }
  }
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void save(new FormData(event.currentTarget)); }}>
      <label className={labelClass}>Phút học mỗi ngày
        <input name="minutes" type="number" min={5} max={240} required defaultValue={settings.dailyTargetMinutes} className={fieldClass} />
      </label>
      {budgetFields.map(([key, label]) => (
        <label key={key} className={labelClass}>{label}
          <input name={key} type="number" min={0} max={100} placeholder="Mặc định" defaultValue={settings.aiBudget?.[key] ?? ""} className={fieldClass} />
        </label>
      ))}
      {error && <p role="alert" className="sm:col-span-2">{error}</p>}
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" className={buttonClass("primary")}>Lưu cài đặt</button>
        <span role="status" className="text-sm text-muted">{state}</span>
      </div>
    </form>
  );
}
