export function RequestIcon({ mode }: { mode: "learn" | "practice" | "personal" }) {
  return <svg aria-hidden="true" width="34" height="34" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {mode === "learn" ? <path d="M7 8c8-2 14-1 19 1v23c-5-2-12-2-19 0V8Zm19 1 7-2v24l-7 1M15 8v12l4-3 3 3V8" />
      : mode === "practice" ? <path d="m8 25-2 9 9-2L33 14l-7-7L8 25Zm0 0 7 7m8-22 7 7M7 34l4-4" />
      : <path d="M25 5H8v30h24V20m-17-7h7m-7 7h4m4 9-4 1 1-5 14-14 4 4-15 14Zm8-15 4 4" />}
  </svg>;
}
