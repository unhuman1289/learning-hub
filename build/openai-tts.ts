import { audioVariant } from '../lib/audio/hash.mjs';
import { uploadAudio } from '../lib/audio/upload.ts';
import { MAX_AUDIO_BYTES, pcmWav } from '../lib/audio/wav.ts';
import { OPENAI_SPEECH_MODEL, OPENAI_VOICE_PREFIX } from '../lib/audio/openai-voices.ts';
import { containsContactDetails } from '../lib/automation/privacy.ts';
import { validateLessonPackage } from '../lib/lesson-v2/validate.ts';
import type { PlanContext, PlanResult } from '../lib/contracts/ai-common.ts';
import type { AudioSpec } from '../lib/contracts/lesson-package-v3.ts';

async function speech(audio: AudioSpec, line: AudioSpec['lines'][number], voice: string, apiKey: string, fetcher: typeof fetch, signal: AbortSignal) {
  const response = await fetcher('https://api.openai.com/v1/audio/speech', {
    method: 'POST', redirect: 'manual', signal,
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OPENAI_SPEECH_MODEL,
      voice: voice.slice(OPENAI_VOICE_PREFIX.length),
      input: line.text,
      instructions: 'Read the provided text verbatim in German, with clear, natural pronunciation. Do not add words.',
      speed: audio.rate,
      response_format: 'pcm',
    }),
  });
  if (!response.ok || !response.body) throw Error('OpenAI speech request failed.');
  const reader = response.body.getReader();
  const data = new Uint8Array(MAX_AUDIO_BYTES);
  let size = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    if (size + chunk.value.length > MAX_AUDIO_BYTES) {
      await reader.cancel();
      throw Error('OpenAI speech exceeded the audio size limit.');
    }
    data.set(chunk.value, size);
    size += chunk.value.length;
  }
  return data.slice(0, size);
}

type Upload = (req: Request, hash: string) => ReturnType<typeof uploadAudio>;

export async function uploadOpenAiPlanAudio(
  context: PlanContext, result: PlanResult, apiKey: string, upload: Upload,
  fetched: Set<string>, log: (entry: { variant: string; ms: number; count: number }) => void, fetcher = fetch,
) {
  const drafts = [
    ...result.subjects.flatMap((entry, index) => (['primaryLesson', 'reviewSet'] as const)
      .map(field => ({ lesson: entry[field], subjectId: entry.subjectId, path: `/subjects/${index}/${field}` }))),
    ...result.explorations.map((entry, index) => ({ ...entry, path: `/explorations/${index}/lesson` })),
  ];
  const audios: AudioSpec[] = [];
  for (const { lesson, subjectId, path } of drafts) {
    if (!lesson?.items.some(item => item.audio)) continue;
    if (!context.adaptive?.listening?.max)
      return [{ path: path + '/items', code: 'listening_count', message: 'Hub không cấp câu nghe cho bài này.' }];
    const subject = context.subjects.find(subject => subject.subjectId === subjectId);
    if (!subject || subject.sensitivity !== 'normal' || lesson.items.some(item =>
      item.audio && (item.audio.lang !== 'de-DE' || containsContactDetails(item.audio.lines.map(line => line.text).join('\n')))))
      throw Error('OpenAI speech input is outside the QA scope.');
    const validated = validateLessonPackage(lesson, {
      adaptive: true, aiSizes: true, listening: context.adaptive?.listening, frameworkKey: subject.framework?.key,
      minDifficulty: context.adaptive?.difficulty?.min, maxDifficulty: context.adaptive?.difficulty?.max ?? subject.limits.maxDifficulty,
      itemKinds: subject.limits.itemKinds, sensitivity: subject.sensitivity, subjectTitle: subject.title,
    });
    if (!validated.lesson) return validated.issues.map(issue => ({ ...issue, path: path + issue.path }));
    for (const item of lesson.items) if (item.audio) audios.push(item.audio);
  }
  for (const variant of ['f', 'm'] as const) {
    const start = Date.now();
    const pending = new Map<string, { audio: AudioSpec; voices: string[] }>();
    for (const audio of audios) {
      const pair = context.tts?.voices[audio.lang];
      if (!pair) continue;
      const { hash, voices } = await audioVariant(audio, pair, variant);
      if (!fetched.has(hash)) pending.set(hash, { audio, voices });
    }
    if (!pending.size) continue;
    const signal = AbortSignal.timeout(18_000);
    const turns = [...pending].flatMap(([hash, { audio, voices }]) =>
      audio.lines.map(line => ({ hash, audio, line, voice: voices[line.speaker === 'a' ? 0 : 1] })));
    const clips = new Map<string, Uint8Array[]>();
    for (let offset = 0; offset < turns.length; offset += 4) {
      const group = turns.slice(offset, offset + 4);
      const bytes = await Promise.all(group.map(({ audio, line, voice }) => speech(audio, line, voice, apiKey, fetcher, signal)));
      group.forEach(({ hash }, index) => {
        const pieces = clips.get(hash) ?? [];
        pieces.push(bytes[index]);
        clips.set(hash, pieces);
      });
    }
    log({ variant, ms: Date.now() - start, count: pending.size });
    for (const [hash, { audio }] of pending) {
      const encoded = new TextEncoder().encode(JSON.stringify({ audio, variant }));
      const spec = btoa(String.fromCharCode(...encoded));
      const request = new Request('https://queue.internal/audio', {
        method: 'PUT', body: pcmWav(clips.get(hash)!),
        headers: { 'Content-Type': 'audio/wav', 'X-Audio-Spec': spec },
      });
      await upload(request, hash);
      fetched.add(hash);
    }
  }
  return [];
}
