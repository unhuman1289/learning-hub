import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { stripImageMetadata } from '../lib/uploads/strip-metadata.ts';
import assert from 'node:assert/strict';
import { memoryDb } from './d1-adapter.mjs';
import { sniffImage } from '../lib/uploads/image.ts';
import { createAttachment, readAttachment } from '../lib/uploads/service.ts';

const bytes = (...parts) => new Uint8Array(parts.flatMap((part) => (typeof part === 'string' ? [...part].map((c) => c.charCodeAt(0)) : part)));
const u16 = (n) => [n >> 8, n & 255];
const u32 = (n) => [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
const pad = (n) => new Array(n).fill(0);

function jpeg(width, height, { exif = false } = {}) {
  const app0 = [0xff, 0xe0, ...u16(16), ...bytes('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const app1 = exif ? [0xff, 0xe1, ...u16(14), ...bytes('Exif\0\0'), ...pad(6)] : [];
  const sof0 = [0xff, 0xc0, ...u16(17), 8, ...u16(height), ...u16(width), 3, ...pad(9)];
  return new Uint8Array([0xff, 0xd8, ...app0, ...app1, ...sof0, 0xff, 0xd9, ...pad(16)]);
}
function png(width, height, { text = false } = {}) {
  const chunk = (type, data) => [...u32(data.length), ...bytes(type), ...data, ...pad(4)];
  return new Uint8Array([...bytes('\x89PNG\r\n\x1a\n'), ...chunk('IHDR', [...u32(width), ...u32(height), 8, 6, 0, 0, 0]), ...(text ? chunk('tEXt', [...bytes('GPS\0x')]) : []), ...chunk('IEND', [])]);
}
function webpX(width, height, flags) {
  const w = width - 1, h = height - 1;
  return new Uint8Array([...bytes('RIFF'), ...pad(4), ...bytes('WEBPVP8X'), 10, 0, 0, 0, flags, 0, 0, 0, w & 255, (w >> 8) & 255, w >> 16, h & 255, (h >> 8) & 255, h >> 16, ...pad(8)]);
}

test('image type and size come from the bytes; metadata is detected', () => {
  assert.deepEqual(sniffImage(jpeg(1600, 1200)), { mime: 'image/jpeg', width: 1600, height: 1200, hasMetadata: false });
  assert.equal(sniffImage(jpeg(1600, 1200, { exif: true })).hasMetadata, true);
  assert.deepEqual(sniffImage(png(800, 600)), { mime: 'image/png', width: 800, height: 600, hasMetadata: false });
  assert.equal(sniffImage(png(800, 600, { text: true })).hasMetadata, true);
  assert.deepEqual(sniffImage(webpX(640, 480, 0x10)), { mime: 'image/webp', width: 640, height: 480, hasMetadata: false });
  assert.equal(sniffImage(webpX(640, 480, 0x08)).hasMetadata, true);
  for (const fake of [bytes('<svg xmlns="http://www.w3.org/2000/svg"></svg>', pad(20)), bytes('%PDF-1.7', pad(40)), bytes('GIF89a', pad(40)), new Uint8Array(10)]) assert.equal(sniffImage(fake), null);
});

function fakeBucket() {
  const objects = new Map();
  return {
    objects,
    async put(key, value, options) { objects.set(key, { value, options }); },
    async get(key) { const o = objects.get(key); return o ? { body: o.value } : null; },
  };
}
const status = async (promise) => { try { await promise; } catch (error) { return error.status; } return 200; };

test('uploads: stored under the learner, private, refused when fake, too big, WebP has metadata, or too many', async () => {
  const db = memoryDb();
  const bucket = fakeBucket();
  const now = new Date('2026-10-13T10:00:00Z');
  const saved = await createAttachment(db, bucket, 'ech', jpeg(2000, 1500), now);
  assert.match(saved.id, /^img_[0-9a-f]{20}$/);
  assert.equal(saved.expiresAt, '2026-11-12T10:00:00.000Z');
  assert.ok(bucket.objects.has(`uploads/ech/${saved.id}`));
  assert.equal(bucket.objects.get(`uploads/ech/${saved.id}`).options.httpMetadata.contentType, 'image/jpeg');

  assert.equal(await status(createAttachment(db, bucket, 'ech', bytes('<html>', pad(40)), now)), 400);
  assert.equal(await status(createAttachment(db, bucket, 'ech', jpeg(3000, 1000), now)), 400);
  assert.equal(await status(createAttachment(db, bucket, 'ech', webpX(100, 100, 0x08), now)), 400);
  assert.equal(await status(createAttachment(db, bucket, 'ech', new Uint8Array(3_000_001), now)), 413);
  for (let i = 1; i < 20; i += 1) await createAttachment(db, bucket, 'ech', png(100, 100), now);
  assert.equal(await status(createAttachment(db, bucket, 'ech', png(100, 100), now)), 429);
  assert.equal(await status(createAttachment(db, bucket, 'ech', png(100, 100), new Date(now.getTime() + 11 * 60_000))), 200, 'the window slides');

  assert.ok((await readAttachment(db, bucket, 'ech', saved.id, now)).body);
  assert.equal(await status(readAttachment(db, bucket, 'vu', saved.id, now)), 404, 'another learner gets 404');
  assert.equal(await status(readAttachment(db, bucket, 'ech', saved.id, new Date('2026-11-12T10:00:01Z'))), 410, 'gone after 30 days');
  db.sqlite.close();
});


test('removes JPEG GPS metadata before storage and hashes the saved bytes', async () => {
  const db = memoryDb(), bucket = fakeBucket();
  const original = jpeg(400, 300);
  const payload = bytes('Exif\0\0', [0x49, 0x49, 42, 0, 8, 0, 0, 0, 1, 0, 0x25, 0x88, 4, 0, 1, 0, 0, 0, 26, 0, 0, 0], 'GPS-FAKE');
  const segment = bytes([0xff, 0xe1], u16(payload.length + 2), [...payload]);
  const input = bytes([...original.slice(0, 2)], [...segment], [...original.slice(2)]);
  const saved = await createAttachment(db, bucket, 'ech', input);
  const stored = bucket.objects.get(`uploads/ech/${saved.id}`).value;
  assert.equal(Buffer.from(stored).includes(Buffer.from('Exif')), false);
  assert.equal(Buffer.from(stored).includes(Buffer.from('GPS-FAKE')), false);
  assert.equal(saved.bytes, stored.length);
  const row = db.sqlite.prepare('SELECT bytes, sha256 FROM attachments WHERE id = ?').get(saved.id);
  assert.equal(row.bytes, stored.length);
  assert.equal(row.sha256, createHash('sha256').update(stored).digest('hex'));
  db.sqlite.close();
});

test('strips all requested segments and rejects truncated containers', () => {
  const source = jpeg(100, 100);
  const segments = bytes([0xff, 0xed, 0, 7], 'GPS13', [0xff, 0xfe, 0, 6], 'GPS!');
  const clean = stripImageMetadata(bytes([...source.slice(0, 2)], [...segments], [...source.slice(2)]), 'image/jpeg');
  assert.equal(Buffer.from(clean).includes(Buffer.from('GPS')), false);
  const pngClean = stripImageMetadata(png(100, 100, { text: true }), 'image/png');
  assert.equal(Buffer.from(pngClean).includes(Buffer.from('GPS')), false);
  assert.equal(stripImageMetadata(bytes([...source.slice(0, 2)], [0xff, 0xe1, 0xff, 0xff]), 'image/jpeg'), null);
  assert.equal(stripImageMetadata(png(100, 100).slice(0, -2), 'image/png'), null);
});
