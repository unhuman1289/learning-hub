export const LISTENING_LESSON = 'les_00000000000000000007';
export const VOICE_HASHES = { f: '1'.repeat(64), m: '2'.repeat(64), next: '3'.repeat(64) };
export const TRANSCRIPT = 'Guten Morgen.';
export const AUDIO = {
  lang: 'de-DE', rate: 1, maxPlays: 2, transcript: 'after_answer',
  lines: [{ speaker: 'a', text: TRANSCRIPT }],
};
export const ASSISTED_LESSONS = [
  { id: 'les_00000000000000000008', mode: 'per-item', level: 'slow' },
  { id: 'les_00000000000000000009', mode: 'whole-lesson', level: 'extra' },
];
