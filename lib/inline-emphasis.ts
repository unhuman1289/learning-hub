/** Minimal inline emphasis; unmatched markers and all HTML remain plain text. */
export function inlineEmphasis(text: string): { kind: 'text' | 'strong' | 'em'; text: string }[] {
  const result: { kind: 'text' | 'strong' | 'em'; text: string }[] = [];
  const pattern = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;
  let position = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index;
    if (index > position) result.push({ kind: 'text', text: text.slice(position, index) });
    result.push({ kind: match[1] !== undefined ? 'strong' : 'em', text: match[1] ?? match[2] });
    position = index + match[0].length;
  }
  if (position < text.length) result.push({ kind: 'text', text: text.slice(position) });
  return result;
}
