import { DurableObject } from 'cloudflare:workers';
import { tutorContext } from '../lib/tutor/context';
import { tutorAnswer, TUTOR_ANSWER_LIMIT } from '../lib/contracts/tutor';

type Session = { learners?: string[] };
type Turn = { socket: WebSocket; answer: string; firstMs?: number; started: number; timer: ReturnType<typeof setTimeout>; controller?: ReadableStreamDefaultController<Uint8Array> };
const encoder = new TextEncoder();
const event = (name: string, data: object) => encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);

/** Single staging relay: D1 is authoritative; live streams remain in memory only. */
export class TutorRelay extends DurableObject<Cloudflare.Env> {
  private turns = new Map<string, Turn>();
  private operations: Promise<void> = Promise.resolve();
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.operations.then(fn);
    this.operations = result.then(() => {}, error => console.error('Tutor relay error', error));
    return result;
  }
  private get db() { if (!this.env.DB) throw new Error('D1 unavailable'); return this.env.DB; }
  private sockets() { return this.ctx.getWebSockets('runner').filter(socket => socket.readyState === WebSocket.OPEN); }
  private allowed(socket: WebSocket, learnerId: string) {
    const session = socket.deserializeAttachment() as Session | null;
    return !!session && (!session.learners || session.learners.includes(learnerId));
  }
  private emit(turn: Turn, name: string, data: object) {
    try { turn.controller?.enqueue(event(name, data)); } catch { turn.controller = undefined; }
  }
  private finish(id: string, turn: Turn) {
    clearTimeout(turn.timer); this.turns.delete(id);
    try { turn.controller?.close(); } catch { /* The reader may have disconnected. */ }
  }
  private async requeue(id: string, turn: Turn, message: string) {
    const result = await this.db.prepare("UPDATE tutor_turns SET status='queued',answer=NULL,first_token_ms=NULL WHERE id=? AND status='streaming'").bind(id).run();
    if (result.meta.changes) this.emit(turn, 'queued', { id, status:'queued', message });
    this.finish(id, turn);
  }
  private async dispatch(id: string, socket: WebSocket, controller?: ReadableStreamDefaultController<Uint8Array>) {
    if (this.turns.has(id)) return false;
    const data = await tutorContext(this.db, id);
    if (!data || !this.allowed(socket, data.learnerId) || socket.readyState !== WebSocket.OPEN) return false;
    const changed = await this.db.prepare("UPDATE tutor_turns SET status='streaming' WHERE id=? AND status='queued'").bind(id).run();
    if (!changed.meta.changes) return false;
    const turn: Turn = { socket, answer:'', started:Date.now(), controller, timer:setTimeout(() => {
      void this.serial(async () => { if (this.turns.get(id) === turn && turn.firstMs === undefined) await this.requeue(id, turn, 'Gia sư đang bận'); });
    }, 10000) };
    this.turns.set(id, turn);
    this.emit(turn, 'turn', { id, status:'streaming' });
    try { socket.send(JSON.stringify({type:'ask', turnId:id, context:data.context})); }
    catch { await this.requeue(id, turn, 'Gia sư đang nghỉ, câu hỏi sẽ được trả lời khi máy bật'); return true; }
    return true;
  }
  private async recover(socket: WebSocket) {
    const {results} = await this.db.prepare("SELECT id FROM tutor_turns WHERE status='queued' ORDER BY created_at,rowid").all<{id:string}>();
    for (const row of results) if (socket.readyState === WebSocket.OPEN) await this.dispatch(row.id, socket);
  }
  async fetch(request: Request) {
    const path = new URL(request.url).pathname;
    if (path === '/connect' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const session = JSON.parse(request.headers.get('X-Tutor-Session') ?? '{}') as Session;
      // A replacement runner fences the old connection and recovers its unfinished turns.
      await this.serial(async () => {
        for (const socket of this.sockets()) socket.close(1000, 'Runner replaced');
        for (const [id, turn] of this.turns) await this.requeue(id, turn, 'Gia sư đang nghỉ, câu hỏi sẽ được trả lời khi máy bật');
        await this.db.prepare("UPDATE tutor_turns SET status='queued',answer=NULL,first_token_ms=NULL WHERE status='streaming'").run();
      });
      const pair = new WebSocketPair();
      pair[1].serializeAttachment(session);
      this.ctx.acceptWebSocket(pair[1], ['runner']);
      this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
      this.ctx.waitUntil(this.serial(() => this.recover(pair[1])));
      return new Response(null, { status:101, webSocket:pair[0] });
    }
    if (path === '/submit' && request.method === 'POST') {
      const {id} = await request.json() as {id:string};
      return this.serial(async () => {
        const active = this.turns.get(id);
        if (active && !active.controller) {
          const stream = new ReadableStream<Uint8Array>({ start: controller => {
            active.controller = controller;
            this.emit(active, 'turn', {id, status:'streaming'});
            if (active.answer) this.emit(active, 'delta', {text:active.answer});
          }});
          return new Response(stream, {headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store'}});
        }
        const row = await this.db.prepare("SELECT learner_id,status,answer FROM tutor_turns WHERE id=?").bind(id).first<{learner_id:string;status:string;answer:string|null}>();
        if (row?.status === 'answered' && row.answer) {
          const body = [event('turn', {id,status:'streaming'}), event('delta', {text:row.answer}), event('done', {id,status:'answered'})];
          return new Response(new ReadableStream({start(controller) { for (const part of body) controller.enqueue(part); controller.close(); }}), {headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store'}});
        }
        const socket = row?.status === 'queued' && this.sockets().find(s => this.allowed(s, row.learner_id));
        if (!socket) return Response.json({id, status:'queued', message:'Gia sư đang nghỉ, câu hỏi sẽ được trả lời khi máy bật'}, {status:202});
        const stream = new ReadableStream<Uint8Array>({
          start: controller => { void this.serial(async () => {
            try {
              if (!await this.dispatch(id, socket, controller)) { controller.enqueue(event('queued', {id, status:'queued', message:'Gia sư đang bận'})); controller.close(); }
            } catch {
              controller.enqueue(event('error', {message:'Chưa xác nhận được câu hỏi. Mở lại để xem trạng thái.'})); controller.close();
            }
          }); },
        });
        return new Response(stream, {headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store'}});
      });
    }
    return new Response(null, {status:404});
  }
  webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > 16384) return;
    return this.serial(async () => {
      let msg: {type?:string;turnId?:string;text?:string};
      try { msg = JSON.parse(raw); } catch { return; }
      const id = msg.turnId ?? '', turn = this.turns.get(id);
      if (!turn || turn.socket !== socket) return;
      if (msg.type === 'delta' && typeof msg.text === 'string' && msg.text.length && !msg.text.includes('\0')) {
        const next = turn.answer + msg.text;
        if ([...next].length > TUTOR_ANSWER_LIMIT) {
          await this.db.prepare("UPDATE tutor_turns SET status='failed' WHERE id=? AND status='streaming'").bind(id).run();
          this.emit(turn, 'error', {message:'Chưa trả lời được câu hỏi.'}); this.finish(id, turn); return;
        }
        if (turn.firstMs === undefined) {
          turn.firstMs = Math.max(0, Date.now() - turn.started); clearTimeout(turn.timer);
          turn.timer = setTimeout(() => { void this.serial(async () => { if (this.turns.get(id) === turn) await this.requeue(id, turn, 'Gia sư đang bận'); }); }, 60000);
        }
        turn.answer = next;
        this.emit(turn, 'delta', {text:msg.text});
      } else if (msg.type === 'done') {
        const parsed = tutorAnswer.safeParse(turn.answer);
        if (!parsed.success) {
          await this.db.prepare("UPDATE tutor_turns SET status='failed' WHERE id=? AND status='streaming'").bind(id).run();
          this.emit(turn, 'error', {message:'Chưa trả lời được câu hỏi.'});
        } else {
          const saved = await this.db.prepare("UPDATE tutor_turns SET status='answered',answer=?,first_token_ms=?,answered_at=? WHERE id=? AND status='streaming'")
            .bind(parsed.data, turn.firstMs ?? 0, new Date().toISOString(), id).run();
          if (saved.meta.changes) this.emit(turn, 'done', {id,status:'answered'});
          else this.emit(turn, 'error', {message:'Chưa xác nhận được câu trả lời.'});
        }
        this.finish(id, turn);
      } else if (msg.type === 'error') {
        await this.requeue(id, turn, 'Gia sư đang bận');
      }
    });
  }
  webSocketClose(socket: WebSocket) { return this.disconnect(socket); }
  webSocketError(socket: WebSocket) { return this.disconnect(socket); }
  private disconnect(socket: WebSocket) {
    return this.serial(async () => { for (const [id,turn] of this.turns) if (turn.socket === socket) await this.requeue(id, turn, 'Gia sư đang nghỉ, câu hỏi sẽ được trả lời khi máy bật'); });
  }
}
