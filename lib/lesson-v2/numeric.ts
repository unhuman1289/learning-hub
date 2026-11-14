// Model keys use a bare number or a fraction with a positive integer denominator.
// Units use key.unit. The decimal alternatives exclude ambiguous grouped forms like 1.000.
const keyMagnitude = String.raw`(?:[0-9]+(?:,[0-9]+)?|[0-9]{4,}\.[0-9]+|0{1,3}\.[0-9]{3}|[0-9]{1,3}\.(?:[0-9]{1,2}|[0-9]{4,}))`;
export const numericKeyValuePattern = `^[+-]?${keyMagnitude}(?:/0*[1-9][0-9]*)?$`;

export function normalizeNumericKeyValue(raw: string): string {
  return raw.trim().replace(/^x\s*=\s*/i, '').replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();
}

/** A dotted group with three trailing digits needs clarification unless its integer part is zero. */
export function readNumericAnswer(raw: string): { value: number; unit: string } | { clarification: string } | null {
  const match = raw.trim().replace(/\s+/g, ' ').match(/^([+-]?\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+(?:[.,]\d+)?))?\s*([\p{L}\p{Sc}%°][^\d]{0,19})?$/u);
  if (!match) return null;
  for (const part of [match[1], match[2]]) {
    const grouped = part?.match(/^([+-]?\d{1,3})\.(\d{3})$/);
    if (grouped && Number(grouped[1]) !== 0) {
      const thousands = Number(grouped[1] + grouped[2]);
      const decimal = String(Number(part)).replace('.', ',');
      return { clarification: `Bạn muốn viết ${thousands} hay ${decimal}?` };
    }
  }
  const toNumber = (part: string) => Number(part.replace(',', '.'));
  const numerator = toNumber(match[1]);
  const denominator = match[2] === undefined ? 1 : toNumber(match[2]);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return { value: numerator / denominator, unit: (match[3] ?? '').trim() };
}

export function parseNumericAnswer(raw: string): { value: number; unit: string } | null {
  const parsed = readNumericAnswer(raw);
  return parsed && 'value' in parsed ? parsed : null;
}
