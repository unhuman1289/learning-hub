import { z } from 'zod/v4';
import { ApiError } from '../api-error.ts';
import { audioSpec } from '../contracts/lesson-package-v3.ts';
import type { PlanContext } from '../contracts/ai-common.ts';
import type { Job } from '../ai-jobs/context/common.ts';
import type { EvidenceDb } from '../evidence/submit.ts';
import { containsContactDetails, containsPossibleClinicalIdentifier } from '../automation/privacy.ts';
import { AUDIO_HASH, audioVariant } from './hash.mjs';
import { m4aDurationMs } from './mp4.ts';

export const MAX_AUDIO_BYTES = 1024 * 1024;
const metadata = z.object({ audio: audioSpec, variant: z.enum(['f', 'm']) }).strict();

function readMetadata(req: Request) {
  const header = req.headers.get('X-Audio-Spec') ?? '';
  if (!/^[A-Za-z0-9+/=]{1,8192}$/.test(header)) throw new ApiError(400, 'Thiếu thông tin tạo âm thanh.');
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(header), c => c.charCodeAt(0)));
    return metadata.parse(JSON.parse(decoded));
  } catch {
    throw new ApiError(400, 'Thông tin tạo âm thanh không hợp lệ.');
  }
}

async function readAudio(req: Request) {
  if (Number(req.headers.get('Content-Length')) > MAX_AUDIO_BYTES) throw new ApiError(413, 'Âm thanh vượt 1 MB.');
  if (!req.body) throw new ApiError(400, 'Thiếu tệp âm thanh.');
  const reader = req.body.getReader();
  const buffer = new Uint8Array(MAX_AUDIO_BYTES);
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (size + chunk.value.byteLength > MAX_AUDIO_BYTES) {
        await reader.cancel();
        throw new ApiError(413, 'Âm thanh vượt 1 MB.');
      }
      buffer.set(chunk.value, size);
      size += chunk.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  return buffer.buffer.slice(0, size);
}

export async function uploadAudio(
  db: EvidenceDb, bucket: Pick<R2Bucket, 'put' | 'head'>, req: Request, job: Job, hash: string,
  recheckLease: () => Promise<unknown>, now = new Date(),
) {
  if (job.kind !== 'plan' || !AUDIO_HASH.test(hash)) throw new ApiError(404, 'Không tìm thấy âm thanh.');
  if (req.headers.get('Content-Type')?.toLowerCase() !== 'audio/mp4') throw new ApiError(415, 'Cần tệp audio/mp4.');
  const { audio, variant } = readMetadata(req);
  const context = JSON.parse(job.context_snapshot!) as PlanContext;
  const pair = context.tts?.voices[audio.lang];
  if (!pair || !context.tts?.languages.includes(audio.lang)) throw new ApiError(409, 'Lease chưa có giọng đọc cho ngôn ngữ này.');
  const dialogue = audio.lines.map(line => line.text).join('\n');
  if (containsContactDetails(dialogue) || context.subjects.some(subject => containsPossibleClinicalIdentifier(dialogue, subject.sensitivity)))
    throw new ApiError(400, 'Lời thoại có thể chứa định danh.');
  const expected = await audioVariant(audio, pair, variant);
  if (expected.hash !== hash) throw new ApiError(400, 'Mã âm thanh không khớp lời thoại và giọng.');
  const bytes = await readAudio(req);
  const durationMs = m4aDurationMs(bytes);
  if (!durationMs) throw new ApiError(415, 'Tệp M4A không hợp lệ.');
  await recheckLease();
  const key = 'audio/' + hash + '.m4a';
  // R2's precondition also covers concurrent uploads from separate leases.
  const created = await bucket.put(key, bytes, {
    onlyIf: { etagDoesNotMatch: '*' },
    httpMetadata: { contentType: 'audio/mp4' },
    customMetadata: { durationMs: String(durationMs) },
  });
  const object = created ?? await bucket.head(key);
  const storedDuration = Number(object?.customMetadata?.durationMs);
  if (!object || !Number.isSafeInteger(storedDuration) || storedDuration <= 0)
    throw new ApiError(503, 'Chưa xác nhận tệp âm thanh.');
  await db.prepare(`INSERT INTO audio_assets(hash,lang,rate,voices,duration_ms,bytes,r2_key,created_job_id,created_at)
    VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(hash) DO UPDATE SET duration_ms=excluded.duration_ms,bytes=excluded.bytes
    WHERE audio_assets.duration_ms<>excluded.duration_ms OR audio_assets.bytes<>excluded.bytes`)
    .bind(hash, audio.lang, audio.rate, JSON.stringify(expected.voices), storedDuration, object.size, key, job.id, now.toISOString()).run();
  return { hash, durationMs: storedDuration };
}
