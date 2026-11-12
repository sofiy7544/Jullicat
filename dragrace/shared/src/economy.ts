import type { Distance, Profile } from './types';
import { hashStr, mulberry32 } from './rng';

export const FUEL_MAX = 12;
export const FUEL_REGEN_MS = 5 * 60 * 1000;
export const BONUS_MS = 8 * 60 * 60 * 1000;
export const MAX_LEVEL = 40;
export const FUEL_GOLD_PRICE = 5;
export const KIT_REPAIR = 25;

export function xpForLevel(level: number) {
  // суммарный опыт для достижения уровня
  let total = 0;
  for (let l = 1; l < level; l++) total += Math.round(80 + l * l * 14 + l * 40);
  return total;
}

export function levelFromXp(xp: number) {
  let l = 1;
  while (l < MAX_LEVEL && xp >= xpForLevel(l + 1)) l++;
  return l;
}

export function syncFuel(p: Profile, now: number) {
  if (p.fuel >= FUEL_MAX) { p.fuelAt = now; return; }
  const gained = Math.floor((now - p.fuelAt) / FUEL_REGEN_MS);
  if (gained > 0) {
    p.fuel = Math.min(FUEL_MAX, p.fuel + gained);
    p.fuelAt = p.fuel >= FUEL_MAX ? now : p.fuelAt + gained * FUEL_REGEN_MS;
  }
}

export function nextFuelIn(p: Profile, now: number) {
  if (p.fuel >= FUEL_MAX) return 0;
  return Math.max(0, FUEL_REGEN_MS - (now - p.fuelAt));
}

export const DIST_REWARD: Record<Distance, number> = { 201: 140, 402: 230, 804: 380 };
export const DIST_XP: Record<Distance, number> = { 201: 18, 402: 28, 804: 44 };

export function bonusAmount(level: number, now: number) {
  const r = mulberry32(Math.floor(now / BONUS_MS))();
  return { money: 300 + level * 60 + Math.round(r * 200), gold: r > 0.7 ? 2 : 1, fuel: 3 };
}

// ── Ежедневные задания ──
export interface DailyDef { id: string; title: string; goal: number; money: number; xp: number; gold: number }
export const DAILY_POOL: DailyDef[] = [
  { id: 'win3', title: 'Выиграй 3 заезда', goal: 3, money: 600, xp: 60, gold: 0 },
  { id: 'race5', title: 'Проведи 5 заездов', goal: 5, money: 400, xp: 50, gold: 0 },
  { id: 'perfect10', title: 'Сделай 10 идеальных переключений', goal: 10, money: 500, xp: 60, gold: 1 },
  { id: 'nitro3', title: 'Используй нитро 3 раза', goal: 3, money: 350, xp: 40, gold: 0 },
  { id: 'react2', title: 'Реакция быстрее 0,3 с — дважды', goal: 2, money: 450, xp: 50, gold: 1 },
  { id: 'q402', title: 'Проедь 402 м трижды', goal: 3, money: 400, xp: 45, gold: 0 },
  { id: 'q804', title: 'Проедь 804 м дважды', goal: 2, money: 500, xp: 55, gold: 0 },
  { id: 'cleanlaunch', title: '3 старта без пробуксовки', goal: 3, money: 450, xp: 50, gold: 0 },
  { id: 'online1', title: 'Сыграй онлайн-заезд или с призраком', goal: 1, money: 500, xp: 60, gold: 1 },
];

export function dayKey(now: number) { return new Date(now).toISOString().slice(0, 10); }

export function ensureDaily(p: Profile, now: number) {
  const d = dayKey(now);
  if (p.daily?.date === d) return;
  const rng = mulberry32(hashStr(d + p.id));
  const pool = [...DAILY_POOL];
  const tasks = [];
  for (let i = 0; i < 3; i++) {
    const idx = Math.floor(rng() * pool.length);
    const def = pool.splice(idx, 1)[0];
    tasks.push({ id: def.id, progress: 0, goal: def.goal, claimed: false });
  }
  p.daily = { date: d, tasks };
}

