"use client";
import {useLiveRefresh} from "./use-live-refresh";
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
type ProgressData={skills:Skill[];errors:Pattern[];effort:{minutes:number;days:number;attempts:number;retries:number}|null;subject:{level:string;roadmap:{title:string;objective:string;situation:string;skills:string[];mode:string}[]}};
type Pattern = { id: string; label: string; confidence: string; status: string };
function Progress({ subjectId, learner, canEdit }: { subjectId: string; learner?: string | null; canEdit?: boolean }) {
  const [data, setData] = useState<ProgressData | null>(null),
    [error, setError] = useState(""),
    [note, setNote] = useState(""),
    [saving, setSaving] = useState(false);
  const url = "/api/subjects/" + subjectId + (learner ? "?learner=" + encodeURIComponent(learner) : "");
  async function load() {
    const r = await fetch(url, { cache: "no-store" }),
      x = (await r.json()) as ProgressData & {error?:string};
    if (!r.ok) throw Error(x.error || "Chưa tải được lộ trình.");
    setData(x);
  }
  useEffect(() => {
    let alive = true;
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        const x = (await r.json()) as ProgressData & {error?:string};
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
  return (
    <section aria-label="Lộ trình và tiến bộ" className="my-6 grid gap-4 rounded border border-line bg-paper p-4">
      <h2 className="font-hand text-2xl">Kỹ năng, cố gắng và lộ trình</h2>
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
          <p className="text-sm">Trình độ tự khai: {data.subject.level || "Chưa đặt"}. Kết quả dưới đây phản ánh kỹ năng đã luyện, chưa chứng nhận mức CEFR.</p>
          {data.effort && <section aria-label="Cố gắng trong 14 ngày"><h3 className="font-semibold">Cố gắng trong 14 ngày</h3><p>{Math.round(data.effort.minutes)} phút đã đo · {data.effort.days} ngày học · {data.effort.attempts} lần trả lời · {data.effort.retries} lần làm lại</p><p className="text-sm text-muted">Cố gắng và mức thành thạo được theo dõi riêng.</p></section>}
          <h3 className="font-semibold">Kỹ năng đang học và cần ôn</h3>
          {!data.skills.length && <p>Chưa có kỹ năng được giao.</p>}
          <ul className="grid gap-3">
            {data.skills.filter(s=>s.status!=="retired").map((s) => (
              <li key={s.id} className="border-b border-line pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{s.name}</strong>
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
                      <dd>{s.mastery===null || s.mastery==="not_assessed" ? "Chưa đủ bằng chứng" : `${n ?? 0}/3`}</dd>
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
          <h3 className="font-semibold">Điểm cần cải thiện</h3>
          {!data.errors.some(e=>e.status!=="resolved")&&<p className="text-sm">Chưa ghi nhận mẫu lỗi đang mở; điều này không có nghĩa là đã thành thạo.</p>}
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
          <section aria-label="Các bài tiếp theo"><h3 className="font-semibold">5–10 bài tiếp theo · dự kiến</h3><p className="text-sm text-muted">Thứ tự có thể đổi theo bài làm, lịch ôn và góp ý. Đây là lộ trình, chưa phải bài đã giao.</p>
          {data.subject.roadmap?.length ? <ol className="mt-3 grid gap-3">{data.subject.roadmap.map((step,i)=><li key={i}><strong>{i+1}. {step.title}</strong><p>{step.objective}</p><p className="text-sm text-muted">{step.mode==="review"?"Ôn tập":step.mode==="new"?"Học mới":"Ôn và học mới"} · {step.situation}</p></li>)}</ol>:<p className="mt-2">Lượt soạn tiếp theo sẽ đề xuất lộ trình từ mục tiêu và các kỹ năng của sổ.</p>}</section>
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
