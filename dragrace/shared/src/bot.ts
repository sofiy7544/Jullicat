import { createSim, stepSim, type SimConfig, type SimState, TICK_HZ, resultFromState } from './physics';
import { buildSimCar, newOwnedCar } from './parts';
import { mulberry32 } from './rng';
import type { InputEvent, RunResult, SimCar } from './types';

/** Генерирует ввод бота тик за тиком; детерминирован по сиду. */
export class BotDriver {
  private rng: () => number;
  reactionTicks: number;
  launchTarget: number;
  shiftOffset: number[];
  nitroGear: number;
  log: InputEvent[] = [];
  private thr = 0; private clutch = 0; private launched = false; private lastToggle = -99;
  constructor(public skill: number, seed: number, private cfg: SimConfig, s: SimState) {
    this.rng = mulberry32(seed);
    const sk = Math.max(0, Math.min(1, skill));
    this.reactionTicks = Math.round((0.14 + (1 - sk) * 0.32 + this.rng() * 0.12) * TICK_HZ);
    const z = s.zones;
    const mid = (z.launchLo + z.launchHi) / 2;
    this.launchTarget = mid + (this.rng() - 0.5) * (1 - sk) * 2400;
    this.shiftOffset = cfg.car.gears.map(() => (this.rng() - 0.6) * (1 - sk) * 1600);
    this.nitroGear = 2 + Math.floor(this.rng() * 2);
  }
  private push(t: number, c: 0 | 1 | 2 | 3 | 4, v: number) { this.log.push([t, c, v]); }
  /** Вызывается до stepSim, добавляет события на текущий тик. */
  control(s: SimState) {
    const t = s.tick;
    if (!s.launched) {
      if (!this.clutch) { this.clutch = 1; this.push(t, 1, 1); }
      // гистерезис, как у человека: газ «пульсирует» не чаще нескольких раз в секунду
      const want = this.thr ? (s.rpm < this.launchTarget + 250 ? 1 : 0) : (s.rpm < this.launchTarget - 350 ? 1 : 0);
      if (t >= this.cfg.greenTick + this.reactionTicks && !this.launched) {
        this.launched = true;
        if (!this.thr) { this.thr = 1; this.push(t, 0, 1); }
        this.clutch = 0; this.push(t, 1, 0);
        return;
      }
      if (want !== this.thr && t - this.lastToggle > 9) { this.thr = want; this.lastToggle = t; this.push(t, 0, want); }
      return;
    }
    if (!this.thr && s.shiftTimer <= 0) { this.thr = 1; this.push(t, 0, 1); }
    const gi = s.gear - 1;
    if (s.shiftTimer <= 0 && s.gear < this.cfg.car.gears.length && !s.slipping) {
      const target = s.zones.optimal[gi] + this.shiftOffset[gi];
      if (s.rpm >= Math.min(target, this.cfg.car.limiter - 20)) this.push(t, 2, 1);
    }
    if (!s.nitroUsed && s.gear >= this.nitroGear && this.cfg.car.nitroPower > 0) this.push(t, 4, 1);
  }
}

/** Прогоняет бота до финиша; возвращает результат и запись ввода. */
export function runBot(cfg: SimConfig, skill: number, seed: number): { result: RunResult; inputs: InputEvent[] } {
  const s = createSim(cfg);
  const bot = new BotDriver(skill, seed, cfg, s);
  while (!s.finished) {
    bot.control(s);
    stepSim(s, cfg, bot.log);
  }
  return { result: resultFromState(s, cfg), inputs: bot.log };
}

export function botSimCar(carId: string, tune: number): SimCar {
  const lvl = Math.floor(tune);
  const frac = tune - lvl;
  const oc = newOwnedCar(carId, 'bot', lvl);
  // дробная часть — несколько деталей уровнем выше
  const order = ['tires', 'engine', 'turbo', 'clutch', 'gearbox', 'intake', 'exhaust', 'suspension', 'weight', 'nitro'] as const;
  const extra = Math.round(frac * order.length);
  for (let i = 0; i < extra; i++) oc.parts[order[i]].lvl = Math.min(5, lvl + 1);
  return buildSimCar(oc);
}

/** Оценка «силы машины» — время 402 м идеальным ботом на эталонном покрытии. */
export function performanceIndex(car: SimCar): number {
  const cfg: SimConfig = { car, mu: 1, distance: 402, greenTick: 10, semiAuto: true };
  const r = runBot(cfg, 1, 7).result;
  return r.time || 30;
}

/** 0–100 км/ч оценочно */
export function estimate0to100(car: SimCar): number {
  const cfg: SimConfig = { car, mu: 1, distance: 2000, greenTick: 10, semiAuto: true };
  const s = createSim(cfg);
  const bot = new BotDriver(1, 7, cfg, s);
  bot.reactionTicks = 0;
  while (!s.finished && s.v < 100 / 3.6) { bot.control(s); stepSim(s, cfg, bot.log); }
  return (s.tick - cfg.greenTick) / TICK_HZ;
}
