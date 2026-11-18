export function estimateCost(
  usage: { model: string; inputTokens: number; outputTokens: number; cachedInputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number },
  table: string | undefined,
): number | null {
  if (usage.model === 'none') return 0;
  if (!table) return null;
  let config: Record<string, { input: number; output: number; cacheRead?: number; cacheWrite?: number }>;
  try {
    config = JSON.parse(table);
  } catch {
    return null;
  }
  const rate = config[usage.model];
  if (!rate || !Number.isFinite(rate.input) || !Number.isFinite(rate.output) || rate.input < 0 || rate.output < 0) return null;
  return (
    ((usage.inputTokens - Math.min(usage.inputTokens, usage.cachedInputTokens ?? 0)) * rate.input +
      Math.min(usage.inputTokens, usage.cachedInputTokens ?? 0) * (rate.cacheRead ?? rate.input) +
      usage.outputTokens * rate.output +
      (usage.cacheReadTokens ?? 0) * (rate.cacheRead ?? rate.input) +
      (usage.cacheWriteTokens ?? 0) * (rate.cacheWrite ?? rate.input)) /
    1e6
  );
}
