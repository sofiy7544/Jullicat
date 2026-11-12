import type { ClientMsg, ServerMsg } from '@drag/shared';
import { apiBase, wsUrl } from '../platform';

export class NetError extends Error { constructor(msg: string, public offline = false, public status = 0) { super(msg); } }

let token: string | null = null;
try { token = localStorage.getItem('nd.token'); } catch { /* */ }
export const getToken = () => token;
export function setToken(t: string | null) {
  token = t;
  try { t ? localStorage.setItem('nd.token', t) : localStorage.removeItem('nd.token'); } catch { /* */ }
}

/** HTTP с таймаутом и повтором при сетевых ошибках (плохой интернет). */
export async function http<T = any>(method: string, path: string, body?: unknown, retries = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    try {
      const res = await fetch(apiBase() + path, {
        method,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctl.signal,
      });
      clearTimeout(timer);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new NetError(data.error || `Ошибка ${res.status}`, false, res.status);
      return data as T;
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof NetError) throw e;
      lastErr = e;
      if (i < retries) await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw new NetError('Нет связи с сервером', true);
  void lastErr;
}

type Handler = (m: ServerMsg) => void;

/** WebSocket с автопереподключением и синхронизацией времени. */
export class Socket {
  ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private queue: ClientMsg[] = [];
  private retry = 0;
  private closed = false;
  offset = 0; // serverNow - Date.now()
  rtt = 0;
  connected = false;
  connect() {
    if (!token || this.ws) return;
    this.closed = false;
    const ws = new WebSocket(wsUrl(token));
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true; this.retry = 0;
      for (const m of this.queue.splice(0)) ws.send(JSON.stringify(m));
      this.ping();
    };
    ws.onmessage = (ev) => {
      let m: ServerMsg;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'pong') {
        this.rtt = Date.now() - m.c;
        this.offset = m.now + this.rtt / 2 - Date.now();
      }
      this.handlers.forEach((h) => h(m));
    };
    ws.onclose = () => {
      this.ws = null; this.connected = false;
      this.handlers.forEach((h) => h({ t: 'error', msg: '__disconnected' }));
      if (!this.closed) setTimeout(() => this.connect(), Math.min(10000, 1000 * 2 ** this.retry++));
    };
    ws.onerror = () => ws.close();
  }
  ping() { this.send({ t: 'ping', c: Date.now() }); }
  send(m: ClientMsg) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m));
    else { if (m.t !== 'race.state' && m.t !== 'ping') this.queue.push(m); this.connect(); }
  }
  on(h: Handler) { this.handlers.add(h); return () => this.handlers.delete(h); }
  close() { this.closed = true; this.ws?.close(); this.ws = null; }
  now() { return Date.now() + this.offset; }
}

export const socket = new Socket();
