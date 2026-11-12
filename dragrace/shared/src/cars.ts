import type { BodyType, Drive } from './types';

// Все марки и модели вымышленные.
export interface CarDef {
  id: string;
  maker: string;
  model: string;
  body: BodyType;
  drive: Drive;
  tier: 'D' | 'C' | 'B' | 'A' | 'S';
  price: number;
  gold: number;
  unlock: number;
  mass: number;
  driveFrac: number;
  peakNm: number;
  peakRpm: number;
  idle: number;
  redline: number;
  gears: number[];
  fd: number;
  r: number;
  cd: number;
  area: number;
  boost: number;      // заводской наддув (0 — атмосферный)
  tuneScale: number;  // насколько машина «отзывается» на тюнинг
  length: number;     // м, для отрисовки
  color: string;
  blurb: string;
}

export const CARS: CarDef[] = [
  { id: 'borka', maker: 'Borka', model: 'Pchela', body: 'hatch', drive: 'FWD', tier: 'D', price: 0, gold: 0, unlock: 1,
    mass: 920, driveFrac: 0.62, peakNm: 118, peakRpm: 3600, idle: 850, redline: 6300,
    gears: [3.45, 2.0, 1.36, 1.03, 0.82], fd: 4.1, r: 0.28, cd: 0.36, area: 1.9, boost: 0, tuneScale: 1.4,
    length: 3.7, color: '#f2c14e', blurb: 'Народная «пчёлка». Лёгкая и неубиваемая, тюнинг раскрывает её с неожиданной стороны.' },
  { id: 'velmor', maker: 'Velmor', model: 'Kit 1.6', body: 'hatch', drive: 'FWD', tier: 'D', price: 6500, gold: 0, unlock: 2,
    mass: 1040, driveFrac: 0.61, peakNm: 152, peakRpm: 4200, idle: 800, redline: 6600,
    gears: [3.3, 1.94, 1.31, 1.03, 0.84], fd: 4.06, r: 0.29, cd: 0.34, area: 2.0, boost: 0, tuneScale: 1.15,
    length: 3.95, color: '#4ea3f2', blurb: 'Городской хэтчбек с бодрым шестнадцатиклапанником.' },
  { id: 'tornik', maker: 'Tornik', model: 'Taiga 4x4', body: 'wagon', drive: 'AWD', tier: 'D', price: 9000, gold: 0, unlock: 3,
    mass: 1360, driveFrac: 1, peakNm: 196, peakRpm: 3800, idle: 800, redline: 6000,
    gears: [3.6, 2.1, 1.4, 1.0, 0.8], fd: 4.3, r: 0.31, cd: 0.4, area: 2.3, boost: 0, tuneScale: 1.2,
    length: 4.5, color: '#6fbf73', blurb: 'Полный привод и стартует как с катапульты. Тяжеловат, зато не буксует.' },
  { id: 'saphyr', maker: 'Saphyr', model: 'Lumen 2.0', body: 'sedan', drive: 'FWD', tier: 'C', price: 13500, gold: 0, unlock: 4,
    mass: 1260, driveFrac: 0.6, peakNm: 205, peakRpm: 4500, idle: 750, redline: 6900,
    gears: [3.25, 1.9, 1.3, 1.0, 0.82], fd: 4.0, r: 0.31, cd: 0.31, area: 2.1, boost: 0, tuneScale: 1.0,
    length: 4.6, color: '#d9d9e0', blurb: 'Солидный седан. Дорогой в обслуживании, но тюнингу поддаётся неохотно.' },
  { id: 'kastor', maker: 'Kastor', model: 'Ryssa RT', body: 'hatch', drive: 'FWD', tier: 'C', price: 15500, gold: 0, unlock: 5,
    mass: 1130, driveFrac: 0.63, peakNm: 200, peakRpm: 3800, idle: 900, redline: 6900,
    gears: [3.38, 2.05, 1.41, 1.12, 0.92, 0.78], fd: 3.94, r: 0.3, cd: 0.33, area: 2.0, boost: 0.3, tuneScale: 1.5,
    length: 4.05, color: '#e8452c', blurb: 'Заряженный турбо-хэтч. Дешёвый, злой и любит наддув.' },
  { id: 'orvel', maker: 'Orvel', model: 'Dynamo', body: 'sedan', drive: 'RWD', tier: 'C', price: 21000, gold: 0, unlock: 7,
    mass: 1320, driveFrac: 0.52, peakNm: 250, peakRpm: 4400, idle: 750, redline: 7000,
    gears: [3.6, 2.12, 1.4, 1.0, 0.81], fd: 3.7, r: 0.31, cd: 0.32, area: 2.1, boost: 0, tuneScale: 1.15,
    length: 4.7, color: '#7a4ff2', blurb: 'Заднеприводная классика. Учит работать педалью газа.' },
  { id: 'neris', maker: 'Neris', model: 'Kaze', body: 'coupe', drive: 'RWD', tier: 'B', price: 29000, gold: 0, unlock: 9,
    mass: 1250, driveFrac: 0.53, peakNm: 230, peakRpm: 4800, idle: 900, redline: 7600,
    gears: [3.48, 2.2, 1.55, 1.18, 0.94, 0.79], fd: 3.9, r: 0.31, cd: 0.31, area: 1.95, boost: 0.35, tuneScale: 1.6,
    length: 4.4, color: '#ffffff', blurb: 'Тихоня на складе, ракета после тюнинга. Лучший потенциал в своём классе.' },
  { id: 'gromada', maker: 'Gromada', model: 'Bizon V8', body: 'muscle', drive: 'RWD', tier: 'B', price: 38000, gold: 0, unlock: 11,
    mass: 1660, driveFrac: 0.5, peakNm: 470, peakRpm: 4000, idle: 700, redline: 6200,
    gears: [2.97, 2.07, 1.43, 1.0, 0.84], fd: 3.55, r: 0.33, cd: 0.38, area: 2.3, boost: 0, tuneScale: 1.05,
    length: 4.9, color: '#1f2a44', blurb: 'Восемь цилиндров и море момента. Сцепления вечно не хватает.' },
  { id: 'morra', maker: 'Morra', model: 'Fantom', body: 'roadster', drive: 'RWD', tier: 'B', price: 46000, gold: 0, unlock: 13,
    mass: 1010, driveFrac: 0.55, peakNm: 255, peakRpm: 5600, idle: 950, redline: 8000,
    gears: [3.3, 2.15, 1.6, 1.25, 1.0, 0.84], fd: 4.1, r: 0.3, cd: 0.33, area: 1.75, boost: 0, tuneScale: 1.2,
    length: 4.0, color: '#2bd4c0', blurb: 'Лёгкий родстер с высокооборотистым мотором.' },
  { id: 'altavia', maker: 'Altavia', model: 'Strela', body: 'coupe', drive: 'AWD', tier: 'A', price: 68000, gold: 0, unlock: 15,
    mass: 1460, driveFrac: 1, peakNm: 330, peakRpm: 4200, idle: 900, redline: 7300,
    gears: [3.45, 2.12, 1.52, 1.17, 0.94, 0.78], fd: 3.8, r: 0.32, cd: 0.32, area: 2.0, boost: 0.3, tuneScale: 1.3,
    length: 4.5, color: '#3355ff', blurb: 'Полноприводное турбокупе: старт без единой пробуксовки.' },
  { id: 'vortan', maker: 'Vortan', model: 'Shtorm', body: 'super', drive: 'AWD', tier: 'S', price: 125000, gold: 0, unlock: 20,
    mass: 1620, driveFrac: 1, peakNm: 470, peakRpm: 4600, idle: 950, redline: 7400,
    gears: [3.1, 2.08, 1.54, 1.2, 0.96, 0.8], fd: 3.6, r: 0.34, cd: 0.3, area: 2.0, boost: 0.25, tuneScale: 1.1,
    length: 4.7, color: '#9aa4b0', blurb: 'Технологичный суперкар. Быстр из коробки, но тюнинг даёт меньше.' },
  { id: 'ezzar', maker: 'Ezzar', model: 'Meridian', body: 'super', drive: 'RWD', tier: 'S', price: 185000, gold: 60, unlock: 26,
    mass: 1470, driveFrac: 0.56, peakNm: 600, peakRpm: 6000, idle: 1000, redline: 8300,
    gears: [3.2, 2.2, 1.65, 1.3, 1.06, 0.88, 0.74], fd: 3.4, r: 0.34, cd: 0.29, area: 1.95, boost: 0, tuneScale: 0.85,
    length: 4.6, color: '#c8102e', blurb: 'Самый дорогой и капризный. Прокачанная «пчёлка» может его унизить.' },
];

export const CAR_MAP: Record<string, CarDef> = Object.fromEntries(CARS.map((c) => [c.id, c]));
export const carName = (id: string) => {
  const c = CAR_MAP[id];
  return c ? `${c.maker} ${c.model}` : id;
};

/** Базовая кривая момента (атмосферная часть), линейная интерполяция по точкам. */
export function baseCurve(c: CarDef): { rpm: number[]; tq: number[] } {
  const limiter = c.redline + 300;
  const p = c.peakNm;
  const turbo = c.boost > 0;
  const rpm = [c.idle, c.idle + (c.peakRpm - c.idle) * 0.5, c.peakRpm, c.peakRpm + (c.redline - c.peakRpm) * 0.55, c.redline, limiter];
  const tq = turbo
    ? [p * 0.62, p * 0.86, p, p * 0.95, p * 0.82, p * 0.74]
    : [p * 0.66, p * 0.88, p, p * 0.93, p * 0.79, p * 0.7];
  return { rpm, tq };
}
