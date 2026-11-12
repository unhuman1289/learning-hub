"use client";
import type { LessonPackageV2 } from "../../../lib/contracts/lesson-package-v2";
export function Sheet({ sheet,formatText=(text:string)=>text }: { sheet: LessonPackageV2["sheet"];formatText?:(text:string)=>string }) {
  if (!sheet) return null;
  return (
    <section aria-label="Ghi nhớ" className="space-y-4">
      <p className="whitespace-pre-wrap leading-7">{formatText(sheet.explanation)}</p>
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
                    {formatText(text)}
                  </li>
                ))}
              </ul>
            </div>
          ),
      )}
      {sheet.examples.map((e, i) => (
        <blockquote key={i} className="border-l border-accent pl-4">
          {e.correct ? "✓" : "✗"} {formatText(e.text)}
          {e.note && <p>{formatText(e.note)}</p>}
        </blockquote>
      ))}
    </section>
  );
}
