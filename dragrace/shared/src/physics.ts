import { interp } from './parts';
import { mulberry32 } from './rng';
import type { InputEvent, PartKind, RunResult, SimCar } from './types';

// Детерминированная физика. Только + − × ÷ sqrt и сравнения — одинаковый результат
// в Safari/Chrome/Node, поэтому сервер может воспроизвести заезд по записи нажатий.

export const DT = 1 / 120;
export const TICK_HZ = 120;
const G = 9.81;
const RHO = 1.2;
const RPM_K = 60 / (2 * Math.PI);
export const MAX_RACE_S = 60;

export type ShiftQuality = 'perfect' | 'good' | 'early' | 'late';

export type SimEvent =
  | { e: 'launch'; q: 'perfect' | 'spin' | 'bog'; rpm: number }
  | { e: 'shift'; q: ShiftQuality; up: boolean; grind: boolean; gear: number }
  | { e: 'limiter' } | { e: 'blowoff' } | { e: 'nitro' } | { e: 'finish' } | { e: 'falsestart' } | { e: 'overrev' };

export interface SimConfig {
  car: SimCar;
  mu: number;
  distance: number;
  greenTick: number;
  semiAuto: boolean;
}

export interface Zones { launchLo: number; launchHi: number; perfLo: number[]; perfHi: number[]; optimal: number[] }

export interface SimState {
  tick: number; x: number; v: number; a: number; rpm: number; gear: number;
  throttle: number; clutchIn: boolean; launched: boolean; falseStart: boolean;
  launchTick: number; slipping: boolean; spinExcess: number; spin: boolean;
  boost: number; shiftTimer: number; pendingGear: number; shiftFlare: boolean;
  nitroLeft: number; nitroUsed: boolean; perfT: number; limiterT: number;
  finished: boolean; finishT: number; finishV: number; dnf: boolean;
  shifts: number; perfect: number; early: number; late: number; grinds: number;
  launchQ: RunResult['launch'];
  wear: Record<PartKind, number>;
  events: SimEvent[];
  zones: Zones;
  topSpeed: number;
  inputIdx: number;
  wantUp: boolean; wantDown: boolean; wantNitro: boolean;
}

export function emptyWear(): Record<PartKind, number> {
  return { engine: 0, turbo: 0, intake: 0, exhaust: 0, gearbox: 0, clutch: 0, tires: 0, suspension: 0, weight: 0, nitro: 0 };
}

/** Задержка зелёного сигнала из сида: 3 жёлтых по 0,5с + случайная пауза. */
export function greenTickFromSeed(seed: number): number {
  const r = mulberry32(seed ^ 0x9e3779b9)();
  return Math.round((2.0 + 0.4 + r * 0.9) * TICK_HZ);
}

function engineTq(car: SimCar, rpm: number, boost: number) {
  return interp(car.rpmPts, car.tqPts, rpm) * (1 + car.boostMax * boost);
}

function tractionMax(car: SimCar, mu: number, a: number) {
  const ag = a / G;
  let frac: number;
  if (car.drive === 'AWD') frac = 0.96;
  else if (car.drive === 'RWD') frac = car.driveFrac + car.transfer * Math.min(1.2, Math.max(0, ag));
  else frac = car.driveFrac - (car.transfer * 0.8) * Math.min(1.2, Math.max(0, ag));
  return mu * car.grip * G * car.mass * frac * 1.15;
}

export function computeZones(car: SimCar, mu: number): Zones {
  // Зона старта: обороты, при которых тяга первой передачи чуть выше предела сцепления.
  const tmax = tractionMax(car, mu, 0.6 * G);
  const ratio = car.gears[0] * car.fd;
  let center = 0;
  for (let rpm = car.idle + 600; rpm < car.redline; rpm += 50) {
    const f = (engineTq(car, rpm, 0.45) * ratio * car.eff * car.clutchGrip * 1.12) / car.r;
    if (f >= tmax * 1.02) { center = rpm; break; }
  }
  const lo = car.idle + 1300;
  const hi = car.redline * 0.8;
  if (!center) center = hi; else center = Math.min(hi, Math.max(lo, center + 250));
  const optimal: number[] = [];
  for (let g = 0; g < car.gears.length - 1; g++) {
    const r1 = car.gears[g] * car.fd, r2 = car.gears[g + 1] * car.fd;
    let opt = car.redline - 100;
    for (let rpm = car.idle + 1500; rpm <= car.limiter - 50; rpm += 25) {
      const f1 = engineTq(car, rpm, 1) * r1;
      const rpm2 = (rpm * r2) / r1;
      const f2 = engineTq(car, rpm2, 1) * r2;
      if (f2 > f1) { opt = rpm; break; }
    }
    opt = Math.min(opt, car.redline + 120);
    optimal.push(Math.max(car.idle + 2000, opt));
  }
  optimal.push(car.redline);
  return {
    launchLo: center - 550, launchHi: center + 550,
    perfLo: optimal.map((o) => o - 320),
    perfHi: optimal.map((o) => Math.min(car.limiter - 30, o + 180)),
    optimal,
  };
}

