import type { LessonPackageV3 } from "../../../lib/contracts/lesson-package-v3";
import { CodeLines } from "./inputs/code";
import type { SpreadBlock } from "../notebook/spread";

type Knowledge = LessonPackageV3["knowledge"][number];
type Figure = Extract<Knowledge, { kind: "figure" }>["figure"];
type ImageFigure = Extract<Figure, { type: "labelled-image" }>;

export function FigureImage({ image, marks, description }: Omit<ImageFigure, "type">) {
  return <figure className="mx-auto max-w-xs">
    <svg viewBox="0 0 320 200" role="img" aria-label={description} className="block w-full overflow-visible">
      <image href={`/figures/${image}.svg`} width="320" height="200" />
      {marks.map(({ x, y }, index) => <g key={index} transform={`translate(${x * 3.2},${y * 2})`}>
        <circle r="9" fill="var(--color-paper)" stroke="var(--color-accent-paper)" />
        <text textAnchor="middle" y="3.4" fontSize="10" fill="var(--color-ink-paper)">{index + 1}</text>
      </g>)}
    </svg>
    <figcaption className="text-sm text-muted-paper">{description}</figcaption>
  </figure>;
}

function DrawnFigure({ figure }: { figure: Figure }) {
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

export function knowledgeBlocks(knowledge: Knowledge[]): SpreadBlock[] {
  return knowledge.map((block, index): SpreadBlock => {
    let node;
    let lines;
    switch (block.kind) {
      case "figure":
        node = <DrawnFigure figure={block.figure} />;
        lines = block.figure.type === "bar" ? block.figure.columns.length + 2
          : block.figure.type === "labelled-image" ? 10 : 9 + block.figure.steps.length;
        break;
      case "table":
        node = <div className="overflow-x-auto"><table className="w-full border-collapse text-sm">
          <thead><tr>{block.headers.map((header, i) => <th key={i} scope="col" className="border-b border-rule px-2 text-left">{header}</th>)}</tr></thead>
          <tbody>{block.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} className="border-b border-rule px-2">{cell}</td>)}</tr>)}</tbody>
        </table></div>;
        lines = (block.rows.length + 1) * 2;
        break;
      case "code":
        node = <><pre className="overflow-x-auto border border-rule bg-paper-2 font-mono text-sm leading-6"><code>
          <CodeLines code={block.code} language={block.language} />
        </code></pre>
          {!!block.notes.length && <ul className="text-sm">{block.notes.map((note, i) => <li key={i}>Dòng {note.line} · {note.text}</li>)}</ul>}</>;
        lines = block.code.split("\n").length + block.notes.length * 2;
        break;
      case "steps":
        node = <ol className="ml-5 list-decimal">{block.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>;
        lines = block.steps.length * 2;
        break;
    }
    return { id: `knowledge-${index}`, kind: "remember", reservedLines: lines, node };
  });
}
