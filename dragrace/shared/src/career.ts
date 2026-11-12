import type { Distance } from './types';

export interface CareerBot { name: string; carId: string; tune: number; skill: number; distance: Distance; trackId: string; boss?: boolean; paint: string }
export interface League { id: number; name: string; unlock: number; reward: number; bots: CareerBot[] }

export const LEAGUES: League[] = [
  { id: 0, name: 'Дворовая лига', unlock: 1, reward: 1, bots: [
    { name: 'Шайба', carId: 'borka', tune: 0, skill: 0.15, distance: 201, trackId: 'rust', paint: '#8d99ae' },
    { name: 'Кнопка', carId: 'velmor', tune: 0, skill: 0.25, distance: 201, trackId: 'rust', paint: '#ff7eb6' },
    { name: 'Ржавый', carId: 'borka', tune: 1.2, skill: 0.35, distance: 402, trackId: 'neon', paint: '#b5651d' },
    { name: 'Пыль', carId: 'tornik', tune: 0.8, skill: 0.4, distance: 201, trackId: 'rust', paint: '#d4b483' },
    { name: 'Гвоздь', carId: 'kastor', tune: 1.4, skill: 0.55, distance: 402, trackId: 'neon', boss: true, paint: '#222222' },
  ] },
  { id: 1, name: 'Городская лига', unlock: 6, reward: 2.2, bots: [
    { name: 'Тайфун', carId: 'saphyr', tune: 1.6, skill: 0.45, distance: 402, trackId: 'neon', paint: '#2d6cdf' },
    { name: 'Мотыль', carId: 'kastor', tune: 2, skill: 0.5, distance: 201, trackId: 'port', paint: '#e0e0e0' },
    { name: 'Чёрный Лис', carId: 'orvel', tune: 2.2, skill: 0.55, distance: 402, trackId: 'port', paint: '#111111' },
    { name: 'Скат', carId: 'neris', tune: 1.8, skill: 0.6, distance: 402, trackId: 'pine', paint: '#00b3a6' },
    { name: 'Фара', carId: 'neris', tune: 2.9, skill: 0.7, distance: 804, trackId: 'pine', boss: true, paint: '#ffe14d' },
  ] },
  { id: 2, name: 'Региональная лига', unlock: 12, reward: 4, bots: [
    { name: 'Гроза', carId: 'gromada', tune: 2.8, skill: 0.6, distance: 402, trackId: 'wing', paint: '#5a189a' },
    { name: 'Кедр', carId: 'morra', tune: 3, skill: 0.65, distance: 402, trackId: 'pine', paint: '#2f6f3e' },
    { name: 'Вольт', carId: 'kastor', tune: 4, skill: 0.7, distance: 201, trackId: 'wing', paint: '#39ff14' },
    { name: 'Сапсан', carId: 'altavia', tune: 2.6, skill: 0.72, distance: 804, trackId: 'wing', paint: '#4361ee' },
    { name: 'Мистраль', carId: 'altavia', tune: 3.8, skill: 0.8, distance: 804, trackId: 'arc', boss: true, paint: '#f1faee' },
  ] },
  { id: 3, name: 'Элитная лига', unlock: 18, reward: 7, bots: [
    { name: 'Титан', carId: 'vortan', tune: 3.2, skill: 0.75, distance: 402, trackId: 'arc', paint: '#6c757d' },
    { name: 'Ледокол', carId: 'neris', tune: 5, skill: 0.8, distance: 402, trackId: 'port', paint: '#a8dadc' },
    { name: 'Призма', carId: 'ezzar', tune: 3.5, skill: 0.82, distance: 804, trackId: 'wing', paint: '#ff006e' },
    { name: 'Комета', carId: 'borka', tune: 5, skill: 0.9, distance: 201, trackId: 'arc', paint: '#ffbe0b' },
    { name: 'Барон', carId: 'vortan', tune: 4.8, skill: 0.93, distance: 804, trackId: 'arc', boss: true, paint: '#0b0b0b' },
  ] },
];

export const QUICK_NAMES = ['Бублик', 'Маятник', 'Кактус', 'Сова', 'Рикошет', 'Перец', 'Ёрш', 'Кардан', 'Шуруп', 'Метель', 'Пион', 'Борщ'];
