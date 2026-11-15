type TextNormalization = {
  ignoreCase?: boolean;
  punctuation?: 'keep' | 'ignore' | 'terminal';
};

export function normalizeText(value: string, { ignoreCase = false, punctuation = 'terminal' }: TextNormalization = {}) {
  let normalized = value.normalize('NFD')
    // In open Vietnamese syllables, both conventions mark the same tone in oa, oe and uy.
    .replace(/([oOuU])([\u0300\u0301\u0303\u0309\u0323])([aAeEyY])(?![\p{L}\p{M}])/gu,
      (match, first: string, tone: string, second: string) => {
        const pair = (first + second).toLowerCase();
        return pair === 'oa' || pair === 'oe' || pair === 'uy' ? first + second + tone : match;
      })
    .normalize('NFC')
    .trim()
    .replace(/[„“”＂]/gu, '"')
    .replace(/[‘’‚＇]/gu, "'")
    .replace(/\p{Pd}/gu, '-');
  if (punctuation === 'ignore') normalized = normalized.replace(/\p{P}/gu, '');
  if (punctuation === 'terminal') {
    normalized = normalized.replace(/[.!?。…,;:．！，；：？]+$/u, '');
    normalized = normalized.replace(/(^|\s)([+-]?\d+),(\d+)(?=\s|$)/g, '$1$2.$3');
  }
  normalized = normalized.trim().replace(/\s+/g, ' ');
  return ignoreCase ? normalized.toLocaleLowerCase('de-DE') : normalized;
}
