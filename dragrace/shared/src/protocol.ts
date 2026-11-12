import type { Distance, PublicCar, RaceRewards, SimCar, Visual } from './types';

/** Сообщения WebSocket (клиент ⇄ сервер). */
export interface LobbyEntry {
  id: string; hostId: string; hostNick: string; hostLevel: number;
  distance: Distance; trackId: string; bet: number;
  car: PublicCar; createdAt: number;
}
export interface ChatMsg { id: string; userId: string; nick: string; text: string; at: number }
export interface MatchInfo {
  matchId: string; raceId: string; seed: number; trackId: string; distance: Distance; bet: number;
  startAt: number; // серверное время начала отсчёта (тик 0)
  opponent: { userId: string; nick: string; level: number; carId: string; simCar: SimCar; visual: Visual; pi: number };
}
export interface RemoteState { t: number; x: number; v: number; rpm: number; gear: number; nitro: boolean; spin: boolean; done?: boolean }

export type ClientMsg =
  | { t: 'hello' }
  | { t: 'ping'; c: number }
  | { t: 'lobby.subscribe' }
  | { t: 'lobby.create'; distance: Distance; trackId: string; bet: number }
  | { t: 'lobby.cancel' }
  | { t: 'lobby.accept'; id: string }
  | { t: 'chat'; text: string }
  | { t: 'quick.join'; distance: Distance }
  | { t: 'quick.leave' }
  | { t: 'invite'; userId: string; distance: Distance; trackId: string; bet: number }
  | { t: 'invite.answer'; inviteId: string; accept: boolean }
  | { t: 'race.state'; matchId: string; s: RemoteState }
  | { t: 'race.leave'; matchId: string };

export type ServerMsg =
  | { t: 'welcome'; userId: string; now: number }
  | { t: 'pong'; c: number; now: number }
  | { t: 'lobby.list'; entries: LobbyEntry[]; online: number }
  | { t: 'chat.history'; msgs: ChatMsg[] }
  | { t: 'chat'; msg: ChatMsg }
  | { t: 'match'; m: MatchInfo }
  | { t: 'quick.status'; searching: boolean; ghostFallback?: boolean }
  | { t: 'invite'; inviteId: string; from: { id: string; nick: string; level: number }; distance: Distance; trackId: string; bet: number }
  | { t: 'invite.result'; accepted: boolean; reason?: string }
  | { t: 'race.state'; matchId: string; s: RemoteState }
  | { t: 'race.result'; matchId: string; win: boolean; you: number; them: number; payout: number; reason?: string; rewards?: RaceRewards }
  | { t: 'error'; msg: string }
  | { t: 'profile.dirty' };
