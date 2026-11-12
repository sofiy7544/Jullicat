// Слой данных: гостевой режим (всё локально) или аккаунт (сервер — источник истины).
import {
  applyRaceResult, buildSimCar, dispatch, newProfile, prepareRace, resolveRace, touch,
  type InputEvent, type OpponentSpec, type Profile, type RaceContext, type RaceRequest, type RaceRewards, type RunResult,
} from '@drag/shared';
import { http, NetError, setToken, socket, getToken } from './net';

export interface FinishResponse { rewards: RaceRewards | null; player: RunResult; opp: RunResult | null; queued?: boolean; profile: Profile }
export interface StartRequest extends RaceRequest { ghostId?: string }

type Listener = (p: Profile) => void;

abstract class Base {
  profile!: Profile;
  private listeners = new Set<Listener>();
  abstract mode: 'guest' | 'online';
  online = true;
  onChange(l: Listener) { this.listeners.add(l); return () => this.listeners.delete(l); }
  emit() { this.listeners.forEach((l) => l(this.profile)); }
  now() { return Date.now(); }
  abstract op(name: string, args?: unknown): Promise<any>;
  abstract startRace(req: StartRequest): Promise<RaceContext>;
  abstract finishRace(ctx: RaceContext, inputs: InputEvent[], semiAuto: boolean): Promise<FinishResponse>;
}

// ─────────── гость: localStorage ───────────
const GUEST_KEY = 'nd.guest';
export class LocalService extends Base {
  mode = 'guest' as const;
  constructor() {
    super();
    let p: Profile | null = null;
    try { p = JSON.parse(localStorage.getItem(GUEST_KEY) || 'null'); } catch { /* */ }
    this.profile = p ?? newProfile('guest', 'Гость', Date.now());
    touch(this.profile, Date.now());
    this.save();
  }
  save() { try { localStorage.setItem(GUEST_KEY, JSON.stringify(this.profile)); } catch { /* */ } this.emit(); }
  async op(name: string, args?: unknown) {
    const draft: Profile = JSON.parse(JSON.stringify(this.profile));
    const res = dispatch(draft, name, args, Date.now());
    this.profile = draft; this.save();
    return res;
  }
  async startRace(req: StartRequest) {
    const ctx = prepareRace(this.profile, req, Date.now(), (Math.random() * 2 ** 31) | 0, 'local' + Date.now());
    this.save();
    return ctx;
  }
  async finishRace(ctx: RaceContext, inputs: InputEvent[], semiAuto: boolean): Promise<FinishResponse> {
    const car = this.profile.cars.find((c) => c.uid === ctx.carUid)!;
    const { player, opp } = resolveRace(ctx, buildSimCar(car), inputs, semiAuto);
    const rewards = applyRaceResult(this.profile, ctx, player, opp, Date.now());
    this.save();
    return { rewards, player, opp, profile: this.profile };
  }
  reset() { this.profile = newProfile('guest', 'Гость', Date.now()); this.save(); }
}

// ─────────── аккаунт: сервер ───────────
const OUTBOX = 'nd.outbox';
const CACHE = 'nd.profileCache';
interface Pending { ctx: RaceContext; inputs: InputEvent[]; semiAuto: boolean; offline: boolean }

