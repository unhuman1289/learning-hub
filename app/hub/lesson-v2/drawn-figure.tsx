import type { LessonPackageV3 } from "../../../lib/contracts/lesson-package-v3";
import { FigureImage } from "./figure-image";

type Figure = Extract<LessonPackageV3["knowledge"][number], { kind: "figure" }>["figure"];

export function DrawnFigure({ figure }: { figure: Figure }) {
  if (figure.type === "labelled-image") return <FigureImage image={figure.image} marks={figure.marks} description={figure.description} />;
  if (figure.type === "bar") {
    const max = Math.max(1, ...figure.columns.map(col => col.value));
    return <figure aria-label={figure.description}>
      <figcaption className="font-hand text-lg">{figure.description}</figcaption>
      <ul className="grid gap-1 text-sm">{figure.columns.map((col, index) =>
        <li key={index} className="grid grid-cols-[minmax(4rem,1fr)_2fr_auto] items-center gap-2">
          <span>{col.label}</span><span aria-hidden="true" className="h-2 rounded bg-accent-paper" style={{ width: (col.value / max * 100) + "%" }} />
          <span className="tabular-nums">{col.value}</span>
        </li>)}</ul>
    </figure>;
  }
  const count = figure.steps.length;
  const circular = figure.type === "cycle";
  const positions = figure.steps.map((_, i) => circular
    ? [120 + 84 * Math.sin(i * 2 * Math.PI / count), 98 - 70 * Math.cos(i * 2 * Math.PI / count)]
    : [35 + i % 3 * 85, 24 + Math.floor(i / 3) * 47]);
  const edges = figure.type === "flow" ? figure.edges.map(([a, b]) => [
    figure.steps.findIndex(step => step.id === a), figure.steps.findIndex(step => step.id === b),
  ]) : figure.steps.map((_, i) => [i, (i + 1) % count]);
  return <figure>
    <figcaption className="font-hand text-lg">{figure.description}</figcaption>
    <svg viewBox={`0 0 240 ${circular ? 195 : 48 + Math.floor((count - 1) / 3) * 47}`} aria-hidden="true" className="mx-auto block w-full max-w-60 text-muted-paper">
      {edges.map(([a, b], index) => {
        const [x, y] = positions[a], [toX, toY] = positions[b];
        const angle = Math.atan2(toY - y, toX - x);
        const endX = toX - 13 * Math.cos(angle), endY = toY - 13 * Math.sin(angle);
        return <g key={index} stroke="currentColor" fill="none" strokeLinecap="round">
          <path d={`M${x} ${y}L${endX} ${endY}`} />
          <path d="M-5 -3L0 0L-5 3" transform={`translate(${endX},${endY}) rotate(${angle * 180 / Math.PI})`} />
        </g>;
      })}
      {positions.map(([x, y], index) => <g key={index} transform={`translate(${x},${y})`}>
        {circular ? <circle r="11" fill="var(--color-paper-2)" stroke="currentColor" />
          : <rect x="-12" y="-10" width="24" height="20" rx="3" fill="var(--color-paper-2)" stroke="currentColor" />}
        <text textAnchor="middle" y="4" fontSize="11" fill="var(--color-ink-paper)">{index + 1}</text>
      </g>)}
    </svg>
    <ol className="ml-5 list-decimal text-sm">{figure.steps.map(step => <li key={step.id}>{step.text}</li>)}</ol>
    {figure.type === "flow" && <p className="sr-only">Mũi tên: {edges.map(([a, b]) => `${a + 1} đến ${b + 1}`).join(", ")}.</p>}
  </figure>;
}
