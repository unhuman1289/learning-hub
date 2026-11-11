"use client";
import { useState, type ReactNode } from "react";
import { ItemCard } from "./item-card";
import type { ItemView } from "../../../lib/lesson-v2/store";
import type { DraftAnswers } from "../../../lib/lesson-v2/actions";
import { buttonClass } from "../ui";
export function Stage({
  items,
  answers,
  disabled,
  readOnly,
  actions,
  onChange,
  onReveal,
  formatText = (text:string)=>text,
}: {
  formatText?:(text:string)=>string;
  items: ItemView[];
  answers: DraftAnswers;
  disabled: boolean;
  readOnly: boolean;
  actions: (item: ItemView) => { feedback?: ReactNode; onSubmit: () => void; submitLabel: string; canSubmit: boolean };
  onChange: (id: string, value: DraftAnswers[string]) => void;
  onReveal: (id: string, level: "hint1" | "hint2" | "solution") => void;
}) {
  const [index, setIndex] = useState(0);
  return (
    <section aria-label="Câu hỏi">
      {items.map((item, i) => (
        <div key={item.id} className={i === index ? "" : "hidden md:block"}>
          <ItemCard
            formatText={formatText}
            item={item}
            number={i + 1}
            {...actions(item)}
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
