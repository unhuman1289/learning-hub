import { SketchIcon } from "../sketch-icons";

export function RequestIcon({ mode }: { mode: "learn" | "practice" | "personal" }) {
  return <SketchIcon name={mode} size={32} />;
}
