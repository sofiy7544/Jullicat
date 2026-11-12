import { CAR_MAP, baseCurve, type CarDef } from './cars';
import type { OwnedCar, PartKind, PartState, SimCar, Visual } from './types';
import { PART_KINDS } from './types';

export interface PartDef {
  kind: PartKind;
  name: string;
  icon: string;
  base: number;      // базовая цена
  repair: number;    // цена ремонта 1% состояния (×уровень)
  desc: string;
  tradeoff: string;
  levels: string[];
}

export const PARTS: Record<PartKind, PartDef> = {
  engine: { kind: 'engine', name: 'Двигатель', icon: '⚙', base: 1300, repair: 9, desc: '+момент по всей кривой, выше отсечка',
    tradeoff: 'Ур.3+: ускоряет износ коробки', levels: ['Сток', 'Чип-тюнинг', 'Распредвалы', 'Кованая поршневая', 'Расточка', 'Гоночный блок'] },
  turbo: { kind: 'turbo', name: 'Турбина', icon: '🌀', base: 1600, repair: 8, desc: 'Наддув на высоких оборотах, есть турбояма',
    tradeoff: 'Сильнее изнашивает сцепление и двигатель, больше турбояма', levels: ['Нет/сток', 'Малая', 'Средняя', 'Twin-scroll', 'Большая', 'Гибрид'] },
  intake: { kind: 'intake', name: 'Впуск', icon: '💨', base: 520, repair: 3, desc: '+момент на верхах', tradeoff: '—',
    levels: ['Сток', 'Нулевик', 'Холодный впуск', 'Ресивер', 'Дроссели', 'Карбон-впуск'] },
  exhaust: { kind: 'exhaust', name: 'Выхлоп', icon: '🔥', base: 600, repair: 3, desc: '+момент на верхах, легче на пару кг',
    tradeoff: '—', levels: ['Сток', 'Прямоток', 'Паук 4-2-1', 'Титан', 'Даунпайп', 'Гоночный'] },
  gearbox: { kind: 'gearbox', name: 'Коробка', icon: '⇅', base: 950, repair: 6, desc: 'Быстрее переключение; с ур.2 — настройка передач',
    tradeoff: 'Переключение без сброса газа быстро её убивает', levels: ['Сток', 'Короткий ход', 'Спорт (настройка)', 'Кулачковая', 'Секвентальная', 'Гоночная'] },
  clutch: { kind: 'clutch', name: 'Сцепление', icon: '◎', base: 720, repair: 5, desc: 'Лучше старт, держит больше момента',
    tradeoff: 'Ур.4+: резче хватает — выше риск пробуксовки', levels: ['Сток', 'Усиленное', 'Металлокерамика', 'Двухдисковое', 'Трёхдисковое', 'Карбоновое'] },
  tires: { kind: 'tires', name: 'Шины', icon: '◉', base: 620, repair: 4, desc: '+сцепление с покрытием', tradeoff: 'Мягкие шины быстрее стираются',
    levels: ['Сток', 'Спорт', 'Полуслики', 'Слики', 'Драг-слики', 'Про-слики'] },
  suspension: { kind: 'suspension', name: 'Подвеска', icon: '⌇', base: 700, repair: 4, desc: 'Перенос веса на ведущую ось',
    tradeoff: '—', levels: ['Сток', 'Пружины', 'Койловеры', 'Драг-амортизаторы', 'Регулируемая', 'Pro-Drag'] },
  weight: { kind: 'weight', name: 'Облегчение', icon: '⚖', base: 1050, repair: 5, desc: '−масса кузова',
    tradeoff: 'Ур.3+: лёгкий передок — для заднего привода хуже на старте не будет, а кузов быстрее «устаёт»', levels: ['Сток', 'Без запаски', 'Без салона', 'Карбон капот', 'Лексан стёкла', 'Каркас'] },
  nitro: { kind: 'nitro', name: 'Нитро', icon: '⚡', base: 1150, repair: 4, desc: 'Разовый мощный впрыск за заезд',
    tradeoff: 'Каждое использование изнашивает двигатель', levels: ['Нет', 'Баллон 5 lb', 'Баллон 10 lb', 'Двойной', 'Сухой впрыск', 'Прямой впрыск'] },
};

