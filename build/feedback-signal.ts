/** A transient signal only: grades and learner data stay in D1, never in the stream. */
export class FeedbackSignal {
  private listeners = new Map<ReadableStreamDefaultController<Uint8Array>, ReturnType<typeof setTimeout>>();
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'POST') {
      const event = new TextEncoder().encode('event: saved\ndata: {}\n\n');
      for (const [listener, timer] of this.listeners) {
        clearTimeout(timer);
        try { listener.enqueue(event); listener.close(); } catch { /* disconnected */ }
      }
      this.listeners.clear();
      return new Response(null, { status: 204 });
    }
    if (request.method !== 'GET') return new Response(null, { status: 405 });
    let controller: ReadableStreamDefaultController<Uint8Array>;
    let timer: ReturnType<typeof setTimeout>;
    const listeners = this.listeners;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
        c.enqueue(new TextEncoder().encode(': connected\n\n'));
        timer = setTimeout(() => { if (listeners.delete(c)) { try { c.close(); } catch {} } }, 55_000);
        listeners.set(c, timer);
      },
      cancel() { clearTimeout(timer); listeners.delete(controller); },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Accel-Buffering': 'no' } });
  }
}
