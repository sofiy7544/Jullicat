// Реальное время: лобби со ставками, чат, подбор по силе машины, вызовы друзей, синхронизация заезда.
import { randomBytes, randomInt } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import {
  DISTANCES, GameError, TRACK_MAP, applyRaceResult, buildSimCar, getCar, performanceIndex, prepareRace,
  type ChatMsg, type ClientMsg, type InputEvent, type LobbyEntry, type MatchInfo, type Profile, type RaceContext, type RunResult, type ServerMsg,
} from '@drag/shared';
import { db, friendIds, mutate, parseProfile } from './db';
import { userFromToken } from './auth';
import { afterRace, newRaceId } from './routes/game';

interface Client { ws: WebSocket; userId: string; nick: string; level: number; lobby: boolean; lastChat: number }
const clients = new Set<Client>();
const byUser = new Map<string, Set<Client>>();
const lobby = new Map<string, LobbyEntry>();
const chat: ChatMsg[] = [];
const quick = new Map<string, { userId: string; distance: number; pi: number; since: number }>();
const invites = new Map<string, { from: string; to: string; distance: number; trackId: string; bet: number; at: number }>();

export const isOnline = (id: string) => (byUser.get(id)?.size ?? 0) > 0;
function sendTo(userId: string, m: ServerMsg) { byUser.get(userId)?.forEach((c) => c.ws.readyState === 1 && c.ws.send(JSON.stringify(m))); }
function send(c: Client, m: ServerMsg) { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(m)); }
function broadcastLobby() {
  const entries = [...lobby.values()];
  const m: ServerMsg = { t: 'lobby.list', entries, online: byUser.size };
  clients.forEach((c) => c.lobby && send(c, m));
}

// ───────── матчи ─────────
interface Side { userId: string; raceId: string; ctx: RaceContext; result?: RunResult; inputs?: InputEvent[]; semiAuto?: boolean; left?: boolean }
interface Match { id: string; a: Side; b: Side; bet: number; timer: NodeJS.Timeout; done: boolean }
const matchMap = new Map<string, Match>();
const raceToMatch = new Map<string, string>();

async function startMatch(aId: string, bId: string, distance: number, trackId: string, bet: number): Promise<string | null> {
  if (aId === bId) return 'Нельзя гоняться с собой';
  const seed = randomInt(1, 2 ** 31 - 1);
  const matchId = 'm' + randomBytes(6).toString('hex');
  const [ua, ub] = await Promise.all([db.user.findUniqueOrThrow({ where: { id: aId } }), db.user.findUniqueOrThrow({ where: { id: bId } })]);
  const pa = parseProfile(ua), pb = parseProfile(ub);
  const carA = getCar(pa, pa.currentCar), carB = getCar(pb, pb.currentCar);
  const simA = buildSimCar(carA), simB = buildSimCar(carB);
  const now = Date.now();
  const sides: Side[] = [];
  // проверяем и списываем у обоих (топливо + ставка в банк)
  const charged: string[] = [];
  try {
    for (const [uid, other, oCar, oSim] of [[aId, ub, carB, simB], [bId, ua, carA, simA]] as const) {
      const raceId = newRaceId();
      const r = await mutate(uid, (p: Profile) => {
        if (p.money < bet) throw new GameError(`${p.nick}: не хватает денег на ставку`);
        const ctx = prepareRace(p, { kind: 'online', trackId, distance: distance as any }, now, seed, raceId,
          { type: 'remote', userId: other.id, name: other.nick, carId: oCar.carId, simCar: oSim, visual: oCar.visual });
        ctx.bet = bet;
        p.money -= bet;
        return ctx;
      });
      charged.push(uid);
      await db.race.create({ data: { id: raceId, userId: uid, kind: 'online', ctx: JSON.stringify(r.result) } });
      sides.push({ userId: uid, raceId, ctx: r.result });
    }
  } catch (e) {
    for (const uid of charged) await mutate(uid, (p) => { p.money += bet; p.fuel += 1; });
    return e instanceof Error ? e.message : 'Ошибка';
  }
  const startAt = Date.now() + 6500;
  const m: Match = { id: matchId, a: sides[0], b: sides[1], bet, done: false, timer: setTimeout(() => resolveMatch(matchId), 6500 + 75_000) };
  matchMap.set(matchId, m);
  for (const s of sides) raceToMatch.set(s.raceId, matchId);
  const info = (me: Side, op: Profile, opCar: typeof carA, opSim: typeof simA): MatchInfo => ({
    matchId, raceId: me.raceId, seed, trackId, distance: distance as any, bet, startAt,
    opponent: { userId: op.id, nick: op.nick, level: op.level, carId: opCar.carId, simCar: opSim, visual: opCar.visual, pi: performanceIndex(opSim) },
  });
  sendTo(aId, { t: 'match', m: info(sides[0], pb, carB, simB) });
  sendTo(bId, { t: 'match', m: info(sides[1], pa, carA, simA) });
  sendTo(aId, { t: 'profile.dirty' }); sendTo(bId, { t: 'profile.dirty' });
  return null;
}

