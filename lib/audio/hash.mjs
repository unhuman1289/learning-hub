// Hash the synthesis instructions, with an ordered pair of voices for speakers a and b.
export const AUDIO_HASH = /^[a-f0-9]{64}$/;

export async function audioVariant(audio, pair, variant) {
  const other = variant === 'f' ? 'm' : 'f';
  const solo = audio.lines.every(line => line.speaker === audio.lines[0].speaker);
  const voices = [pair[variant], pair[solo ? variant : other]];
  const lines = audio.lines.map(({ speaker, text }) => [speaker, text]);
  const input = [audio.lang, JSON.stringify(voices), audio.rate, JSON.stringify(lines)].join('|');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return { voices, hash };
}
