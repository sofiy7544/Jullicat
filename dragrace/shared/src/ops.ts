// Игровые операции над профилем. Один и тот же код работает на сервере (авторитетно)
// и в офлайн-режиме гостя (localStorage).
import { CAR_MAP, CARS } from './cars';
import { LEAGUES, QUICK_NAMES } from './career';
import {
  BONUS_MS, DAILY_POOL, DIST_REWARD, DIST_XP, FUEL_GOLD_PRICE, FUEL_MAX, KIT_REPAIR,
  bonusAmount, checkAchievements, ensureDaily, levelFromXp, syncFuel,
} from './economy';
import {
  PARTS, PART_GOLD, PART_UNLOCK, RIMS, KITS, SPOILERS, TINTS, VISUAL_GOLD, VISUAL_PRICE,
  buildSimCar, defaultVisual, newOwnedCar, partPrice, repairCost,
} from './parts';
import { botSimCar, performanceIndex, runBot } from './bot';
import { greenTickFromSeed, runSim, type SimConfig } from './physics';
import { mulberry32 } from './rng';
import { TRACK_MAP } from './tracks';
import type {
  Distance, InputEvent, OpponentSpec, OwnedCar, PartKind, Profile, RaceContext, RaceKind,
  RaceRewards, RunResult, SimCar, Visual,
} from './types';
import { DISTANCES, PART_KINDS } from './types';

export class GameError extends Error {}
const fail = (m: string): never => { throw new GameError(m); };

export function newProfile(id: string, nick: string, now: number): Profile {
  const p: Profile = {
    id, nick, money: 1500, gold: 10, xp: 0, level: 1, fuel: FUEL_MAX, fuelAt: now, bonusAt: 0, repairKits: 1,
    cars: [newOwnedCar('borka', 'c1')], currentCar: 'c1', career: { league: 0, beaten: 0 },
    daily: { date: '', tasks: [] }, achievements: [],
    stats: { races: 0, wins: 0, losses: 0, perfectShifts: 0, falseStarts: 0, bestTimes: {}, bestReaction: null, bossesBeaten: 0, onlineWins: 0, nitroUses: 0, tournamentTop3: 0 },
    tutorialDone: false, createdAt: now,
  };
  ensureDaily(p, now);
  return p;
}

export function touch(p: Profile, now: number) {
  syncFuel(p, now);
  ensureDaily(p, now);
}

export function getCar(p: Profile, uid: string): OwnedCar {
  return p.cars.find((c) => c.uid === uid) ?? fail('Машина не найдена');
}

function pay(p: Profile, money: number, gold = 0) {
  if (p.money < money) fail('Не хватает монет');
  if (p.gold < gold) fail('Не хватает кристаллов');
  p.money -= money; p.gold -= gold;
}

