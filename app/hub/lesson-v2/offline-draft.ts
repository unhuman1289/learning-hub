const prefix = "lh:lesson-draft:";
const maxAge = 24 * 60 * 60 * 1000;

export function readOfflineDraft(key: string): string | undefined {
  try {
    const entry = localStorage.getItem(prefix + key);
    if (!entry) return;
    const { expiresAt, draft } = JSON.parse(entry);
    if (Number.isFinite(expiresAt) && expiresAt > Date.now() && typeof draft === "string") return draft;
    localStorage.removeItem(prefix + key);
  } catch {
    // Private browsing or a full store can leave only the in-memory draft available.
  }
}

export function writeOfflineDraft(key: string, draft: string | undefined) {
  try {
    if (draft === undefined) localStorage.removeItem(prefix + key);
    else localStorage.setItem(prefix + key, JSON.stringify({ expiresAt: Date.now() + maxAge, draft }));
  } catch {
    // The reader still keeps the in-memory copy.
  }
}
