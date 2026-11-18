/**
 * Reads the type and size of an uploaded image from its bytes (never from the file name or the
 * Content-Type header), and reports embedded metadata. JPEG and PNG metadata are removed separately before storage; metadata-bearing WebP is rejected.
 */
export type ImageInfo = { mime: 'image/jpeg' | 'image/png' | 'image/webp'; width: number; height: number; hasMetadata: boolean };

const ascii = (bytes: Uint8Array, start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));
const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);

function jpeg(b: Uint8Array): ImageInfo | null {
  let i = 2;
  let hasMetadata = false;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue; }
    const length = u16be(b, i + 2);
    if (length < 2) return null;
    if (marker === 0xe1 && ascii(b, i + 4, 4) === 'Exif') hasMetadata = true;
    if (marker === 0xe1 && ascii(b, i + 4, 4) === 'http') hasMetadata = true; // XMP
    // SOF0–SOF15 except DHT (C4), JPG (C8), DAC (CC) carry the frame size.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { mime: 'image/jpeg', height: u16be(b, i + 5), width: u16be(b, i + 7), hasMetadata };
    }
    i += 2 + length;
  }
  return null;
}

function png(b: Uint8Array): ImageInfo | null {
  if (ascii(b, 12, 4) !== 'IHDR') return null;
  let hasMetadata = false;
  for (let i = 8; i + 8 <= b.length;) {
    const length = u32be(b, i);
    const type = ascii(b, i + 4, 4);
    if (type === 'eXIf' || type === 'iTXt' || type === 'tEXt' || type === 'zTXt') hasMetadata = true;
    if (type === 'IEND') break;
    i += 12 + length;
  }
  return { mime: 'image/png', width: u32be(b, 16), height: u32be(b, 20), hasMetadata };
}

function webp(b: Uint8Array): ImageInfo | null {
  const chunk = ascii(b, 12, 4);
  let size: { width: number; height: number } | null = null;
  if (chunk === 'VP8 ' && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) size = { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
  else if (chunk === 'VP8L' && b[20] === 0x2f) {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    size = { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  } else if (chunk === 'VP8X') size = { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  if (!size) return null;
  const hasMetadata = chunk === 'VP8X' && (b[20] & 0x0c) !== 0; // EXIF or XMP flag
  return { mime: 'image/webp', ...size, hasMetadata };
}

export function sniffImage(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length < 32) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return jpeg(bytes);
  if (ascii(bytes, 0, 8) === '\x89PNG\r\n\x1a\n') return png(bytes);
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return webp(bytes);
  return null;
}