export function createSim(cfg: SimConfig): SimState {
  return {
    tick: 0, x: 0, v: 0, a: 0, rpm: cfg.car.idle, gear: 1, throttle: 0, clutchIn: false,
    launched: false, falseStart: false, launchTick: -1, slipping: false, spinExcess: 0, spin: false,
    boost: 0, shiftTimer: 0, pendingGear: 1, shiftFlare: false, nitroLeft: 0, nitroUsed: false, perfT: 0, limiterT: 0,
    finished: false, finishT: 0, finishV: 0, dnf: false,
    shifts: 0, perfect: 0, early: 0, late: 0, grinds: 0, launchQ: 'none',
    wear: emptyWear(), events: [], zones: computeZones(cfg.car, cfg.mu), topSpeed: 0,
    inputIdx: 0, wantUp: false, wantDown: false, wantNitro: false,
  };
}

function applyInput(s: SimState, ev: InputEvent) {
  const [, code, val] = ev;
  if (code === 0) s.throttle = val > 0 ? 1 : 0;
  else if (code === 1) s.clutchIn = val > 0;
  else if (code === 2 && val > 0) s.wantUp = true;
  else if (code === 3 && val > 0) s.wantDown = true;
  else if (code === 4 && val > 0) s.wantNitro = true;
}

