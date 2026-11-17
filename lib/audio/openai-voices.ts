export const OPENAI_SPEECH_MODEL = 'gpt-4o-mini-tts-2025-12-15';
export const OPENAI_VOICE_PREFIX = 'openai:' + OPENAI_SPEECH_MODEL + ':';
export const openAiGermanVoices = {
  'de-DE': { f: OPENAI_VOICE_PREFIX + 'marin', m: OPENAI_VOICE_PREFIX + 'cedar' },
};
