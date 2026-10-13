"use client";
import { useState } from "react";
import { buttonClass } from "../ui";
export function ImportPanel() {
  const [value, setValue] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="space-y-3 border border-line p-4">
      <h2 className="font-hand text-2xl">Giao bài đã duyệt</h2>
      <p className="text-sm text-muted">
        Dán gói bài có learnerId, subjectId và lesson. Bài chưa xong được giữ nguyên. Dùng bài thử trước khi giao cho người học.
      </p>
      <label htmlFor="lesson-import">Nội dung bài</label>
      <textarea
        id="lesson-import"
        rows={9}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded border border-line bg-paper p-3 font-mono text-base"
      />
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
        Tôi đã đọc, duyệt nội dung và đồng ý giao cho người học đã chọn.
      </label>
      <button
        className={buttonClass("primary")}
        disabled={busy || !reviewed || !value.trim()}
        onClick={async () => {
          setBusy(true);
          setStatus("");
          try {
            const body = JSON.parse(value);
            const response = await fetch("/api/admin/lessons/import", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...body, reviewed }),
            });
            const result = (await response.json()) as { error?: string; lessonId?: string; issues?: { path: string; message: string }[] };
            if (!response.ok)
              throw Error(
                result.issues
                  ? result.issues.map((x: { path: string; message: string }) => `${x.path}: ${x.message}`).join("\n")
                  : result.error || "Chưa giao được bài",
              );
            setStatus("Đã giao bài " + result.lessonId + ". Người học mở lại sổ để xem.");
          } catch (error) {
            setStatus((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Đang giao…" : "Giao bài"}
      </button>
      <p role="status" className="whitespace-pre-wrap">
        {status}
      </p>
    </section>
  );
}