/** Один тик симуляции. inputs — полный отсортированный список событий заезда. */
export function stepSim(s: SimState, cfg: SimConfig, inputs: InputEvent[]): void {
  const car = cfg.car;
  s.events.length = 0;
  if (s.finished) return;
  while (s.inputIdx < inputs.length && inputs[s.inputIdx][0] <= s.tick) {
    applyInput(s, inputs[s.inputIdx]);
    s.inputIdx++;
  }
  const z = s.zones;
  const thr = s.throttle;

  // Турбина
  let boostTarget = 0;
  if (thr > 0) boostTarget = s.rpm >= car.spoolRpm ? 1 : Math.max(0, (s.rpm - car.idle) / (car.spoolRpm - car.idle)) * 0.45;
  if (!s.launched) boostTarget *= 0.5;
  const prevBoost = s.boost;
  s.boost += (boostTarget - s.boost) * Math.min(1, car.spoolRate * DT * (boostTarget > s.boost ? 1 : 3));
  if (car.boostMax > 0 && prevBoost > 0.55 && thr === 0 && boostTarget === 0 && s.boost < prevBoost && prevBoost - s.boost > 0.02 && s.boost < 0.55)
    s.events.push({ e: 'blowoff' });

  if (!s.launched) {
    // Стоим на месте: сцепление выжато (или машина на тормозе), газ раскручивает мотор.
    const target = car.idle + thr * (car.limiter - car.idle);
    if (s.rpm < target) s.rpm += Math.min(target - s.rpm, 7000 * DT);
    else s.rpm -= Math.min(s.rpm - target, 4500 * DT);
    if (s.rpm >= car.limiter - 1) { s.rpm = car.limiter - 350; s.events.push({ e: 'limiter' }); }
    if (s.rpm > car.redline * 0.97) s.wear.engine += 0.5 * car.wearMul.engine * DT;
    if (!s.clutchIn && thr > 0) {
      s.launched = true;
      s.launchTick = s.tick;
      if (s.tick < cfg.greenTick) {
        s.falseStart = true;
        s.finished = true;
        s.events.push({ e: 'falsestart' });
        return finishTick(s);
      }
      s.slipping = true;
      const q = s.rpm > z.launchHi ? 'spin' : s.rpm < z.launchLo ? 'bog' : 'perfect';
      s.launchQ = q;
      if (q === 'spin') {
        s.wear.clutch += ((s.rpm - z.launchHi) / 1000) * 5 * car.wearMul.clutch;
        s.spinExcess = Math.min(2500, (s.rpm - z.launchHi) * 0.9);
      }
      s.events.push({ e: 'launch', q, rpm: s.rpm });
    }
    s.wantUp = s.wantDown = s.wantNitro = false;
    s.tick++;
    if (s.tick > cfg.greenTick + MAX_RACE_S * TICK_HZ) { s.finished = true; s.dnf = true; }
    return;
  }

  const ratio = car.gears[s.gear - 1] * car.fd;
  const coupled = (s.v / car.r) * RPM_K * ratio;

  // Запросы переключения
  if (s.wantUp && s.shiftTimer <= 0 && s.gear < car.gears.length) {
    const gi = s.gear - 1;
    const q: ShiftQuality = s.rpm >= z.perfLo[gi] && s.rpm <= z.perfHi[gi] ? 'perfect'
      : s.rpm < z.perfLo[gi] - 700 ? 'early' : s.rpm > z.perfHi[gi] ? 'late' : 'good';
    const grind = !cfg.semiAuto && thr > 0;
    let t = car.shiftTime * (q === 'perfect' ? 0.62 : q === 'early' ? 1.15 : q === 'late' ? 1.25 : 1) * (cfg.semiAuto ? 1.12 : 1);
    if (grind) { s.wear.gearbox += 0.9 * car.wearMul.gearbox; s.grinds++; t *= 0.92; }
    s.shiftTimer = t;
    s.pendingGear = s.gear + 1;
    s.shiftFlare = grind;
    s.shifts++;
    if (q === 'perfect') s.perfect++; else if (q === 'early') s.early++; else if (q === 'late') s.late++;
    if (q === 'perfect') s.perfT = 0.55;
    s.events.push({ e: 'shift', q, up: true, grind, gear: s.gear + 1 });
  } else if (s.wantDown && s.shiftTimer <= 0 && s.gear > 1) {
    const newRpm = coupled * car.gears[s.gear - 2] / car.gears[s.gear - 1];
    if (newRpm > car.limiter + 200) { s.wear.engine += 4 * car.wearMul.engine; s.events.push({ e: 'overrev' }); }
    const grind = !cfg.semiAuto && thr > 0;
    if (grind) { s.wear.gearbox += 0.9 * car.wearMul.gearbox; s.grinds++; }
    s.shiftTimer = car.shiftTime;
    s.pendingGear = s.gear - 1;
    s.shiftFlare = grind;
    s.events.push({ e: 'shift', q: 'good', up: false, grind, gear: s.gear - 1 });
  }
  s.wantUp = s.wantDown = false;

  // Нитро
  if (s.wantNitro && !s.nitroUsed && car.nitroPower > 0) {
    s.nitroUsed = true;
    s.nitroLeft = car.nitroDur;
    s.wear.engine += 1.5 * car.wearMul.engine;
    s.wear.nitro += 6;
    s.events.push({ e: 'nitro' });
  }
  s.wantNitro = false;

  let force = 0;
  s.spin = false;
  if (s.shiftTimer > 0) {
    // Сцепление разомкнуто во время переключения
    s.shiftTimer -= DT;
    if (s.shiftFlare && thr > 0) s.rpm = Math.min(car.limiter, s.rpm + 4000 * DT);
    else s.rpm = Math.max(car.idle, s.rpm - 2600 * DT);
    if (s.shiftTimer <= 0) {
      s.gear = s.pendingGear;
      const nr = (s.v / car.r) * RPM_K * car.gears[s.gear - 1] * car.fd;
      s.rpm = Math.max(car.idle, Math.min(car.limiter, nr));
      s.spinExcess = 0;
    }
  } else {
    let mult = 1;
    if (s.nitroLeft > 0) mult += car.nitroPower;
    if (s.perfT > 0) mult += 0.06;
    let tq = engineTq(car, s.rpm, s.boost) * mult * thr;
    if (s.limiterT > 0) { tq = 0; s.limiterT -= DT; }
    let demand = (tq * ratio * car.eff) / car.r;
    if (s.slipping) demand *= car.clutchGrip * 1.12;
    const tmax = tractionMax(car, cfg.mu, s.a);
    if (demand > tmax) {
      s.spin = true;
      force = tmax * 0.86;
      s.spinExcess = Math.min(2600, s.spinExcess + (demand / tmax - 1) * 3200 * DT);
      s.wear.tires += 2.2 * car.wearMul.tires * DT;
    } else {
      force = demand;
      s.spinExcess = Math.max(0, s.spinExcess - 3500 * DT);
      if (s.spinExcess > 200) s.spin = true;
    }
    if (s.slipping) {
      // Сцепление проскальзывает: обороты плавно сводятся к оборотам колёс.
      const floor = Math.max(coupled, car.idle * 1.1);
      s.rpm += (floor + s.spinExcess * 0.5 - s.rpm) * Math.min(1, 4.5 * DT);
      if (s.rpm - coupled < 120 || s.tick - s.launchTick > TICK_HZ * 2) s.slipping = false;
      s.wear.clutch += 0.25 * car.wearMul.clutch * DT;
    } else {
      s.rpm = Math.max(car.idle * 0.9, coupled + s.spinExcess);
    }
    if (s.rpm >= car.limiter) {
      s.rpm = car.limiter;
      s.limiterT = 0.06;
      s.events.push({ e: 'limiter' });
    }
  }

  if (s.rpm > car.redline * 0.97) s.wear.engine += 1.1 * car.wearMul.engine * DT;
  if (s.nitroLeft > 0) s.nitroLeft -= DT;
  if (s.perfT > 0) s.perfT -= DT;

  const drag = 0.5 * RHO * car.cda * s.v * s.v;
  const roll = s.v > 0.05 ? car.crr * car.mass * G : 0;
  const inertia = car.mass * (1.04 + 0.0025 * ratio * ratio);
  s.a = (force - drag - roll) / inertia;
  const prevX = s.x;
  s.v = Math.max(0, s.v + s.a * DT);
  s.x += s.v * DT;
  if (s.v > s.topSpeed) s.topSpeed = s.v;
  s.tick++;

  if (s.x >= cfg.distance) {
    const frac = (cfg.distance - prevX) / (s.x - prevX);
    s.finishT = (s.tick - 1 + frac - cfg.greenTick) / TICK_HZ;
    s.finishV = s.v;
    s.finished = true;
    s.events.push({ e: 'finish' });
    finishTick(s);
  } else if (s.tick > cfg.greenTick + MAX_RACE_S * TICK_HZ) {
    s.finished = true; s.dnf = true;
  }
}

