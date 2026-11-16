const rate = 24_000;
const bytesPerSecond = rate * 2;
const headerSize = 44;
export const MAX_AUDIO_BYTES = 1024 * 1024;

/** The Queue uses mono signed 16-bit little-endian PCM at 24 kHz. */
export function pcmWav(turns: Uint8Array[]): ArrayBuffer {
  const pause = bytesPerSecond * 0.4;
  const length = turns.reduce((total, turn) => total + turn.length, 0) + pause * (turns.length - 1);
  if (!turns.length || turns.some(turn => !turn.length || turn.length % 2) || length + headerSize > MAX_AUDIO_BYTES)
    throw Error('OpenAI speech returned invalid or oversized PCM.');
  const bytes = new Uint8Array(length + headerSize);
  bytes.set(wavHeader(length));
  let offset = headerSize;
  for (const turn of turns) {
    bytes.set(turn, offset);
    offset += turn.length + pause;
  }
  return bytes.buffer;
}

function wavHeader(length: number) {
  const bytes = new Uint8Array(headerSize);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, text: string) => bytes.set(new TextEncoder().encode(text), offset);
  write(0, 'RIFF'); view.setUint32(4, length + headerSize - 8, true);
  write(8, 'WAVEfmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, bytesPerSecond, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, 'data'); view.setUint32(40, length, true);
  return bytes;
}

export function wavDurationMs(data: ArrayBuffer) {
  if (data.byteLength <= headerSize || (data.byteLength - headerSize) % 2) return null;
  const expected = wavHeader(data.byteLength - headerSize);
  const header = new Uint8Array(data, 0, headerSize);
  if (!expected.every((value, index) => value === header[index])) return null;
  return Math.round((data.byteLength - headerSize) / bytesPerSecond * 1000) || null;
}
