import { openAiSubjects, type QueueBindings } from '../ai-jobs/queue.ts';

export const OPENAI_SPEECH_MODEL = 'gpt-4o-mini-tts-2025-12-15';
export const OPENAI_VOICE_PREFIX = 'openai:' + OPENAI_SPEECH_MODEL + ':';
export const openAiGermanVoices = {
  'de-DE': { f: OPENAI_VOICE_PREFIX + 'marin', m: OPENAI_VOICE_PREFIX + 'cedar' },
};

/** The rollout, rather than an individual runner's lease, controls new roadmap steps. */
export function openAiTtsSubjects(bindings: QueueBindings & Pick<Cloudflare.Env, 'OPENAI_API_KEY' | 'OPENAI_TTS_SUBJECT_IDS' | 'UPLOADS'>) {
  if (!bindings.OPENAI_API_KEY?.trim() || !bindings.UPLOADS) return [];
  const enabled = new Set(bindings.OPENAI_TTS_SUBJECT_IDS?.split(',').map(id => id.trim()));
  return openAiSubjects(bindings).filter(id => enabled.has(id));
}
