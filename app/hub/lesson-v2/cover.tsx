"use client";
import { buttonClass } from "../ui";
export function Cover({
  title,
  objective,
  why,
  minutes,
  onStart,
}: {
  title: string;
  objective: string;
  why: string;
  minutes: number | null;
  onStart: () => void;
}) {
  return (
    <header className="space-y-4">
      <h1 className="font-print text-3xl">{title}</h1>
      <p className="text-sm text-muted">{minutes} phút</p>
      <p className="leading-7">{objective}</p>
      <p className="rounded border border-line bg-rose-soft p-4">Vì sao hôm nay: {why}</p>
      <button className={buttonClass("primary")} onClick={onStart}>
        Mở bài
      </button>
    </header>
  );
}
