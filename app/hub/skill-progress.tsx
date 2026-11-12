"use client";
import {useLiveRefresh} from "./use-live-refresh";
import { useEffect, useState } from "react";
import type { Route } from "./use-route";
import { fieldClass } from "./paper-dialog";
import { Dots, masteryDots, pencil, pencilLink, shortDay, skillLabel } from "./paper-bits";
const masteryText: Record<string, string> = {
  not_assessed: "Chưa đánh giá",
  introduced: "Mới học",
  developing: "Đang luyện",
  demonstrated: "Đã vững",
  needs_review: "Cần ôn",
};
type Skill = {
  id: string;
  key?: string;
  name: string;
  path_order: number;
  mastery: string | null;
  dim_knowledge: number | null;
  dim_recognition: number | null;
  dim_application: number | null;
  dim_retention: number | null;
  next_review_day: string | null;
  state_revision: number | null;
  status:string; attempts_total:number|null;
};
type ProgressData={timeline?:{day:string;minutes:number;lessons?:{id:string;title:string}[]}[];skills:Skill[];errors:Pattern[];effort:{minutes:number;days:number;attempts:number;retries:number}|null;subject:{level:string;progressSummary?:string;progressUpdatedAt?:string|null;roadmap:{title:string;objective:string;situation:string;skills:string[];mode:string}[]}};
type Pattern = { id: string; label: string; confidence: string; status: string };
/** Deutsch skills carry a G/P/N facet in the key prefix (grammar, punctuation, naturalness). */
export const skillFacet = (key?: string) => /^([gpn])-/.exec(key ?? "")?.[1] ?? null;
function Progress({ subjectId, learner, canEdit, showPath = true }: { subjectId: string; learner?: string | null; canEdit?: boolean; go?: (route: Route) => void; showPath?: boolean }) {
  const [data, setData] = useState<ProgressData | null>(null),
    [error, setError] = useState(""),
    [note, setNote] = useState(""),
    [saving, setSaving] = useState(false);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
  const url = "/api/subjects/" + subjectId + (learner ? "?learner=" + encodeURIComponent(learner) : "");
  async function load() {
    const r = await fetch(url, { cache: "no-store" }),
      x = (await r.json()) as ProgressData & {error?:string};
    if (!r.ok) throw Error(x.error || "Chưa tải được tiến độ.");
    setData(x);
  }
  useEffect(() => {
    let alive = true;
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        const x = (await r.json()) as ProgressData & {error?:string};
        if (!r.ok) throw Error(x.error || "Chưa tải được tiến độ.");
        if (alive) setData(x);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [url]);
  useLiveRefresh(load);
  async function setMastery(skill: Skill, value: string) {
    if (!note.trim()) {
      setError("Ghi lý do trước khi đặt trạng thái.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/skills/" + skill.id + (learner ? "?learner=" + encodeURIComponent(learner) : ""), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revision: skill.state_revision ?? 0, mastery: value, reason: note }),
        }),
        x = (await r.json()) as ProgressData & {error?:string};
      if (!r.ok) throw Error(x.error || "Chưa lưu được trạng thái.");
      await load();
      setNote("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const skills = data?.skills.filter((s) => s.status !== "retired") ?? [];
  const openErrors = data?.errors.filter((e) => e.status !== "resolved") ?? [];
  const heading = "mt-7 font-hand text-xl leading-7 text-accent";
  return (
    <section aria-label="Tiến độ và kỹ năng">
      {error && <p role="alert" className="text-brick">{error} <button className={pencilLink} onClick={() => void load().catch((e) => setError(e.message))}>Tải lại</button></p>}
      {!data && !error && <p role="status" className={pencil}>Đang đọc tiến độ đã lưu…</p>}
      {data && (
        <>
          {showPath && (
            <section aria-label="Tiến độ">
              <h2 className={heading}>Tiến độ{data.subject.progressUpdatedAt ? ` · ${shortDay(data.subject.progressUpdatedAt)}` : ""}</h2>
              {data.subject.progressSummary && <p className="whitespace-pre-wrap">{data.subject.progressSummary}</p>}
              {data.subject.roadmap?.length ? <>
                <p className={pencil}>Các bài sắp tới</p>
                <ol>
                  {data.subject.roadmap.slice(0,3).map((step,i)=><li key={i}><span className="font-hand text-xl text-accent">{i+1}.</span> {step.title} <span className="text-muted">· {step.objective}</span></li>)}
                </ol>
                {data.subject.roadmap.length > 3 && <details><summary className={pencilLink + " cursor-pointer"}>Xem các bước còn lại</summary>
                  <ol>{data.subject.roadmap.slice(3).map((step,i)=><li key={i}><span className="font-hand text-xl text-accent">{i+4}.</span> {step.title} <span className="text-muted">· {step.objective}</span></li>)}</ol>
                </details>}
              </> : !data.subject.progressSummary && <p className={pencil}>Các bài sắp tới sẽ hiện sau bài đầu tiên.</p>}
            </section>
          )}
          <h2 className={heading}>Kỹ năng</h2>
          {!skills.length && <p className={pencil}>Chưa có kỹ năng nào.</p>}
          <ul>
            {skills.map((s) => {
              const due = s.mastery === "needs_review" || (!!s.next_review_day && s.next_review_day <= today);
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-x-3">
                  <Dots value={masteryDots[s.mastery ?? "not_assessed"] ?? 0} label={masteryText[s.mastery ?? "not_assessed"]} />
                  <span className="min-w-0 flex-1 break-words">
                    {skillFacet(s.key) && <span className="mr-1.5 font-hand text-accent">{skillFacet(s.key)!.toUpperCase()}</span>}
                    {skillLabel(s.name)}
                  </span>
                  <span className={pencil}>{due ? "cần ôn" : s.next_review_day ? `ôn lại ${shortDay(s.next_review_day)}` : masteryText[s.mastery ?? "not_assessed"].toLowerCase()}</span>
                  {canEdit && (
                    <select aria-label={"Đặt trạng thái " + skillLabel(s.name)} disabled={saving} value={s.mastery ?? "not_assessed"} onChange={(e) => void setMastery(s, e.target.value)} className="h-7 border-0 border-b border-rule bg-transparent text-sm">
                      {Object.entries(masteryText).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  )}
                </li>
              );
            })}
          </ul>
          {canEdit && skills.length > 0 && (
            <label className="block text-sm text-muted">Lý do khi đặt trạng thái bằng tay
              <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className={fieldClass} />
            </label>
          )}
          <h2 className={heading}>Hay nhầm</h2>
          {!openErrors.length && <p className={pencil}>Chưa ghi nhận lỗi lặp.</p>}
          <ul>
            {openErrors.map((e) => (
              // Noted like a teacher's margin remark; a suspected pattern is written in pencil until confirmed.
              <li key={e.id} className={e.confidence === "suspected" ? pencil : "font-hand text-[19px] leading-7 text-brick"}>
                {e.label.replace(/^[GPN]:\s*/, "")}{e.status === "improving" ? " · đang cải thiện" : ""}{e.confidence === "suspected" ? " · đang theo dõi" : ""}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
export function SkillProgress(props: Parameters<typeof Progress>[0]) {
  return <Progress key={props.subjectId + String(props.learner)} {...props} />;
}
