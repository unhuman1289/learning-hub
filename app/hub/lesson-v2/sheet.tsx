"use client";
import type { LessonPackageV2 } from "../../../lib/contracts/lesson-package-v2";
export function Sheet({ sheet }: { sheet: LessonPackageV2["sheet"] }) {
  if (!sheet) return null;
  return (
    <section aria-label="Tờ kiến thức" className="space-y-4">
      <h2 className="font-hand text-2xl">Tờ kiến thức</h2>
      <p className="whitespace-pre-wrap leading-7">{sheet.explanation}</p>
      {(
        [
          ["Quy tắc", sheet.rules],
          ["Lỗi hay gặp", sheet.mistakes],
          ["Mẹo", sheet.tips],
          ["Tự kiểm tra", sheet.checklist],
        ] as const
      ).map(
        ([title, items]) =>
          items.length > 0 && (
            <div key={title}>
              <h3 className="font-semibold">{title}</h3>
              <ul className="list-disc pl-6">
                {items.map((text, i) => (
                  <li key={i} className="leading-7">
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          ),
      )}
      {sheet.examples.map((e, i) => (
        <blockquote key={i} className="border-l border-accent pl-4">
          {e.correct ? "✓" : "✗"} {e.text}
          {e.note && <p>{e.note}</p>}
        </blockquote>
      ))}
    </section>
  );
}
