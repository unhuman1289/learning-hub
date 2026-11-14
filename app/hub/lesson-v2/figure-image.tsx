import type { LessonPackageV3 } from "../../../lib/contracts/lesson-package-v3";

type Figure = Extract<LessonPackageV3["knowledge"][number], { kind: "figure" }>["figure"];
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
