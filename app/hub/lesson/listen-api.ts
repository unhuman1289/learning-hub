import type { ItemView } from "../../../lib/lesson-v2/store";

export type Voice = "f" | "m";
export type ListeningAudio = NonNullable<ItemView["audio"]> & { src?: Record<Voice, string> };

export type ListeningItem = {
  lessonId: string;
  itemId: string;
  readOnly: boolean;
};

async function post(item: ListeningItem, action: "plays" | "reveal", body: { slow: boolean } | { level: "slow" | "extra" | "transcript" }) {
  if (item.readOnly) return null;
  const path = `/api/lessons/${encodeURIComponent(item.lessonId)}/items/${encodeURIComponent(item.itemId)}/${action}`;
  const response = await fetch(path, {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Chưa ghi được lượt nghe.");
  return response;
}

export async function recordPlay(item: ListeningItem, slow: boolean) {
  const response = await post(item, "plays", { slow });
  if (!response) return null;
  const { plays } = await response.json() as { plays: number };
  return plays;
}

export async function recordPlaybackSupport(item: ListeningItem, level: "slow" | "extra") {
  await post(item, "reveal", { level });
}

export async function revealTranscript(item: ListeningItem) {
  const response = await post(item, "reveal", { level: "transcript" });
  const data = (await response?.json()) as { transcript?: unknown } | undefined;
  return typeof data?.transcript === "string" && data.transcript.trim() ? data.transcript : null;
}
