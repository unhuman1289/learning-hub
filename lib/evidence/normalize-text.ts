type TextNormalization = {
  ignoreCase?: boolean;
  punctuation?: 'keep' | 'ignore' | 'terminal';
};

export function normalizeText(value: string, { ignoreCase = false, punctuation = 'terminal' }: TextNormalization = {}) {
  let normalized = value.normalize('NFC').trim();
  if (punctuation === 'ignore') normalized = normalized.replace(/\p{P}/gu, '');
  if (punctuation === 'terminal') normalized = normalized.replace(/[.!?。]+$/u, '');
  normalized = normalized.trim().replace(/\s+/g, ' ');
  return ignoreCase ? normalized.toLocaleLowerCase('de-DE') : normalized;
}
