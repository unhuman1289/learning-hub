/** A frame blocks only when a Hub bundle script runs during the measured turn. */
export function hubLongFrame(frame, start, end, origin) {
  if (frame.duration <= 50 || frame.startTime >= end || frame.startTime + frame.duration <= start) return false;
  return frame.scripts.some(script => {
    if (script.startTime >= end || script.startTime + script.duration <= start) return false;
    try {
      const url = new URL(script.sourceURL);
      return url.origin === origin && url.pathname.startsWith('/_next/static/');
    } catch { return false; }
  });
}