// ───────────── операции (вызываются через dispatch) ─────────────
export const OPS = {
  buyCar(p: Profile, a: { carId: string }) {
    const c = CAR_MAP[a.carId] ?? fail('Нет такой машины');
    if (p.level < c.unlock) fail(`Откроется на ${c.unlock} уровне`);
    if (p.cars.length >= 12) fail('Гараж полон (12 машин)');
    pay(p, c.price, c.gold);
    const uidStr = 'c' + (Math.max(0, ...p.cars.map((x) => parseInt(x.uid.slice(1)) || 0)) + 1);
    p.cars.push(newOwnedCar(c.id, uidStr));
    p.currentCar = uidStr;
    return { uid: uidStr };
  },
  sellCar(p: Profile, a: { uid: string }) {
    if (p.cars.length <= 1) fail('Нельзя продать последнюю машину');
    const car = getCar(p, a.uid);
    const c = CAR_MAP[car.carId];
    let value = c.price * 0.5;
    for (const k of PART_KINDS) for (let l = 1; l <= car.parts[k].lvl; l++) value += partPrice(k, l, car.carId) * 0.3;
    p.money += Math.round(value);
    p.cars = p.cars.filter((x) => x.uid !== a.uid);
    if (p.currentCar === a.uid) p.currentCar = p.cars[0].uid;
    return { value: Math.round(value) };
  },
  selectCar(p: Profile, a: { uid: string }) { getCar(p, a.uid); p.currentCar = a.uid; },
  buyPart(p: Profile, a: { uid: string; kind: PartKind; lvl: number }) {
    const car = getCar(p, a.uid);
    if (!PARTS[a.kind]) fail('Нет такой детали');
    const lvl = Math.floor(a.lvl);
    if (lvl < 1 || lvl > 5) fail('Неверный уровень');
    if (car.parts[a.kind].lvl >= lvl) fail('Уже установлено');
    if (p.level < PART_UNLOCK[lvl]) fail(`Уровень ${lvl} откроется на ${PART_UNLOCK[lvl]} уровне игрока`);
    pay(p, partPrice(a.kind, lvl, car.carId), PART_GOLD[lvl]);
    car.parts[a.kind] = { lvl, cond: 100 };
    if (a.kind === 'gearbox' && lvl < 2) { car.gearTune = car.gearTune.map(() => 1); car.finalTune = 1; }
  },
  repairPart(p: Profile, a: { uid: string; kind: PartKind }) {
    const car = getCar(p, a.uid);
    const part = car.parts[a.kind] ?? fail('Нет детали');
    const cost = repairCost(a.kind, part, car.carId);
    pay(p, cost);
    part.cond = 100;
    return { cost };
  },
  repairAll(p: Profile, a: { uid: string }) {
    const car = getCar(p, a.uid);
    let cost = 0;
    for (const k of PART_KINDS) cost += repairCost(k, car.parts[k], car.carId);
    cost = Math.round(cost * 0.9);
    pay(p, cost);
    for (const k of PART_KINDS) car.parts[k].cond = 100;
    return { cost };
  },
  useKit(p: Profile, a: { uid: string; kind: PartKind }) {
    if (p.repairKits <= 0) fail('Нет ремкомплектов');
    const car = getCar(p, a.uid);
    const part = car.parts[a.kind] ?? fail('Нет детали');
    part.cond = Math.min(100, part.cond + KIT_REPAIR);
    p.repairKits--;
  },
  setGears(p: Profile, a: { uid: string; gears: number[]; final: number }) {
    const car = getCar(p, a.uid);
    if (car.parts.gearbox.lvl < 2) fail('Нужна спортивная коробка (ур. 2+)');
    const c = CAR_MAP[car.carId];
    if (!Array.isArray(a.gears) || a.gears.length !== c.gears.length) fail('Неверные передачи');
    const range = 0.12 + 0.03 * car.parts.gearbox.lvl;
    car.gearTune = a.gears.map((g) => clampN(g, 1 - range, 1 + range));
    car.finalTune = clampN(a.final, 1 - range, 1 + range);
  },
  setVisual(p: Profile, a: { uid: string; visual: Visual }) {
    const car = getCar(p, a.uid);
    const v = sanitizeVisual(a.visual, car.carId);
    const { money, gold } = visualCost(car.visual, v);
    pay(p, money, gold);
    car.visual = v;
    return { money, gold };
  },
  claimBonus(p: Profile, _a: unknown, now: number) {
    if (now - p.bonusAt < BONUS_MS) fail('Бонус ещё не готов');
    const b = bonusAmount(p.level, now);
    p.money += b.money; p.gold += b.gold; p.fuel = Math.min(FUEL_MAX + 5, p.fuel + b.fuel);
    p.bonusAt = now;
    return b;
  },
  buyFuel(p: Profile) {
    pay(p, 0, FUEL_GOLD_PRICE);
    p.fuel = Math.max(p.fuel, FUEL_MAX);
  },
  exchangeGold(p: Profile, a: { gold: number }) {
    const g = Math.floor(a.gold);
    if (g < 1 || g > 1000) fail('Неверное количество');
    pay(p, 0, g);
    p.money += g * 120;
  },
  claimDaily(p: Profile, a: { id: string }) {
    const t = p.daily.tasks.find((x) => x.id === a.id) ?? fail('Нет задания');
    if (t.claimed) fail('Уже получено');
    if (t.progress < t.goal) fail('Задание не выполнено');
    const def = DAILY_POOL.find((d) => d.id === t.id)!;
    t.claimed = true;
    p.money += def.money; p.gold += def.gold; addXp(p, def.xp);
    return def;
  },
  finishTutorial(p: Profile) { p.tutorialDone = true; },
};

export type OpName = keyof typeof OPS;
export const OP_NAMES = Object.keys(OPS) as OpName[];