const valid = (r?: RunResult) => !!r && !r.falseStart && !r.dnf && r.time > 0;

async function resolveMatch(matchId: string) {
  const m = matchMap.get(matchId);
  if (!m || m.done) return;
  m.done = true;
  clearTimeout(m.timer);
  const { a, b } = m;
  let winner: Side | null = null, reason = '';
  if (valid(a.result) && valid(b.result)) winner = a.result!.time <= b.result!.time ? a : b;
  else if (valid(a.result) && !b.left) { winner = a; reason = 'Соперник не финишировал'; }
  else if (valid(b.result) && !a.left) { winner = b; reason = 'Соперник не финишировал'; }
  else if (valid(a.result)) { winner = a; reason = 'Соперник покинул заезд'; }
  else if (valid(b.result)) { winner = b; reason = 'Соперник покинул заезд'; }
  const pot = Math.floor(m.bet * 2 * 0.95);
  for (const s of [a, b]) {
    const other = s === a ? b : a;
    const win = winner === s;
    const me = s.result ?? ({ time: 0, finishV: 0, reaction: 0, falseStart: false, dnf: true, shifts: 0, perfectShifts: 0, earlyShifts: 0, lateShifts: 0, grinds: 0, launch: 'none', nitroUsed: false, wear: {} as any, topSpeed: 0, ticks: 0 } as RunResult);
    const r = await mutate(s.userId, (p) => {
      const rw = applyRaceResult(p, s.ctx, me, other.result ?? null, Date.now(), win);
      if (!winner) p.money += m.bet; // ничья/оба не доехали — возврат ставки
      else if (win) p.money += pot;
      return rw;
    });
    if (s.result && s.inputs) await afterRace(s.userId, r.profile, s.ctx, s.result, r.result, s.inputs, !!s.semiAuto).catch(() => {});
    sendTo(s.userId, { t: 'race.result', matchId, win, you: s.result?.time ?? 0, them: other.result?.time ?? 0, payout: win ? pot : !winner ? m.bet : 0, reason: reason || (!winner ? 'Ничья — ставки возвращены' : undefined), rewards: r.result });
    sendTo(s.userId, { t: 'profile.dirty' });
  }
  setTimeout(() => { matchMap.delete(matchId); raceToMatch.delete(a.raceId); raceToMatch.delete(b.raceId); }, 60_000);
}

export const matches = {
  submit(raceId: string, userId: string, result: RunResult, inputs: InputEvent[], semiAuto: boolean) {
    const id = raceToMatch.get(raceId);
    const m = id ? matchMap.get(id) : null;
    if (!m || m.done) return;
    const s = m.a.userId === userId ? m.a : m.b;
    s.result = result; s.inputs = inputs; s.semiAuto = semiAuto;
    if (m.a.result && m.b.result) resolveMatch(m.id);
  },
};

