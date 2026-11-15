import type { ItemView } from "../../../lib/lesson-v2/store";

export type Voice = "f" | "m";
export type ListeningAudio = NonNullable<ItemView["audio"]> & { src?: Record<Voice, string> };

export type ListeningItem = {
  lessonId: string;
  itemId: string;
  readOnly: boolean;
};

async function post(item: ListeningItem, action: "plays" | "reveal", body?: { level: "slow" | "transcript" }) {
  if (item.readOnly) return null;
  const path = `/api/lessons/${encodeURIComponent(item.lessonId)}/items/${encodeURIComponent(item.itemId)}/${action}`;
  const response = await fetch(path, {
    method: "POST",
    keepalive: true,
    ...(body && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  // L3 may not be available on the current deployment yet.
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Chưa ghi được lượt nghe.");
  return response;
}

export async function recordPlay(item: ListeningItem, helped: boolean) {
  await Promise.all([post(item, "plays"), helped && post(item, "reveal", { level: "slow" })]);
}

export async function revealTranscript(item: ListeningItem) {
  const response = await post(item, "reveal", { level: "transcript" });
  const data = (await response?.json()) as { transcript?: unknown } | undefined;
  return typeof data?.transcript === "string" && data.transcript.trim() ? data.transcript : null;
}
