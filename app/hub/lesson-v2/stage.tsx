"use client";
import { useState } from "react";
import { ItemCard } from "./item-card";
import type { ItemView } from "../../../lib/lesson-v2/store";
import type { DraftAnswers } from "../../../lib/lesson-v2/actions";
import { buttonClass } from "../ui";
export function Stage({
  items,
  answers,
  disabled,
  readOnly,
  onChange,
  onReveal,
}: {
  items: ItemView[];
  answers: DraftAnswers;
  disabled: boolean;
  readOnly: boolean;
  onChange: (id: string, value: DraftAnswers[string]) => void;
  onReveal: (id: string, level: "hint1" | "hint2" | "solution") => void;
}) {
  const [index, setIndex] = useState(0);
  return (
    <section aria-label="Câu hỏi" className="space-y-4">
      {items.map((item, i) => (
        <div key={item.id} className={i === index ? "" : "hidden md:block"}>
          <ItemCard
            item={item}
            value={answers[item.id] ?? { answer: "" }}
            disabled={disabled}
            readOnly={readOnly}
            onChange={(value) => onChange(item.id, value)}
            onReveal={(level) => onReveal(item.id, level)}
          />
        </div>
      ))}
      {items.length > 1 && (
        <nav aria-label="Chuyển câu" className="flex items-center justify-between md:hidden">
          <button className={buttonClass("secondary")} disabled={index === 0} onClick={() => setIndex((x) => x - 1)}>
            Câu trước
          </button>
          <span>
            {index + 1}/{items.length}
          </span>
          <button className={buttonClass("secondary")} disabled={index >= items.length - 1} onClick={() => setIndex((x) => x + 1)}>
            Câu tiếp
          </button>
        </nav>
      )}
    </section>
  );
}