const PRICE_STEPS = [0, 1, 2.3, 4.2, 7.2, 11.5];
export const PART_UNLOCK = [0, 1, 4, 8, 12, 17];
export const PART_GOLD = [0, 0, 0, 0, 3, 8];

export function partMult(c: CarDef) { return 0.6 + c.price / 50000; }

export function partPrice(kind: PartKind, lvl: number, carId: string) {
  const c = CAR_MAP[carId];
  return Math.round((PARTS[kind].base * PRICE_STEPS[lvl] * partMult(c)) / 10) * 10;
}

export function repairCost(kind: PartKind, p: PartState, carId: string) {
  const c = CAR_MAP[carId];
  const missing = 100 - p.cond;
  if (missing <= 0.5) return 0;
  return Math.max(10, Math.round(missing * PARTS[kind].repair * (1 + p.lvl * 0.45) * (0.5 + partMult(c) * 0.6)));
}

/** Коэффициент работоспособности по состоянию детали. */
export function condFactor(cond: number) {
  return cond >= 60 ? 1 : 0.7 + (0.3 * cond) / 60;
}

export function defaultVisual(carId: string): Visual {
  return { paint: CAR_MAP[carId]?.color ?? '#cccccc', paint2: '#000000', rims: 0, rimColor: '#c0c6cc', spoiler: 0, kit: 0, tint: 1, glow: null, vinyls: [] };
}

export function newOwnedCar(carId: string, uidStr: string, tune = 0): OwnedCar {
  const parts = {} as Record<PartKind, PartState>;
  for (const k of PART_KINDS) parts[k] = { lvl: Math.min(5, Math.max(0, Math.round(tune))), cond: 100 };
  const c = CAR_MAP[carId];
  return { uid: uidStr, carId, parts, gearTune: c.gears.map(() => 1), finalTune: 1, visual: defaultVisual(carId), races: 0 };
}

export function interp(xs: number[], ys: number[], x: number): number {
  if (x <= xs[0]) return ys[0];
  const n = xs.length - 1;
  if (x >= xs[n]) return ys[n];
  for (let i = 0; i < n; i++) {
    if (x <= xs[i + 1]) {
      const k = (x - xs[i]) / (xs[i + 1] - xs[i]);
      return ys[i] + (ys[i + 1] - ys[i]) * k;
    }
  }
  return ys[n];
}