// ───────── подбор по силе ─────────
setInterval(async () => {
  const now = Date.now();
  const list = [...quick.values()];
  const used = new Set<string>();
  for (const x of list) {
    if (used.has(x.userId)) continue;
    const waited = (now - x.since) / 1000;
    const tol = 0.6 + waited * 0.12;
    const y = list.find((o) => o.userId !== x.userId && !used.has(o.userId) && o.distance === x.distance && Math.abs(o.pi - x.pi) <= tol);
    if (y) {
      used.add(x.userId); used.add(y.userId);
      quick.delete(x.userId); quick.delete(y.userId);
      const tracks = Object.keys(TRACK_MAP);
      const err = await startMatch(x.userId, y.userId, x.distance, tracks[randomInt(0, tracks.length)], 0);
      if (err) { sendTo(x.userId, { t: 'error', msg: err }); sendTo(y.userId, { t: 'error', msg: err }); }
      sendTo(x.userId, { t: 'quick.status', searching: false }); sendTo(y.userId, { t: 'quick.status', searching: false });
    } else if (waited > 15) {
      quick.delete(x.userId);
      sendTo(x.userId, { t: 'quick.status', searching: false, ghostFallback: true });
    }
  }
  for (const [id, inv] of invites) if (now - inv.at > 60_000) invites.delete(id);
}, 1000);

