import { audioVariant } from '../lib/audio/hash.mjs';
import { ApiError } from '../lib/api-error.ts';
import { AudioStorageError, type uploadAudio } from '../lib/audio/upload.ts';
import { MAX_AUDIO_BYTES } from '../lib/audio/wav.ts';
import { aacDurationMs } from '../lib/audio/aac.ts';
import { OPENAI_SPEECH_MODEL, OPENAI_VOICE_PREFIX } from '../lib/audio/openai-voices.ts';
import { containsContactDetails } from '../lib/automation/privacy.ts';
import { validateLessonPackage } from '../lib/lesson-v2/validate.ts';
import type { PlanContext, PlanResult } from '../lib/contracts/ai-common.ts';
import type { AudioSpec } from '../lib/contracts/lesson-package-v3.ts';

type AudioDiagnostic = {
  stage: 'lesson_validation' | 'speech_api' | 'audio_format' | 'r2' | 'asset_metadata' | 'audio_upload';
  code: string;
  path: string;
  variant?: 'f' | 'm';
  httpStatus?: number;
};

export class QueueAudioError extends Error {
  readonly diagnostic: AudioDiagnostic;
  constructor(diagnostic: AudioDiagnostic) {
    super(diagnostic.code);
    this.diagnostic = diagnostic;
  }
}

