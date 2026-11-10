"use client";
import { useEffect, useState } from "react";
import { buttonClass } from "./ui";
const masteryText: Record<string, string> = {
  not_assessed: "Chưa đánh giá",
  introduced: "Đã tiếp cận",
  developing: "Đang hình thành",
  demonstrated: "Đã tự làm được",
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
};
type Pattern = { id: string; label: string; confidence: string; status: string };
/** Deutsch notebooks group skills and errors by G/P/N, from the skill key prefix and the error label prefix (L3.2). */
const facets = [
  ["g", "Ngữ pháp"],
  ["p", "Dấu câu, chính tả"],
  ["n", "Độ tự nhiên"],
] as const;
export const skillFacet = (key?: string) => /^([gpn])-/.exec(key ?? "")?.[1] ?? null;
export const errorFacet = (label: string) => /^([GPN]):/.exec(label)?.[1]?.toLowerCase() ?? null;
function FacetSummary({ skills, errors }: { skills: Skill[]; errors: Pattern[] }) {
  if (!skills.some((s) => skillFacet(s.key))) return null;
  return (
    <dl className="grid grid-cols-3 gap-2 text-sm">
      {facets.map(([facet, name]) => {
        const group = skills.filter((s) => skillFacet(s.key) === facet);
        const open = errors.filter((e) => e.status !== "resolved" && errorFacet(e.label) === facet).length;
        return (
          <div key={facet} className="rounded border border-line p-2">
            <dt className="font-semibold">
              {facet.toUpperCase()} · {name}
            </dt>
            <dd>
              {group.filter((s) => s.mastery === "demonstrated").length}/{group.length} kỹ năng đã tự làm được
            </dd>
            <dd>{open ? open + " lỗi cần chú ý" : "Không có lỗi đang mở"}</dd>
          </div>
        );
      })}
    </dl>
  );
}
function Progress({ subjectId, learner, canEdit }: { subjectId: string; learner?: string | null; canEdit?: boolean }) {
  const [data, setData] = useState<{ skills: Skill[]; errors: Pattern[] } | null>(null),
    [error, setError] = useState(""),
    [note, setNote] = useState(""),
    [saving, setSaving] = useState(false);
  const url = "/api/subjects/" + subjectId + (learner ? "?learner=" + encodeURIComponent(learner) : "");
  async function load() {
    const r = await fetch(url, { cache: "no-store" }),
      x = (await r.json()) as { error?: string; skills: Skill[]; errors: Pattern[] };
    if (!r.ok) throw Error(x.error || "Chưa tải được lộ trình.");
    setData(x);
  }
  useEffect(() => {
    let alive = true;
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        const x = (await r.json()) as { error?: string; skills: Skill[]; errors: Pattern[] };
        if (!r.ok) throw Error(x.error || "Chưa tải được lộ trình.");
        if (alive) setData(x);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [url]);
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
        x = (await r.json()) as { error?: string; skills: Skill[]; errors: Pattern[] };
      if (!r.ok) throw Error(x.error || "Chưa lưu được trạng thái.");
      await load();
      setNote("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section aria-label="Lộ trình và tiến bộ" className="my-6 grid gap-4 rounded border border-line bg-paper p-4">
      <h2 className="font-hand text-2xl">Lộ trình và tiến bộ</h2>
      {error && (
        <p role="alert" className="text-accent">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Đang đọc tiến độ đã lưu…</p>}
      {data && (
        <>
          <p className="text-sm text-muted">
            Nhận diện đúng và tự vận dụng được được theo dõi riêng. Thang 0–3 phản ánh bài làm đã chấm, không phải chứng nhận trình độ.
          </p>
          {!data.skills.length && <p>Chưa có kỹ năng được giao.</p>}
          <FacetSummary skills={data.skills} errors={data.errors} />
          <ul className="grid gap-3">
            {data.skills.map((s) => (
              <li key={s.id} className="border-b border-line pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>
                    {skillFacet(s.key) && <span className="mr-1 text-sm text-muted">{skillFacet(s.key)!.toUpperCase()}</span>}
                    {s.name}
                  </strong>
                  <span>{masteryText[s.mastery ?? "not_assessed"]}</span>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  {[
                    ["Hiểu", s.dim_knowledge],
                    ["Nhận diện", s.dim_recognition],
                    ["Vận dụng", s.dim_application],
                    ["Ghi nhớ", s.dim_retention],
                  ].map(([name, n]) => (
                    <div key={name}>
                      <dt>{name}</dt>
                      <dd aria-label={String(name) + ": " + (n ?? 0) + " trên 3"}>{n ?? 0}/3</dd>
                    </div>
                  ))}
                </dl>
                {s.next_review_day && <p className="mt-1 text-sm">Ôn lại: {s.next_review_day}</p>}
                {canEdit && (
                  <label className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    Đặt trạng thái{" "}
                    <select
                      aria-label={"Đặt trạng thái " + s.name}
                      disabled={saving}
                      value={s.mastery ?? "not_assessed"}
                      onChange={(e) => void setMastery(s, e.target.value)}
                      className="rounded border border-line bg-paper px-2 py-1"
                    >
                      {Object.entries(masteryText).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </li>
            ))}
          </ul>
          {canEdit && (
            <label className="grid gap-1 text-sm">
              Lý do đặt trạng thái bằng tay
              <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className="rounded border border-line bg-paper p-2" />
            </label>
          )}
          <ul className="text-sm">
            {data.errors
              .filter((e) => e.status !== "resolved")
              .map((e) => (
                <li key={e.id}>
                  {e.confidence === "suspected" ? "Nghi ngờ: " : ""}
                  {e.label} — {e.status === "improving" ? "đang cải thiện" : "cần chú ý"}
                </li>
              ))}
          </ul>
          {error && (
            <button className={buttonClass("secondary")} onClick={() => void load().catch((e) => setError(e.message))}>
              Tải lại
            </button>
          )}
        </>
      )}
    </section>
  );
}
export function SkillProgress(props: Parameters<typeof Progress>[0]) {
  return <Progress key={props.subjectId + String(props.learner)} {...props} />;
}