async function handle(c: Client, m: ClientMsg) {
  switch (m.t) {
    case 'ping': return send(c, { t: 'pong', c: m.c, now: Date.now() });
    case 'lobby.subscribe':
      c.lobby = true;
      send(c, { t: 'lobby.list', entries: [...lobby.values()], online: byUser.size });
      return send(c, { t: 'chat.history', msgs: chat.slice(-50) });
    case 'lobby.create': {
      if (!DISTANCES.includes(m.distance as any) || !TRACK_MAP[m.trackId]) return send(c, { t: 'error', msg: 'Неверные параметры' });
      const bet = Math.max(0, Math.min(100000, Math.floor(Number(m.bet) || 0)));
      const u = await db.user.findUniqueOrThrow({ where: { id: c.userId } });
      const p = parseProfile(u);
      if (p.money < bet) return send(c, { t: 'error', msg: 'Не хватает денег на ставку' });
      if (p.fuel < 1) return send(c, { t: 'error', msg: 'Нет топлива' });
      const car = getCar(p, p.currentCar);
      const sim = buildSimCar(car);
      for (const [k, e] of lobby) if (e.hostId === c.userId) lobby.delete(k);
      const id = 'l' + randomBytes(5).toString('hex');
      lobby.set(id, { id, hostId: c.userId, hostNick: p.nick, hostLevel: p.level, distance: m.distance, trackId: m.trackId, bet, createdAt: Date.now(),
        car: { carId: car.carId, visual: car.visual, parts: car.parts, pi: performanceIndex(sim), name: car.uid } });
      return broadcastLobby();
    }
    case 'lobby.cancel':
      for (const [k, e] of lobby) if (e.hostId === c.userId) lobby.delete(k);
      return broadcastLobby();
    case 'lobby.accept': {
      const e = lobby.get(m.id);
      if (!e) return send(c, { t: 'error', msg: 'Заезд уже занят' });
      if (e.hostId === c.userId) return;
      lobby.delete(m.id);
      broadcastLobby();
      const err = await startMatch(e.hostId, c.userId, e.distance, e.trackId, e.bet);
      if (err) { send(c, { t: 'error', msg: err }); sendTo(e.hostId, { t: 'error', msg: err }); }
      return;
    }
    case 'chat': {
      const text = String(m.text ?? '').trim().slice(0, 200);
      if (!text || Date.now() - c.lastChat < 1000) return;
      c.lastChat = Date.now();
      const msg: ChatMsg = { id: randomBytes(4).toString('hex'), userId: c.userId, nick: c.nick, text, at: Date.now() };
      chat.push(msg); if (chat.length > 100) chat.shift();
      clients.forEach((x) => x.lobby && send(x, { t: 'chat', msg }));
      return;
    }
    case 'quick.join': {
      const u = await db.user.findUniqueOrThrow({ where: { id: c.userId } });
      quick.set(c.userId, { userId: c.userId, distance: DISTANCES.includes(m.distance as any) ? m.distance : 402, pi: u.pi, since: Date.now() });
      return send(c, { t: 'quick.status', searching: true });
    }
    case 'quick.leave': quick.delete(c.userId); return send(c, { t: 'quick.status', searching: false });
    case 'invite': {
      if (!(await friendIds(c.userId)).includes(m.userId)) return send(c, { t: 'invite.result', accepted: false, reason: 'Вызывать лично можно только друзей' });
      if (!isOnline(m.userId)) return send(c, { t: 'invite.result', accepted: false, reason: 'Друг не в сети — попробуй гонку с его призраком' });
      const id = 'i' + randomBytes(5).toString('hex');
      const bet = Math.max(0, Math.min(100000, Math.floor(Number(m.bet) || 0)));
      invites.set(id, { from: c.userId, to: m.userId, distance: m.distance, trackId: TRACK_MAP[m.trackId] ? m.trackId : 'neon', bet, at: Date.now() });
      sendTo(m.userId, { t: 'invite', inviteId: id, from: { id: c.userId, nick: c.nick, level: c.level }, distance: m.distance, trackId: m.trackId, bet });
      return;
    }
    case 'invite.answer': {
      const inv = invites.get(m.inviteId);
      if (!inv || inv.to !== c.userId) return;
      invites.delete(m.inviteId);
      if (!m.accept) return sendTo(inv.from, { t: 'invite.result', accepted: false, reason: `${c.nick} отклонил вызов` });
      const err = await startMatch(inv.from, inv.to, inv.distance, inv.trackId, inv.bet);
      if (err) { send(c, { t: 'error', msg: err }); sendTo(inv.from, { t: 'error', msg: err }); }
      return;
    }
    case 'race.state': {
      const mm = matchMap.get(m.matchId);
      if (!mm) return;
      const other = mm.a.userId === c.userId ? mm.b : mm.b.userId === c.userId ? mm.a : null;
      if (other) sendTo(other.userId, { t: 'race.state', matchId: m.matchId, s: m.s });
      return;
    }
    case 'race.leave': {
      const mm = matchMap.get(m.matchId);
      if (!mm) return;
      const s = mm.a.userId === c.userId ? mm.a : mm.b;
      s.left = true;
      if ((mm.a.left || mm.a.result) && (mm.b.left || mm.b.result)) resolveMatch(mm.id);
      return;
    }
  }
}

export function wsRoutes(app: FastifyInstance) {
  app.get('/ws', { websocket: true }, async (socket, req) => {
    const token = (req.query as any).token as string;
    const u = await userFromToken(token);
    if (!u) { socket.close(4001, 'unauthorized'); return; }
    const c: Client = { ws: socket, userId: u.id, nick: u.nick, level: u.level, lobby: false, lastChat: 0 };
    clients.add(c);
    if (!byUser.has(u.id)) byUser.set(u.id, new Set());
    byUser.get(u.id)!.add(c);
    send(c, { t: 'welcome', userId: u.id, now: Date.now() });
    socket.on('message', (raw: Buffer) => {
      let m: ClientMsg;
      try { m = JSON.parse(raw.toString()); } catch { return; }
      handle(c, m).catch((e) => send(c, { t: 'error', msg: e instanceof Error ? e.message : 'Ошибка' }));
    });
    socket.on('close', () => {
      clients.delete(c);
      const set = byUser.get(u.id);
      set?.delete(c);
      if (!set?.size) {
        byUser.delete(u.id);
        quick.delete(u.id);
        for (const [k, e] of lobby) if (e.hostId === u.id) lobby.delete(k);
        broadcastLobby();
      }
    });
  });
}
