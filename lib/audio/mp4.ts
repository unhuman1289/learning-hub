type Box = { type: string; start: number; end: number };

function boxes(view: DataView, start: number, end: number): Box[] {
  const found: Box[] = [];
  while (start + 8 <= end) {
    const size = view.getUint32(start);
    if (size < 8 || start + size > end) return [];
    const type = String.fromCharCode(...Array.from({ length: 4 }, (_, i) => view.getUint8(start + 4 + i)));
    found.push({ type, start: start + 8, end: start + size });
    start += size;
  }
  return start === end ? found : [];
}

/** Read the movie duration from the bounded, standalone M4A emitted by afconvert. */
export function m4aDurationMs(bytes: ArrayBuffer): number | null {
  const view = new DataView(bytes);
  const top = boxes(view, 0, view.byteLength);
  const ftyp = top[0];
  const movie = top.find(box => box.type === 'moov');
  if (ftyp?.type !== 'ftyp' || ftyp.end - ftyp.start < 8 || !movie ||
      !top.some(box => box.type === 'mdat' && box.end > box.start)) return null;
  const children = (box: Box) => boxes(view, box.start, box.end);
  const tracks = children(movie).filter(box => box.type === 'trak');
  if (tracks.length !== 1) return null;
  const media = children(tracks[0]).find(box => box.type === 'mdia');
  const handler = media && children(media).find(box => box.type === 'hdlr');
  if (!handler || handler.end - handler.start < 12 || view.getUint32(handler.start + 8) !== 0x736f756e) return null; // soun
  const header = children(movie).find(box => box.type === 'mvhd');
  if (!header || header.end - header.start < 20) return null;
  const version = view.getUint8(header.start);
  if (version > 1 || (version === 1 && header.end - header.start < 32)) return null;
  const offset = header.start + (version === 1 ? 20 : 12);
  const scale = view.getUint32(offset);
  const units = version === 1 ? Number(view.getBigUint64(offset + 4)) : view.getUint32(offset + 4);
  const duration = Math.round(units / scale * 1000);
  return Number.isSafeInteger(duration) && duration > 0 ? duration : null;
}
