import { lazy, Suspense } from "react";
import type { LessonPackageV3 } from "../../../lib/contracts/lesson-package-v3";
import { CodeLines } from "./inputs/code-lines";
import type { SpreadBlock } from "../notebook/spread";

type Knowledge = LessonPackageV3["knowledge"][number];
const DrawnFigure = lazy(() => import("./drawn-figure").then(module => ({ default: module.DrawnFigure })));

export function knowledgeBlocks(knowledge: Knowledge[]): SpreadBlock[] {
  return knowledge.map((block, index): SpreadBlock => {
    let node;
    let lines;
    switch (block.kind) {
      case "figure":
        node = <Suspense fallback={<p role="status">Đang mở hình…</p>}><DrawnFigure figure={block.figure} /></Suspense>;
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