export function dispatch(p: Profile, op: string, args: any, now: number): any {
  const fn = (OPS as Record<string, (p: Profile, a: any, now: number) => any>)[op];
  if (!fn) fail('Неизвестная операция');
  touch(p, now);
  const res = fn(p, args ?? {}, now);
  checkAchievements(p);
  return res;
}

function clampN(v: number, a: number, b: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.round(Math.min(b, Math.max(a, n)) * 1000) / 1000;
}

const COLOR = /^#[0-9a-fA-F]{6}$/;
export function sanitizeVisual(v: any, carId: string): Visual {
  const d = defaultVisual(carId);
  if (!v || typeof v !== 'object') return d;
  const col = (c: any, def: string) => (typeof c === 'string' && COLOR.test(c) ? c : def);
  const int = (n: any, max: number) => Math.max(0, Math.min(max, Math.floor(Number(n) || 0)));
  const vinyls = Array.isArray(v.vinyls) ? v.vinyls.slice(0, 16).map((x: any, i: number) => ({
    id: String(x?.id ?? i).slice(0, 12),
    kind: ['text', 'shape', 'sticker'].includes(x?.kind) ? x.kind : 'shape',
    x: clampN(x?.x, -0.2, 1.2), y: clampN(x?.y, -0.2, 1.2), s: clampN(x?.s, 0.05, 3), r: clampN(x?.r, -3.2, 3.2),
    color: col(x?.color, '#ffffff'),
    text: typeof x?.text === 'string' ? x.text.slice(0, 16) : undefined,
    shape: typeof x?.shape === 'string' ? x.shape.slice(0, 12) : undefined,
    sticker: typeof x?.sticker === 'string' ? x.sticker.slice(0, 12) : undefined,
    flip: !!x?.flip,
  })) : [];
  return {
    paint: col(v.paint, d.paint), paint2: col(v.paint2, d.paint2), rims: int(v.rims, RIMS.length - 1), rimColor: col(v.rimColor, d.rimColor),
    spoiler: int(v.spoiler, SPOILERS.length - 1), kit: int(v.kit, KITS.length - 1), tint: int(v.tint, TINTS.length - 1),
    glow: v.glow ? col(v.glow, '#00e5ff') : null, vinyls,
  };
}

export function visualCost(a: Visual, b: Visual) {
  let money = 0, gold = 0;
  if (a.paint !== b.paint) money += VISUAL_PRICE.paint;
  if (a.paint2 !== b.paint2) money += VISUAL_PRICE.paint2;
  if (a.rims !== b.rims) { money += VISUAL_PRICE.rims[b.rims]; gold += VISUAL_GOLD.rims[b.rims]; }
  if (a.rimColor !== b.rimColor) money += VISUAL_PRICE.rimColor;
  if (a.spoiler !== b.spoiler) money += VISUAL_PRICE.spoiler[b.spoiler];
  if (a.kit !== b.kit) { money += VISUAL_PRICE.kit[b.kit]; gold += VISUAL_GOLD.kit[b.kit]; }
  if (a.tint !== b.tint) money += VISUAL_PRICE.tint[b.tint];
  if (a.glow !== b.glow && b.glow) money += VISUAL_PRICE.glow;
  if (JSON.stringify(a.vinyls) !== JSON.stringify(b.vinyls)) money += VISUAL_PRICE.vinylBase + VISUAL_PRICE.vinylLayer * b.vinyls.length;
  return { money, gold };
}

function addXp(p: Profile, xp: number) {
  const before = p.level;
  p.xp += xp;
  p.level = levelFromXp(p.xp);
  if (p.level > before) { p.money += 500 * (p.level - before); p.repairKits += p.level - before; }
  return p.level > before;
}

// ───────────── заезды ─────────────
export interface RaceRequest { kind: RaceKind; trackId: string; distance: Distance; carUid?: string; careerIndex?: number; tutorial?: boolean }

export function carCondOk(car: OwnedCar) {
  const broken = PART_KINDS.filter((k) => car.parts[k].cond < 3 && (k === 'engine' || k === 'gearbox' || k === 'clutch'));
  if (broken.length) fail(`Сломано: ${broken.map((k) => PARTS[k].name).join(', ')}. Почини в гараже.`);
}

