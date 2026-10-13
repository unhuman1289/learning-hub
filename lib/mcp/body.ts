/** Bound public request bodies before materializing them in Worker memory. */
export async function readBoundedText(request: Pick<Request, 'headers' | 'body'>, limit: number): Promise<string | null> {
  if (Number(request.headers.get('Content-Length') ?? 0) > limit) return null;
  if (!request.body) return '';
  const reader = request.body.getReader(), decoder = new TextDecoder();
  let bytes = 0, text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) { await reader.cancel(); return null; }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}