async function speech(audio: AudioSpec, line: AudioSpec['lines'][number], voice: string, apiKey: string,
  fetcher: typeof fetch, signal: AbortSignal, location: Pick<AudioDiagnostic, 'path' | 'variant'>) {
  const speechError = (code: string, httpStatus?: number) => new QueueAudioError({
    ...location, stage: 'speech_api', code, ...(httpStatus !== undefined ? { httpStatus } : {}),
  });
  let response;
  try {
    response = await fetcher('https://api.openai.com/v1/audio/speech', {
      method: 'POST', redirect: 'manual', signal,
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OPENAI_SPEECH_MODEL,
        voice: voice.slice(OPENAI_VOICE_PREFIX.length),
        input: line.text,
        instructions: 'Read the provided text verbatim in German, with clear, natural pronunciation. Do not add words.',
        speed: audio.rate,
        response_format: 'aac',
      }),
    });
  } catch {
    throw speechError(signal.aborted ? 'speech_timeout' : 'speech_transport');
  }
  if (!response.ok) throw speechError('speech_http', response.status);
  if (!response.body) throw speechError('speech_body_missing', response.status);
  const reader = response.body.getReader();
  const data = new Uint8Array(MAX_AUDIO_BYTES);
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read().catch(() => {
        throw speechError(signal.aborted ? 'speech_timeout' : 'speech_read_failed');
      });
      if (chunk.done) break;
      if (size + chunk.value.length > MAX_AUDIO_BYTES) {
        await reader.cancel().catch(() => {});
        throw new QueueAudioError({ ...location, stage: 'audio_format', code: 'aac_size_limit' });
      }
      data.set(chunk.value, size);
      size += chunk.value.length;
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = data.slice(0, size);
  if (!aacDurationMs(bytes.buffer)) throw new QueueAudioError({ ...location, stage: 'audio_format', code: 'aac_invalid' });
  return bytes;
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
  const audios: { audio: AudioSpec; path: string }[] = [];
  for (const { lesson, subjectId, path } of drafts) {
    if (!lesson?.items.some(item => item.audio)) continue;
    if (!context.adaptive?.listening?.max)
      return [{ path: path + '/items', code: 'listening_count', message: 'Hub không cấp câu nghe cho bài này.' }];
    const subject = context.subjects.find(subject => subject.subjectId === subjectId);
    const contentError = (field: string, code: string) => new QueueAudioError({
      path: path + field, code, stage: 'lesson_validation',
    });
    if (!subject || subject.sensitivity !== 'normal') throw contentError('', 'tts_subject_scope');
    for (const [index, item] of lesson.items.entries()) {
      if (!item.audio) continue;
      if (item.audio.lang !== 'de-DE' || !context.tts?.voices[item.audio.lang])
        throw contentError(`/items/${index}/audio/lang`, 'tts_language_scope');
      if (containsContactDetails(item.audio.lines.map(line => line.text).join('\n')))
        throw contentError(`/items/${index}/audio/lines`, 'privacy');
    }
    const validated = validateLessonPackage(lesson, {
      adaptive: true, aiSizes: true, listening: context.adaptive?.listening, frameworkKey: subject.framework?.key,
      minDifficulty: context.adaptive?.difficulty?.min, maxDifficulty: context.adaptive?.difficulty?.max ?? subject.limits.maxDifficulty,
      itemKinds: subject.limits.itemKinds, sensitivity: subject.sensitivity, subjectTitle: subject.title,
    });
    if (!validated.lesson) return validated.issues.map(issue => ({ ...issue, path: path + issue.path }));
    for (const [index, item] of lesson.items.entries()) if (item.audio) audios.push({ audio: item.audio, path: `${path}/items/${index}/audio` });
  }
  for (const variant of ['f', 'm'] as const) {
    const start = Date.now();
    const pending = new Map<string, { audio: AudioSpec; voices: string[]; path: string }>();
    for (const { audio, path } of audios) {
      const pair = context.tts?.voices[audio.lang];
      if (!pair) continue;
      const { hash, voices } = await audioVariant(audio, pair, variant);
      if (!fetched.has(hash)) pending.set(hash, { audio, voices, path });
    }
    if (!pending.size) continue;
    const signal = AbortSignal.timeout(18_000);
    const turns = [...pending].flatMap(([hash, { audio, voices, path }]) =>
      audio.lines.map((line, index) => ({ hash, audio, line, path: `${path}/lines/${index}/text`, voice: voices[line.speaker === 'a' ? 0 : 1] })));
    const clips = new Map<string, Uint8Array[]>();
    for (let offset = 0; offset < turns.length; offset += 4) {
      const group = turns.slice(offset, offset + 4);
      const bytes = await Promise.all(group.map(({ audio, line, voice, path }) =>
        speech(audio, line, voice, apiKey, fetcher, signal, { path, variant })));
      group.forEach(({ hash }, index) => {
        const pieces = clips.get(hash) ?? [];
        pieces.push(bytes[index]);
        clips.set(hash, pieces);
      });
    }
    log({ variant, ms: Date.now() - start, count: pending.size });
    for (const [hash, { audio, path }] of pending) {
      const pieces = clips.get(hash)!;
      const length = pieces.reduce((sum, piece) => sum + piece.length, 0);
      if (length > MAX_AUDIO_BYTES) throw new QueueAudioError({ stage: 'audio_format', code: 'aac_size_limit', path, variant });
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const piece of pieces) { bytes.set(piece, offset); offset += piece.length; }
      if (!aacDurationMs(bytes.buffer)) throw new QueueAudioError({ stage: 'audio_format', code: 'aac_invalid', path, variant });
      const encoded = new TextEncoder().encode(JSON.stringify({ audio, variant }));
      const spec = btoa(String.fromCharCode(...encoded));
      const request = new Request('https://queue.internal/audio', {
        method: 'PUT', body: bytes,
        headers: { 'Content-Type': 'audio/aac', 'X-Audio-Spec': spec },
      });
      try {
        await upload(request, hash);
      } catch (error) {
        const httpStatus = error instanceof ApiError ? error.status : undefined;
        const details = error instanceof AudioStorageError
          ? { stage: error.code === 'audio_asset_write_failed' ? 'asset_metadata' as const : 'r2' as const, code: error.code }
          : httpStatus === 413 || httpStatus === 415
            ? { stage: 'audio_format' as const, code: httpStatus === 413 ? 'upload_size_limit' : 'upload_media_invalid' }
            : { stage: 'audio_upload' as const, code: 'audio_upload_rejected' };
        throw new QueueAudioError({ ...details, path, variant, httpStatus });
      }
      fetched.add(hash);
    }
  }
  return [];
}