// ── Достижения ──
export interface AchDef { id: string; title: string; desc: string; gold: number; check: (p: Profile) => boolean }
export const ACHIEVEMENTS: AchDef[] = [
  { id: 'first_win', title: 'Первая кровь', desc: 'Выиграй первый заезд', gold: 3, check: (p) => p.stats.wins >= 1 },
  { id: 'wins10', title: 'Десятка', desc: '10 побед', gold: 5, check: (p) => p.stats.wins >= 10 },
  { id: 'wins100', title: 'Уличная легенда', desc: '100 побед', gold: 25, check: (p) => p.stats.wins >= 100 },
  { id: 'perfect50', title: 'Рука-метроном', desc: '50 идеальных переключений', gold: 6, check: (p) => p.stats.perfectShifts >= 50 },
  { id: 'react02', title: 'Молния', desc: 'Реакция быстрее 0,2 с', gold: 6, check: (p) => p.stats.bestReaction !== null && p.stats.bestReaction < 0.2 },
  { id: 'q402_15', title: 'Четверть за 15', desc: '402 м быстрее 15 с', gold: 5, check: (p) => (p.stats.bestTimes[402] ?? 99) < 15 },
  { id: 'q402_12', title: 'Четверть за 12', desc: '402 м быстрее 12 с', gold: 12, check: (p) => (p.stats.bestTimes[402] ?? 99) < 12 },
  { id: 'q201_8', title: 'Спринтер', desc: '201 м быстрее 8 с', gold: 8, check: (p) => (p.stats.bestTimes[201] ?? 99) < 8 },
  { id: 'q804_20', title: 'Полмили', desc: '804 м быстрее 20 с', gold: 12, check: (p) => (p.stats.bestTimes[804] ?? 99) < 20 },
  { id: 'cars3', title: 'Коллекционер', desc: 'Владей 3 машинами', gold: 5, check: (p) => p.cars.length >= 3 },
  { id: 'cars6', title: 'Автопарк', desc: 'Владей 6 машинами', gold: 12, check: (p) => p.cars.length >= 6 },
  { id: 'maxpart', title: 'До упора', desc: 'Поставь деталь 5 уровня', gold: 6, check: (p) => p.cars.some((c) => Object.values(c.parts).some((x) => x.lvl >= 5)) },
  { id: 'boss1', title: 'Хозяин двора', desc: 'Победи первого босса', gold: 5, check: (p) => p.stats.bossesBeaten >= 1 },
  { id: 'boss4', title: 'Король асфальта', desc: 'Пройди всю карьеру', gold: 40, check: (p) => p.stats.bossesBeaten >= 4 },
  { id: 'online5', title: 'Сетевой гонщик', desc: '5 онлайн-побед', gold: 10, check: (p) => p.stats.onlineWins >= 5 },
  { id: 'lvl10', title: 'Опытный', desc: 'Достигни 10 уровня', gold: 8, check: (p) => p.level >= 10 },
  { id: 'tourney', title: 'Призёр выходных', desc: 'Топ-3 турнира выходного дня', gold: 15, check: (p) => p.stats.tournamentTop3 >= 1 },
];

export const ACH_MAP = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

export function checkAchievements(p: Profile): string[] {
  const got: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (!p.achievements.includes(a.id) && a.check(p)) {
      p.achievements.push(a.id);
      p.gold += a.gold;
      got.push(a.id);
    }
  }
  return got;
}

// ── Турнир выходного дня ──
export function weekKey(now: number) {
  const d = new Date(now);
  const day = (d.getUTCDay() + 6) % 7; // пн=0
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
  return new Date(monday).toISOString().slice(0, 10);
}

export function tournamentInfo(now: number, forceActive = false) {
  const wk = weekKey(now);
  const r = mulberry32(hashStr('t' + wk));
  const tracks = ['rust', 'neon', 'port', 'pine', 'wing', 'arc'];
  const dists: Distance[] = [201, 402, 804];
  const day = new Date(now).getUTCDay();
  const active = forceActive || day === 6 || day === 0;
  return { week: wk, trackId: tracks[Math.floor(r() * tracks.length)], distance: dists[Math.floor(r() * 3)], active, entryFuel: 1 };
}

export const TOURNEY_PRIZES = [{ gold: 30, money: 8000 }, { gold: 20, money: 5000 }, { gold: 12, money: 3000 }];
export const GIFT_KINDS = {
  fuel: { title: 'Канистра топлива', desc: '+3 топлива', icon: '⛽' },
  money: { title: 'Конверт', desc: '+250 монет', icon: '💰' },
  kit: { title: 'Ремкомплект', desc: '+25% состояния детали', icon: '🧰' },
} as const;
export type GiftKind = keyof typeof GIFT_KINDS;
