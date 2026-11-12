// Общие типы для клиента и сервера.

export type Drive = 'FWD' | 'RWD' | 'AWD';
export type BodyType = 'hatch' | 'sedan' | 'wagon' | 'coupe' | 'muscle' | 'roadster' | 'super';
export type PartKind =
  | 'engine' | 'turbo' | 'intake' | 'exhaust' | 'gearbox'
  | 'clutch' | 'tires' | 'suspension' | 'weight' | 'nitro';

export const PART_KINDS: PartKind[] = [
  'engine', 'turbo', 'intake', 'exhaust', 'gearbox',
  'clutch', 'tires', 'suspension', 'weight', 'nitro',
];

export type Distance = 201 | 402 | 804;
export const DISTANCES: Distance[] = [201, 402, 804];

export interface PartState { lvl: number; cond: number }

export type VinylKind = 'text' | 'shape' | 'sticker';
export interface Vinyl {
  id: string;
  kind: VinylKind;
  /** Координаты в системе кузова: 0..1 по длине, 0..1 по высоте */
  x: number; y: number;
  s: number; r: number;
  color: string;
  text?: string;
  shape?: string;
  sticker?: string;
  flip?: boolean;
}

export interface Visual {
  paint: string;
  paint2: string;
  rims: number;
  rimColor: string;
  spoiler: number;
  kit: number;
  tint: number;
  glow: string | null;
  vinyls: Vinyl[];
}

export interface OwnedCar {
  uid: string;
  carId: string;
  parts: Record<PartKind, PartState>;
  gearTune: number[];
  finalTune: number;
  visual: Visual;
  races: number;
}

export interface DailyTask { id: string; progress: number; goal: number; claimed: boolean }

export interface ProfileStats {
  races: number; wins: number; losses: number;
  perfectShifts: number; falseStarts: number;
  bestTimes: Partial<Record<Distance, number>>;
  bestReaction: number | null;
  bossesBeaten: number;
  onlineWins: number;
  nitroUses: number;
  tournamentTop3: number;
}

export interface Profile {
  id: string;
  nick: string;
  money: number;
  gold: number;
  xp: number;
  level: number;
  fuel: number;
  fuelAt: number;
  bonusAt: number;
  repairKits: number;
  cars: OwnedCar[];
  currentCar: string;
  career: { league: number; beaten: number };
  daily: { date: string; tasks: DailyTask[] };
  achievements: string[];
  stats: ProfileStats;
  tutorialDone: boolean;
  createdAt: number;
}

/** Характеристики машины для физической симуляции (результат тюнинга и износа). */
export interface SimCar {
  carId: string;
  mass: number;
  drive: Drive;
  driveFrac: number;
  rpmPts: number[];
  tqPts: number[];
  idle: number;
  redline: number;
  limiter: number;
  gears: number[];
  fd: number;
  r: number;
  cda: number;
  crr: number;
  grip: number;
  transfer: number;
  boostMax: number;
  spoolRpm: number;
  spoolRate: number;
  shiftTime: number;
  clutchGrip: number;
  nitroPower: number;
  nitroDur: number;
  eff: number;
  wearMul: { engine: number; gearbox: number; clutch: number; tires: number };
}

/** Код события ввода: 0 газ, 1 сцепление/тормоз, 2 передача вверх, 3 вниз, 4 нитро */
export type InputCode = 0 | 1 | 2 | 3 | 4;
/** [тик, код, значение] */
export type InputEvent = [number, InputCode, number];

export interface RunResult {
  time: number;         // от зелёного сигнала до финиша, с (включает реакцию)
  finishV: number;      // м/с
  reaction: number;     // с
  falseStart: boolean;
  dnf: boolean;
  shifts: number;
  perfectShifts: number;
  earlyShifts: number;
  lateShifts: number;
  grinds: number;
  launch: 'perfect' | 'spin' | 'bog' | 'none';
  nitroUsed: boolean;
  wear: Record<PartKind, number>;
  topSpeed: number;
  ticks: number;
}

export type OpponentSpec =
  | { type: 'bot'; name: string; carId: string; tune: number; skill: number; visual?: Visual; boss?: boolean }
  | { type: 'ghost'; ghostId: string; userId: string; name: string; carId: string; simCar: SimCar; inputs: InputEvent[]; visual: Visual; semiAuto: boolean; green: number }
  | { type: 'remote'; userId: string; name: string; carId: string; simCar: SimCar; visual: Visual };

export type RaceKind = 'quick' | 'career' | 'ghost' | 'tournament' | 'online';

export interface RaceContext {
  raceId: string;
  kind: RaceKind;
  trackId: string;
  distance: Distance;
  carUid: string;
  seed: number;
  opponent: OpponentSpec;
  bet: number;
  careerStep?: { league: number; index: number };
  startedAt: number;
  tutorial?: boolean;
}

export interface RaceRewards {
  money: number;
  xp: number;
  gold: number;
  win: boolean;
  record: boolean;
  levelUp: boolean;
  newAchievements: string[];
  careerAdvanced: boolean;
  wearApplied: Record<PartKind, number>;
  bet: number;
}

export interface PublicCar { carId: string; visual: Visual; parts: Record<PartKind, PartState>; pi: number; name: string }

export interface PublicProfile {
  id: string; nick: string; level: number; xp: number;
  stats: ProfileStats; achievements: string[];
  cars: PublicCar[]; currentCar: string; online?: boolean; isFriend?: boolean; friendState?: string;
}