/** Строит физические характеристики машины с учётом деталей, износа и настройки КПП. */
export function buildSimCar(car: OwnedCar): SimCar {
  const c = CAR_MAP[car.carId];
  const P = car.parts;
  const ts = c.tuneScale;
  const L = (k: PartKind) => P[k]?.lvl ?? 0;
  const F = (k: PartKind) => condFactor(P[k]?.cond ?? 100);

  const redline = c.redline + 150 * L('engine') + 50 * L('intake');
  const limiter = redline + 300;
  const base = baseCurve(c);
  const stretch = redline / c.redline;
  const rpmPts = base.rpm.map((r, i) => (i === 0 ? r : r * (i >= 3 ? stretch : 1)));
  rpmPts[rpmPts.length - 1] = limiter;
  const engGain = 1 + 0.055 * L('engine') * ts;
  const topGain = (0.028 * L('intake') + 0.028 * L('exhaust')) * ts;
  const tqPts = base.tq.map((t, i) => {
    const hi = rpmPts[i] / redline;
    return t * (engGain + topGain * (0.4 + hi)) * F('engine') * (0.85 + 0.15 * ((F('intake') + F('exhaust')) / 2));
  });

  const turboL = L('turbo');
  const boostMax = (c.boost + 0.1 * turboL * ts) * F('turbo');
  const spoolRpm = c.idle + (redline - c.idle) * (0.32 + 0.035 * turboL);
  const spoolRate = 2.6 - 0.22 * turboL;

  const gears = c.gears.map((g, i) => g * (car.gearTune[i] ?? 1));
  const fd = c.fd * (car.finalTune || 1);

  const mass = c.mass * (1 - 0.032 * L('weight')) - 2 * L('exhaust');
  const grip = (1 + 0.075 * L('tires')) * F('tires') * (1 + 0.02 * L('suspension') * F('suspension'));
  const transfer = 0.1 + 0.025 * L('suspension') * F('suspension');
  const shiftTime = (0.34 - 0.04 * L('gearbox')) / F('gearbox');
  const clutchGrip = (0.9 + 0.028 * L('clutch')) * (0.75 + 0.25 * F('clutch'));
  const nL = L('nitro');
  const nitroPower = nL > 0 ? (0.16 + 0.085 * (nL - 1)) * F('nitro') : 0;
  const nitroDur = nL > 0 ? 2 + 0.45 * nL : 0;

  return {
    carId: c.id, mass, drive: c.drive, driveFrac: c.driveFrac,
    rpmPts, tqPts, idle: c.idle, redline, limiter,
    gears, fd, r: c.r, cda: c.cd * c.area, crr: 0.013,
    grip, transfer, boostMax, spoolRpm, spoolRate, shiftTime, clutchGrip, nitroPower, nitroDur,
    eff: 0.88,
    wearMul: {
      engine: 1 + 0.16 * turboL + (L('engine') >= 3 ? 0.1 * L('engine') : 0) + 0.06 * nL,
      gearbox: 1 + (L('engine') >= 3 ? 0.12 * L('engine') : 0) + 0.06 * turboL - 0.05 * L('gearbox'),
      clutch: 1 + 0.18 * turboL + 0.05 * L('engine') + (L('clutch') >= 4 ? 0.1 : 0) - 0.07 * L('clutch'),
      tires: 1 + 0.08 * L('tires') + 0.05 * turboL,
    },
  };
}

/** Момент двигателя при полном газе с полным наддувом — для диностенда. */
export function torqueAt(s: SimCar, rpm: number, boost = 1) {
  const spool = rpm < s.spoolRpm ? Math.max(0, (rpm - s.idle) / (s.spoolRpm - s.idle)) * 0.45 : 1;
  return interp(s.rpmPts, s.tqPts, rpm) * (1 + s.boostMax * boost * spool);
}

export function peakPower(s: SimCar) {
  let best = 0, bestRpm = 0, bestTq = 0;
  for (let r = s.idle; r <= s.limiter; r += 50) {
    const t = torqueAt(s, r);
    const kw = (t * r) / 9549;
    if (kw > best) { best = kw; bestRpm = r; }
    if (t > bestTq) bestTq = t;
  }
  return { kw: best, hp: best * 1.36, rpm: bestRpm, tq: bestTq };
}

/** Стоимость визуальных изменений */
export const RIMS = ['Сток', 'Звезда', 'Сетка', 'Турбина', 'Спицы', 'Моноблок'];
export const SPOILERS = ['Нет', 'Губа', 'Утка', 'Крыло'];
export const KITS = ['Сток', 'Юбки', 'Широкий', 'Тайм-аттак'];
export const TINTS = ['Нет', 'Лёгкая', 'Средняя', 'Лимузин'];
export const VISUAL_PRICE = {
  paint: 250, paint2: 150, rims: [0, 400, 600, 800, 1000, 1500], rimColor: 120, spoiler: [0, 300, 600, 1200], kit: [0, 800, 1800, 3000],
  tint: [0, 150, 250, 400], glow: 700, vinylBase: 100, vinylLayer: 30,
};
export const VISUAL_GOLD = { rims: [0, 0, 0, 0, 0, 5], kit: [0, 0, 0, 6], spoiler: [0, 0, 0, 0] };
