import { resolveLearner } from '../access.ts';
import { ApiError } from '../api-error.ts';
import type { Db } from '../subjects/service.ts';
import { AUDIO_HASH } from './hash.mjs';

function byteRange(header: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header);
  if (!match || (!match[1] && !match[2]) || !size) return null;
  const suffix = !match[1];
  const start = suffix ? Math.max(0, size - Number(match[2])) : Number(match[1]);
  const end = suffix || !match[2] ? size - 1 : Math.min(size - 1, Number(match[2]));
  return start <= end ? { offset: start, length: end - start + 1 } : null;
}

export async function playAudio(
  db: Db, bucket: Pick<R2Bucket, 'get'>, viewer: Parameters<typeof resolveLearner>[1], req: Request, hash: string,
) {
  const missing = () => new ApiError(404, 'Không tìm thấy âm thanh.');
  if (!AUDIO_HASH.test(hash)) throw missing();
  const target = new URL(req.url);
  if (!target.searchParams.has('learner')) {
    // A bare item URL also works when the viewer opened a child's lesson or is in admin mode.
    const owner = await db.prepare(`SELECT learner_id FROM lesson_items
      WHERE (audio_hash_f=? OR audio_hash_m=?) AND (learner_id=? OR ?=1 OR EXISTS
        (SELECT 1 FROM guardians WHERE guardian_id=? AND learner_id=lesson_items.learner_id))
      ORDER BY (learner_id=?) DESC LIMIT 1`)
      .bind(hash, hash, viewer.id, Number(viewer.role === 'admin'), viewer.id, viewer.id).first<{ learner_id: string }>();
    if (!owner) throw missing();
    target.searchParams.set('learner', owner.learner_id);
  }
  const learner = await resolveLearner(db, viewer, new Request(target), 'read_work');
  if (learner instanceof Response) return learner;
  const asset = await db.prepare(`SELECT bytes, r2_key FROM audio_assets WHERE hash=?
    AND EXISTS (SELECT 1 FROM lesson_items WHERE learner_id=? AND (audio_hash_f=? OR audio_hash_m=?))`)
    .bind(hash, learner, hash, hash).first<{ bytes: number; r2_key: string }>();
  if (!asset) throw missing();
  const etag = '"' + hash + '"';
  const headers = new Headers({
    'Cache-Control': 'private, max-age=31536000, immutable',
    'Content-Type': asset.r2_key.endsWith('.wav') ? 'audio/wav' : 'audio/mp4',
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
    ETag: etag,
    Vary: 'Cookie',
  });
  const noneMatch = req.headers.get('If-None-Match');
  if (noneMatch?.split(',').some(value => ['*', etag, 'W/' + etag].includes(value.trim())))
    return new Response(null, { status: 304, headers });
  const ifRange = req.headers.get('If-Range');
  const requested = !ifRange || ifRange === etag ? req.headers.get('Range') : null;
  const range = requested ? byteRange(requested, asset.bytes) : null;
  if (requested && !range) {
    headers.set('Content-Range', 'bytes */' + asset.bytes);
    headers.set('Cache-Control', 'private, no-store');
    return new Response(null, { status: 416, headers });
  }
  const object = await bucket.get(asset.r2_key, range ? { range } : undefined);
  if (!object) throw missing();
  headers.set('Content-Length', String(range?.length ?? asset.bytes));
  if (range) headers.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${asset.bytes}`);
  return new Response(object.body, { status: range ? 206 : 200, headers });
}
