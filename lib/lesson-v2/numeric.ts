/**
 * Reads a numeric answer the way learners write it: "0,75", "0.75", "3/4", "-2"; mixed numbers ("1 1/2") and thousands separators ("1.000,5") are rejected as
 * ambiguous. A trailing unit (letters, currency, %, °) is allowed and returned separately. Returns null when the text is not a number.
 */
export function parseNumericAnswer(raw: string): { value: number; unit: string } | null {
  const match = raw.trim().replace(/\s+/g, ' ').match(/^([+-]?\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+(?:[.,]\d+)?))?\s*([\p{L}\p{Sc}%°][^\d]{0,19})?$/u);
  if (!match) return null;
  // "1.000" is a thousand in Vietnamese and German writing but 1 in English: refuse to guess.
  if ([match[1], match[2]].some((part) => part !== undefined && /^[+-]?\d{1,3}\.\d{3}$/.test(part))) return null;
  const toNumber = (part: string) => Number(part.replace(',', '.'));
  const numerator = toNumber(match[1]);
  const denominator = match[2] === undefined ? 1 : toNumber(match[2]);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return { value: numerator / denominator, unit: (match[3] ?? '').trim() };
}
