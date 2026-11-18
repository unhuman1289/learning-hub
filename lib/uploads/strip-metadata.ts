/** Remove private metadata without decoding or re-encoding image pixels. Reject malformed containers. */
export function stripImageMetadata(bytes: Uint8Array, mime: 'image/jpeg' | 'image/png' | 'image/webp'): Uint8Array | null {
  if (mime === 'image/webp') return bytes; // Metadata-bearing WebP is rejected by the caller.
  const parts: Uint8Array[] = [];
  if (mime === 'image/jpeg') {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    parts.push(bytes.subarray(0, 2));
    let i = 2;
    let inScan = false;
    while (i < bytes.length) {
      const start = i;
      if (inScan) {
        while (i < bytes.length) {
          if (bytes[i] !== 0xff) { i++; continue; }
          let next = i + 1;
          while (next < bytes.length && bytes[next] === 0xff) next++;
          if (next >= bytes.length) return null;
          if (bytes[next] === 0x00 || (bytes[next] >= 0xd0 && bytes[next] <= 0xd7)) { i = next + 1; continue; }
          break;
        }
        parts.push(bytes.subarray(start, i));
        inScan = false;
        if (i >= bytes.length) return null;
      }
      const markerStart = i;
      if (bytes[i++] !== 0xff) return null;
      while (i < bytes.length && bytes[i] === 0xff) i++;
      if (i >= bytes.length) return null;
      const marker = bytes[i++];
      if (marker === 0xd9) { parts.push(bytes.subarray(markerStart, i)); return join(parts); }
      if (marker === 0x00 || marker === 0xd8) return null;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { parts.push(bytes.subarray(markerStart, i)); continue; }
      if (i + 2 > bytes.length) return null;
      const length = (bytes[i] << 8) | bytes[i + 1];
      if (length < 2 || i + length > bytes.length) return null;
      i += length;
      if (marker !== 0xe1 && marker !== 0xed && marker !== 0xfe) parts.push(bytes.subarray(markerStart, i));
      if (marker === 0xda) inScan = true;
    }
    return null;
  }
  if (bytes.length < 8) return null;
  parts.push(bytes.subarray(0, 8));
  let i = 8;
  while (i + 12 <= bytes.length) {
    const length = ((bytes[i] * 0x1000000) + (bytes[i + 1] << 16) + (bytes[i + 2] << 8) + bytes[i + 3]);
    const end = i + 12 + length;
    if (end > bytes.length) return null;
    const type = String.fromCharCode(...bytes.subarray(i + 4, i + 8));
    if (!['eXIf', 'tEXt', 'iTXt', 'zTXt'].includes(type)) parts.push(bytes.subarray(i, end));
    i = end;
    if (type === 'IEND') return length === 0 ? join(parts) : null;
  }
  return null;
}

function join(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
