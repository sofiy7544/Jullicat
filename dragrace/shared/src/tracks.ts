export type Scenery = 'industrial' | 'downtown' | 'port' | 'highway' | 'airfield' | 'bridge';

export interface TrackDef {
  id: string;
  name: string;
  short: string;
  scenery: Scenery;
  mu: number;          // сцепление покрытия
  surface: string;
  unlock: number;
  sky: [string, string, string];
  accent: string;
  wet: number;          // сила отражений
  night: boolean;
}

export const TRACKS: TrackDef[] = [
  { id: 'rust', name: 'Промзона «Ржавый Ключ»', short: 'Промзона', scenery: 'industrial', mu: 0.9, surface: 'Пыльный бетон',
    unlock: 1, sky: ['#2b1d3a', '#7b3f4f', '#f08a4b'], accent: '#ff9d3c', wet: 0.35, night: false },
  { id: 'neon', name: 'Ночной центр «Неоновый Проспект»', short: 'Центр', scenery: 'downtown', mu: 1.0, surface: 'Мокрый асфальт',
    unlock: 1, sky: ['#05030f', '#1a0f3d', '#3d1b6b'], accent: '#ff3fd8', wet: 0.9, night: true },
  { id: 'port', name: 'Порт «Северный Причал»', short: 'Порт', scenery: 'port', mu: 0.86, surface: 'Солёный асфальт после дождя',
    unlock: 3, sky: ['#071423', '#123a5c', '#3b7ea1'], accent: '#3fd4ff', wet: 1.0, night: true },
  { id: 'pine', name: 'Шоссе «Сосновый Тракт»', short: 'Шоссе', scenery: 'highway', mu: 1.04, surface: 'Свежий асфальт',
    unlock: 5, sky: ['#1b2a4a', '#ff9e6d', '#ffd59a'], accent: '#ffd23f', wet: 0.25, night: false },
  { id: 'wing', name: 'Аэродром «Крыло»', short: 'Аэродром', scenery: 'airfield', mu: 1.08, surface: 'Шершавый бетон ВПП',
    unlock: 8, sky: ['#0a1a2f', '#24507a', '#7fb2d9'], accent: '#7dff6a', wet: 0.3, night: false },
  { id: 'arc', name: 'Мост «Стальная Дуга»', short: 'Мост', scenery: 'bridge', mu: 0.94, surface: 'Асфальт со стыками',
    unlock: 12, sky: ['#02040b', '#0d1e3b', '#2c3f73'], accent: '#ffcc33', wet: 0.75, night: true },
];

export const TRACK_MAP: Record<string, TrackDef> = Object.fromEntries(TRACKS.map((t) => [t.id, t]));