export class RemoteService extends Base {
  mode = 'online' as const;
  userId = '';
  private timeOffset = 0;
  now() { return Date.now() + this.timeOffset; }
  setProfile(p: Profile) {
    this.profile = p;
    try { localStorage.setItem(CACHE, JSON.stringify(p)); } catch { /* */ }
    this.emit();
  }
  async load() {
    try {
      const r = await http<{ profile: Profile; now: number; userId: string }>('GET', '/api/me');
      this.timeOffset = r.now - Date.now();
      this.userId = r.userId;
      this.online = true;
      this.setProfile(r.profile);
      this.flush();
    } catch (e) {
      if (e instanceof NetError && e.offline) {
        const cached = localStorage.getItem(CACHE);
        if (!cached) throw e;
        this.online = false;
        this.profile = JSON.parse(cached);
        this.userId = this.profile.id;
      } else throw e;
    }
  }
  async op(name: string, args?: unknown) {
    if (!this.online) { await this.load().catch(() => {}); if (!this.online) throw new NetError('Нет связи с сервером — покупки и ремонт недоступны офлайн', true); }
    const r = await http<{ result: any; profile: Profile }>('POST', '/api/op', { op: name, args });
    this.setProfile(r.profile);
    return r.result;
  }
  async startRace(req: StartRequest): Promise<RaceContext> {
    try {
      const r = await http<{ ctx: RaceContext; profile: Profile }>('POST', '/api/race/start', req, 1);
      this.online = true;
      this.setProfile(r.profile);
      return r.ctx;
    } catch (e) {
      if (!(e instanceof NetError && e.offline) || req.kind === 'online' || req.kind === 'ghost' || req.kind === 'tournament') throw e;
      // Плохой интернет: гоняем локально, результат отправим позже — сервер всё перепроверит.
      this.online = false;
      const seed = (Math.random() * 2 ** 31) | 0;
      const shadow: Profile = JSON.parse(JSON.stringify(this.profile));
      const ctx = prepareRace(shadow, req, this.now(), seed, 'off' + Date.now());
      (ctx as any).offline = true;
      return ctx;
    }
  }
  async finishRace(ctx: RaceContext, inputs: InputEvent[], semiAuto: boolean): Promise<FinishResponse> {
    const offline = !!(ctx as any).offline;
    try {
      const r = await http<FinishResponse>('POST', offline ? '/api/race/offline' : '/api/race/finish', { raceId: ctx.raceId, ctx: offline ? ctx : undefined, inputs, semiAuto });
      this.online = true;
      this.setProfile(r.profile);
      return r;
    } catch (e) {
      if (!(e instanceof NetError && e.offline)) throw e;
      this.enqueue({ ctx, inputs, semiAuto, offline });
      const car = this.profile.cars.find((c) => c.uid === ctx.carUid)!;
      const { player, opp } = resolveRace(ctx, buildSimCar(car), inputs, semiAuto);
      return { rewards: null, player, opp, queued: true, profile: this.profile };
    }
  }
  private enqueue(p: Pending) {
    const list: Pending[] = JSON.parse(localStorage.getItem(OUTBOX) || '[]');
    list.push(p);
    localStorage.setItem(OUTBOX, JSON.stringify(list.slice(-10)));
  }
  pendingCount() { try { return JSON.parse(localStorage.getItem(OUTBOX) || '[]').length; } catch { return 0; } }
  async flush() {
    const list: Pending[] = JSON.parse(localStorage.getItem(OUTBOX) || '[]');
    if (!list.length) return;
    const rest: Pending[] = [];
    for (const p of list) {
      try {
        const r = await http<FinishResponse>('POST', p.offline ? '/api/race/offline' : '/api/race/finish', { raceId: p.ctx.raceId, ctx: p.offline ? p.ctx : undefined, inputs: p.inputs, semiAuto: p.semiAuto }, 0);
        this.setProfile(r.profile);
      } catch (e) { if (e instanceof NetError && e.offline) rest.push(p); }
    }
    localStorage.setItem(OUTBOX, JSON.stringify(rest));
  }
  logout() { setToken(null); socket.close(); }
}

export type Service = LocalService | RemoteService;
export let svc: Service;
export function setService(s: Service) { svc = s; }

export async function login(nick: string, password: string, register: boolean) {
  const r = await http<{ token: string }>('POST', register ? '/api/auth/register' : '/api/auth/login', { nick, password }, 0);
  setToken(r.token);
}

export async function restoreSession(): Promise<RemoteService | null> {
  if (!getToken()) return null;
  const s = new RemoteService();
  try { await s.load(); return s; } catch (e) { if (e instanceof NetError && e.status === 401) setToken(null); return null; }
}

export type { OpponentSpec };
