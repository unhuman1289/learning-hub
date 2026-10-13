import { ApiError } from '../api-error.ts';
import type { Db } from '../subjects/service.ts';
import { sniffImage } from './image.ts';

export const MAX_UPLOAD_BYTES = 3_000_000;
export const MAX_EDGE = 2400;
export const KEEP_DAYS = 30;
const RATE_WINDOW_MS = 10 * 60_000;
const RATE_LIMIT = 20;

type Bucket = Pick<R2Bucket, 'put' | 'get'>;

export function newAttachmentId() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return 'img_' + Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Stores a learner's photo after checking its real type, size and metadata. Returns the attachment id. */
export async function createAttachment(db: Db, bucket: Bucket, learnerId: string, bytes: Uint8Array, now = new Date()) {
  if (bytes.length === 0 || bytes.length > MAX_UPLOAD_BYTES) throw new ApiError(413, 'Ảnh cần nhỏ hơn 3 MB.');
  const info = sniffImage(bytes);
  if (!info) throw new ApiError(400, 'Chỉ nhận ảnh JPEG, PNG hoặc WebP.');
  if (info.width > MAX_EDGE || info.height > MAX_EDGE || info.width < 1 || info.height < 1) throw new ApiError(400, `Cạnh dài của ảnh tối đa ${MAX_EDGE} px.`);
  if (info.hasMetadata) throw new ApiError(400, 'Ảnh còn thông tin máy chụp (EXIF). Hãy chụp hoặc chọn ảnh bằng nút trong bài.');

  const since = new Date(now.getTime() - RATE_WINDOW_MS).toISOString();
  const recent = await db.prepare('SELECT COUNT(*) AS n FROM attachments WHERE learner_id = ? AND created_at > ?').bind(learnerId, since).first<{ n: number }>();
  if (Number(recent?.n ?? 0) >= RATE_LIMIT) throw new ApiError(429, 'Đã tải nhiều ảnh trong 10 phút qua. Thử lại sau ít phút.');

  const id = newAttachmentId();
  const key = `uploads/${learnerId}/${id}`;
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const expires = new Date(now.getTime() + KEEP_DAYS * 86_400_000).toISOString();
  await bucket.put(key, bytes, { httpMetadata: { contentType: info.mime }, customMetadata: { learnerId } });
  await db.prepare(`INSERT INTO attachments (id, learner_id, r2_key, mime, bytes, width, height, sha256, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, learnerId, key, info.mime, bytes.length, info.width, info.height, sha256, now.toISOString(), expires).run();
  return { id, mime: info.mime, width: info.width, height: info.height, bytes: bytes.length, expiresAt: expires };
}

/** A learner's photo; 410 once it has passed its 30 days. */
export async function readAttachment(db: Db, bucket: Bucket, learnerId: string, id: string, now = new Date()) {
  const row = await db.prepare('SELECT r2_key, mime, expires_at, deleted_at FROM attachments WHERE id = ? AND learner_id = ?')
    .bind(id, learnerId).first<{ r2_key: string; mime: string; expires_at: string; deleted_at: string | null }>();
  if (!row) throw new ApiError(404, 'Không tìm thấy ảnh.');
  if (row.deleted_at || row.expires_at <= now.toISOString()) throw new ApiError(410, 'Ảnh đã quá 30 ngày và được xoá.');
  const object = await bucket.get(row.r2_key);
  if (!object) throw new ApiError(410, 'Ảnh không còn trong kho.');
  return { body: object.body, mime: row.mime };
}