function finishTick(s: SimState) {
  // базовый износ за заезд
  s.wear.engine += 0.25; s.wear.gearbox += 0.1 * s.shifts; s.wear.clutch += 0.3;
  s.wear.tires += 0.35; s.wear.suspension += 0.2; s.wear.turbo += 0.15; s.wear.weight += 0.1;
}

export function toResult(s: SimState): RunResult {
  const r = (n: number) => Math.round(n * 100) / 100;
  const wear = {} as Record<PartKind, number>;
  for (const k of Object.keys(s.wear) as PartKind[]) wear[k] = r(s.wear[k]);
  return {
    time: s.falseStart || s.dnf ? 0 : Math.round(s.finishT * 1000) / 1000,
    finishV: r(s.finishV),
    reaction: s.launchTick >= 0 ? 0 : 0,
    falseStart: s.falseStart, dnf: s.dnf,
    shifts: s.shifts, perfectShifts: s.perfect, earlyShifts: s.early, lateShifts: s.late, grinds: s.grinds,
    launch: s.launchQ, nitroUsed: s.nitroUsed, wear, topSpeed: r(s.topSpeed), ticks: s.tick,
  };
}

/** Полный прогон заезда по записи нажатий (сервер, призраки). */
export function runSim(cfg: SimConfig, inputs: InputEvent[]): RunResult {
  const s = createSim(cfg);
  while (!s.finished) stepSim(s, cfg, inputs);
  const res = toResult(s);
  res.reaction = s.launchTick >= 0 ? Math.round(((s.launchTick - cfg.greenTick) / TICK_HZ) * 1000) / 1000 : 0;
  return res;
}

export function resultFromState(s: SimState, cfg: SimConfig): RunResult {
  const res = toResult(s);
  res.reaction = s.launchTick >= 0 ? Math.round(((s.launchTick - cfg.greenTick) / TICK_HZ) * 1000) / 1000 : 0;
  return res;
}

/** Проверка правдоподобия записи нажатий. */
export function validateInputs(inputs: unknown, maxTick: number): string | null {
  if (!Array.isArray(inputs)) return 'Неверный формат';
  if (inputs.length > 4000) return 'Слишком много событий';
  let last = -1;
  const perSecond = new Map<number, number>();
  for (const ev of inputs) {
    if (!Array.isArray(ev) || ev.length !== 3) return 'Неверное событие';
    const [t, c, v] = ev;
    if (!Number.isInteger(t) || t < 0 || t > maxTick) return 'Тик вне диапазона';
    if (t < last) return 'События не по порядку';
    if (![0, 1, 2, 3, 4].includes(c)) return 'Неизвестный код';
    if (v !== 0 && v !== 1) return 'Неверное значение';
    last = t;
    const sec = Math.floor(t / TICK_HZ);
    const n = (perSecond.get(sec) ?? 0) + 1;
    if (n > 40) return 'Нечеловеческая частота нажатий';
    perSecond.set(sec, n);
  }
  return null;
}
