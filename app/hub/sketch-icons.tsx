const strokes = {
  closeBook: "M5 6c6-1 11 0 15 2v12c-4-2-9-3-15-2V6Zm15 2 2-1v12l-2 1M5 10h8m-4-3-4 3 4 3",
  settings: "M10 3h4l1 3 3 .4 2.2 3-1.4 2.6 1 2.5-2.3 3.1-2.8-.2-1.5 3.2-4-.2-1-3-3 .1L3 14.5l1.2-2.7L3 9l2.5-2.7 2.7.2L10 3Zm5 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  learn: "M4 5c5-1 9 0 12 1v14c-4-1-8-1-12 0V5Zm12 1 4-1v15l-4 1M9 5v7l2-2 2 2V5",
  practice: "m5 16-1 5 5-1L21 8l-4-4L5 16Zm0 0 4 4m6-14 4 4M4 21l3-3",
  personal: "M15 3H5v19h15V12M9 8h5m-5 5h2m3 4-3 1 1-3 8-8 3 3-9 7Z",
  hourglass: "M6 3h12M6 21h12M7 4c0 4 2 5 5 8-3 2-5 4-5 8M17 4c0 4-2 5-5 8 3 2 5 4 5 8",
  refresh: "M20 9a8 8 0 1 0 0 6M20 4v5h-5",
  close: "m6 6 12 12M18 6 6 18",
  chevron: "m5 9 7 7 7-7",
  external: "M7 17 18 6M9 6h9v9",
  plus: "M12 5v14M5 12h14",
  check: "m5 12 4 5L19 7",
  clip: "M8 13l7-7a3 3 0 0 1 4 4l-9 10a5 5 0 0 1-7-7l10-10m-7 12 8-8",
  forward: "M4 12h15m-6-6 6 6-6 6",
  notice: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5m0 4v.2",
  key: "M14 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-2 4 8 8m-4-4 2-2",
  download: "M4 7h16v13H4V7Zm0 0 8 7 8-7m-8-5v5",
  house: "m3 11 9-8 9 8M5 10v10h14V10M10 20v-6h4v6",
};

export function SketchIcon({ name, size = 24, className }: {
  name: keyof typeof strokes; size?: number; className?: string;
}) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={strokes[name]} />
  </svg>;
}

export function SketchTurnCorner({ back = false }: { back?: boolean }) {
  return <svg width="38" height="38" viewBox="0 0 40 40" aria-hidden="true" style={{ transform: back ? "scaleX(-1)" : undefined }}>
    <path d="M4 5h31v18L20 35H4Z" fill="#f7eac9" stroke="#6b4e36" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M20 35c4-4 7-9 6-14l9 2M10 17h10m-4-4 4 4-4 4" fill="none" stroke="#6b4e36" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
