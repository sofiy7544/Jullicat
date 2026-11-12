// Настройки игрока (только на устройстве).
export interface Settings {
  sound: boolean;
  volume: number;
  vibration: boolean;
  gearbox: 'manual' | 'semi';
  quality: 'high' | 'low';
  showHints: boolean;
}

const KEY = 'nd.settings';
const defaults: Settings = { sound: true, volume: 0.8, vibration: true, gearbox: 'manual', quality: 'high', showHints: true };

function load(): Settings {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...defaults }; }
}

export const settings: Settings = load();

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* приватный режим */ }
}
