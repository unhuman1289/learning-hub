// OpenAI's AAC response is an ADTS stream. Validate every complete frame and
// derive duration from its sample count without decoding or re-encoding it.
export function aacDurationMs(data: ArrayBuffer): number | null {
  const bytes = new Uint8Array(data);
  const rates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
  let offset = 0, samples = 0, config = -1, rate = 0;
  while (offset < bytes.length) {
    if (offset + 7 > bytes.length || bytes[offset] !== 0xff || (bytes[offset + 1] & 0xf6) !== 0xf0) return null;
    const index = (bytes[offset + 2] >> 2) & 15;
    const channels = ((bytes[offset + 2] & 1) << 2) | (bytes[offset + 3] >> 6);
    const current = (bytes[offset + 2] << 2) | (bytes[offset + 3] >> 6);
    const length = ((bytes[offset + 3] & 3) << 11) | (bytes[offset + 4] << 3) | (bytes[offset + 5] >> 5);
    const header = (bytes[offset + 1] & 1) ? 7 : 9;
    if (!rates[index] || !channels || length <= header || offset + length > bytes.length || (config !== -1 && config !== current)) return null;
    config = current; rate = rates[index];
    samples += 1024 * ((bytes[offset + 6] & 3) + 1);
    offset += length;
  }
  return samples ? Math.round(samples / rate * 1000) : null;
}