/** Проверяет возможность заезда, списывает топливо и создаёт контекст. */
export function prepareRace(p: Profile, req: RaceRequest, now: number, seed: number, raceId: string, opponent?: OpponentSpec): RaceContext {
  touch(p, now);
  const track = TRACK_MAP[req.trackId] ?? fail('Нет такой трассы');
  if (!DISTANCES.includes(req.distance)) fail('Неверная дистанция');
  const car = getCar(p, req.carUid ?? p.currentCar);
  carCondOk(car);
  let distance = req.distance, trackId = track.id;
  let opp = opponent;
  let careerStep: RaceContext['careerStep'];
  const tutorial = !!req.tutorial && !p.tutorialDone;
  if (req.kind === 'career') {
    const L = LEAGUES[p.career.league] ?? fail('Карьера пройдена');
    if (p.level < L.unlock) fail(`Лига откроется на ${L.unlock} уровне`);
    const idx = req.careerIndex ?? p.career.beaten;
    if (idx > p.career.beaten || idx >= L.bots.length) fail('Сначала победи предыдущих соперников');
    const b = L.bots[idx];
    distance = b.distance; trackId = b.trackId;
    opp = { type: 'bot', name: b.name, carId: b.carId, tune: b.tune, skill: b.skill, boss: b.boss, visual: { ...defaultVisual(b.carId), paint: b.paint, rims: b.boss ? 3 : 1, spoiler: b.boss ? 3 : 0 } };
    careerStep = { league: L.id, index: idx };
  } else if (!opp) {
    if (p.level < track.unlock && !tutorial) fail(`Трасса откроется на ${track.unlock} уровне`);
    opp = tutorial
      ? { type: 'bot', name: 'Инструктор', carId: 'borka', tune: 0, skill: 0.05 }
      : matchBot(buildSimCar(car), p.level, seed, req.kind === 'tournament');
  }
  if (!tutorial) {
    if (p.fuel < 1) fail('Нет топлива — подожди или получи бонус');
    if (p.fuel >= FUEL_MAX) p.fuelAt = now;
    p.fuel -= 1;
  }
  return { raceId, kind: req.kind, trackId, distance, carUid: car.uid, seed, opponent: opp!, bet: 0, careerStep, startedAt: now, tutorial };
}

