"use client";

import { useEffect, useState } from "react";
import { fieldClass, labelClass } from "./paper-dialog";
import { buttonClass } from "./ui";
import { apiJson } from "./api";

type Settings = { displayName: string | null; avatar: string; personalPrompt: string; explainLanguage: string };

/** Profile card (L5.5): name, icon, explanation language and the personal prompt the lesson writers and graders read. */
export function ProfileSettings({ learner, title = "Về bạn" }: { learner: string; title?: string }) {
  const [settings, setSettings] = useState<Settings | null>(null),
    [state, setState] = useState(""),
    [error, setError] = useState("");
  const url = `/api/learners/${encodeURIComponent(learner)}/settings`;
  useEffect(() => {
    let live = true;
    apiJson<{ settings: Settings }>(url)
      .then((value) => {
        if (live) setSettings(value.settings);
      })
      .catch((e: Error) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [url]);
  if (!settings) return <p className="text-muted">{error || "Đang tải hồ sơ…"}</p>;
  async function save(form: FormData) {
    setState("Đang lưu…");
    setError("");
    try {
      const name = String(form.get("displayName") ?? "").trim();
      const value = await apiJson<{ settings: Settings }>(url, {
        method: "PATCH",
        json: {
          displayName: name || null,
          explainLanguage: String(form.get("explainLanguage") ?? "vi"),
          personalPrompt: String(form.get("personalPrompt") ?? ""),
        },
      });
      setSettings(value.settings);
      setState("Đã lưu.");
    } catch (e) {
      setState("");
      setError((e as Error).message);
    }
  }
  return (
    <form
      aria-label={title}
      className="grid gap-3 sm:grid-cols-[1fr_auto_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        void save(new FormData(event.currentTarget));
      }}
    >
      <h2 className="font-hand text-2xl sm:col-span-3">{title}</h2>
      <label className={labelClass}>
        Tên hiển thị
        <input name="displayName" maxLength={40} defaultValue={settings.displayName ?? ""} className={fieldClass} />
      </label>
      <label className={labelClass}>
        Giải thích bằng
        <select name="explainLanguage" defaultValue={settings.explainLanguage} className={fieldClass}>
          <option value="vi">Tiếng Việt</option>
          <option value="de">Tiếng Đức</option>
          <option value="en">Tiếng Anh</option>
        </select>
      </label>
      <label className={labelClass + " sm:col-span-3"}>
        Lời dặn
        <span className="text-sm font-normal text-muted">Điều bạn muốn cô soạn và sửa bài lưu ý.</span>
        <textarea name="personalPrompt" maxLength={4000} rows={6} defaultValue={settings.personalPrompt} className={fieldClass} />
      </label>
      {error && (
        <p role="alert" className="sm:col-span-3">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3 sm:col-span-3">
        <button type="submit" className={buttonClass("primary")}>
          Lưu
        </button>
        <span role="status" className="text-sm text-muted">
          {state}
        </span>
      </div>
    </form>
  );
}