/** Подбор бота по силе машины игрока. */
export function matchBot(player: SimCar, level: number, seed: number, pace = false): OpponentSpec {
  const rng = mulberry32(seed + 99);
  const pool = CARS.filter((c) => c.unlock <= level + 4);
  const c = pool[Math.floor(rng() * pool.length)];
  const target = performanceIndex(player) * (0.97 + rng() * 0.08);
  let best = 0, bestDiff = 1e9;
  for (let t = 0; t <= 5; t += 0.5) {
    const d = Math.abs(performanceIndex(botSimCar(c.id, t)) - target);
    if (d < bestDiff) { bestDiff = d; best = t; }
  }
  const skill = pace ? 0.7 : 0.3 + rng() * 0.5 + Math.min(0.15, level * 0.01);
  const paints = ['#e63946', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#ecf0f1', '#ff6b00', '#1abc9c'];
  return {
    type: 'bot', name: pace ? 'Пейс-кар' : QUICK_NAMES[Math.floor(rng() * QUICK_NAMES.length)], carId: c.id, tune: best, skill,
    visual: { ...defaultVisual(c.id), paint: paints[Math.floor(rng() * paints.length)], rims: Math.floor(rng() * 5), spoiler: Math.floor(rng() * 3) },
  };
}

export function opponentSimCar(o: OpponentSpec): SimCar {
  return o.type === 'bot' ? botSimCar(o.carId, o.tune) : o.simCar;
}

export function raceConfig(ctx: RaceContext, car: SimCar, semiAuto: boolean): SimConfig {
  return { car, mu: TRACK_MAP[ctx.trackId].mu, distance: ctx.distance, greenTick: greenTickFromSeed(ctx.seed), semiAuto };
}

/** Серверная проверка: прогоняет заезд игрока и соперника по записям. */
export function resolveRace(ctx: RaceContext, playerCar: SimCar, inputs: InputEvent[], semiAuto: boolean) {
  const player = runSim(raceConfig(ctx, playerCar, semiAuto), inputs);
  let opp: RunResult | null = null;
  const o = ctx.opponent;
  if (o.type === 'bot') opp = runBot(raceConfig(ctx, opponentSimCar(o), true), o.skill, ctx.seed + 1).result;
  else if (o.type === 'ghost') { const cfg = raceConfig(ctx, o.simCar, o.semiAuto); opp = runSim(cfg, shiftInputs(o.inputs, o.green, cfg.greenTick)); }
  return { player, opp };
}

/** Сдвигает запись призрака так, чтобы его зелёный совпал с зелёным текущего заезда. */
export function shiftInputs(inputs: InputEvent[], fromGreen: number, toGreen: number): InputEvent[] {
  const d = toGreen - fromGreen;
  return inputs.map(([t, c, v]) => [Math.max(0, t + d), c, v] as InputEvent);
}

export function isWin(player: RunResult, opp: RunResult | null) {
  if (player.falseStart || player.dnf) return false;
  if (!opp) return true;
  if (opp.falseStart || opp.dnf) return true;
  return player.time < opp.time;
}

/** Применяет результат заезда к профилю: деньги, опыт, износ, рекорды, задания. */
export function applyRaceResult(p: Profile, ctx: RaceContext, player: RunResult, opp: RunResult | null, now: number, winOverride?: boolean): RaceRewards {
  touch(p, now);
  const car = getCar(p, ctx.carUid);
  const win = winOverride ?? isWin(player, opp);
  const L = ctx.careerStep ? LEAGUES[ctx.careerStep.league] : null;
  const mult = L ? L.reward : 1 + Math.min(1.5, p.level * 0.05);
  const valid = !player.falseStart && !player.dnf;
  let money = Math.round(DIST_REWARD[ctx.distance] * mult * (win ? 1 : 0.3)) + (valid ? player.perfectShifts * 15 : 0);
  let xp = Math.round(DIST_XP[ctx.distance] * (win ? 1.4 : 0.7)) + player.perfectShifts * 3;
  let gold = 0;
  if (ctx.tutorial) { money = 500; xp = 60; p.tutorialDone = true; }
  let careerAdvanced = false;
  if (win && ctx.careerStep && L) {
    const st = ctx.careerStep;
    if (st.league === p.career.league && st.index === p.career.beaten) {
      careerAdvanced = true;
      money += 300 * (st.league + 1);
      p.career.beaten++;
      if (L.bots[st.index].boss) {
        gold += 10 * (st.league + 1);
        p.stats.bossesBeaten++;
        if (p.career.league < LEAGUES.length - 1) { p.career.league++; p.career.beaten = 0; }
      }
    }
  }
  // износ
  const wearApplied = {} as Record<PartKind, number>;
  for (const k of PART_KINDS) {
    const w = ctx.tutorial ? 0 : Math.max(0, player.wear[k] ?? 0);
    const before = car.parts[k].cond;
    car.parts[k].cond = Math.max(0, Math.round((before - w) * 10) / 10);
    wearApplied[k] = Math.round((before - car.parts[k].cond) * 10) / 10;
  }
  car.races++;
  // статистика
  const s = p.stats;
  s.races++;
  if (win) s.wins++; else s.losses++;
  if (win && ctx.kind === 'online') s.onlineWins++;
  if (player.falseStart) s.falseStarts++;
  s.perfectShifts += player.perfectShifts;
  if (player.nitroUsed) s.nitroUses++;
  let record = false;
  if (valid) {
    const prev = s.bestTimes[ctx.distance];
    if (!prev || player.time < prev) { s.bestTimes[ctx.distance] = player.time; record = true; }
    if (s.bestReaction === null || player.reaction < s.bestReaction) s.bestReaction = player.reaction;
  }
  // задания дня
  for (const t of p.daily.tasks) {
    if (t.claimed) continue;
    const inc: Record<string, number> = {
      win3: win ? 1 : 0, race5: 1, perfect10: player.perfectShifts, nitro3: player.nitroUsed ? 1 : 0,
      react2: valid && player.reaction < 0.3 ? 1 : 0, q402: ctx.distance === 402 && valid ? 1 : 0,
      q804: ctx.distance === 804 && valid ? 1 : 0, cleanlaunch: player.launch === 'perfect' ? 1 : 0,
      online1: ctx.kind === 'online' || ctx.kind === 'ghost' ? 1 : 0,
    };
    t.progress = Math.min(t.goal, t.progress + (inc[t.id] ?? 0));
  }
  p.money += money; p.gold += gold;
  const levelUp = addXp(p, xp);
  const newAchievements = checkAchievements(p);
  return { money, xp, gold, win, record, levelUp, newAchievements, careerAdvanced, wearApplied, bet: ctx.bet };
}
