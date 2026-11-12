// Слой платформы: браузер / PWA / VK Mini App / Capacitor (iOS).
// Остальной код не знает, где он запущен — всё платформенное идёт через этот модуль.
import { settings } from './settings';

export type PlatformKind = 'web' | 'pwa' | 'vk' | 'capacitor';

export function detectPlatform(): PlatformKind {
  const w = window as any;
  if (w.Capacitor?.isNativePlatform?.()) return 'capacitor';
  if (new URLSearchParams(location.search).has('vk_app_id')) return 'vk';
  if (matchMedia('(display-mode: standalone)').matches || w.navigator.standalone) return 'pwa';
  return 'web';
}

export const platform = detectPlatform();

/** Вибрация: Capacitor Haptics → navigator.vibrate → ничего (iOS Safari не поддерживает). */
export function haptic(kind: 'light' | 'medium' | 'heavy' = 'light') {
  if (!settings.vibration) return;
  const w = window as any;
  const H = w.Capacitor?.Plugins?.Haptics;
  if (H) { H.impact({ style: kind.toUpperCase() }); return; }
  if (navigator.vibrate) navigator.vibrate(kind === 'heavy' ? 40 : kind === 'medium' ? 20 : 8);
}

/** Параметры запуска VK Mini App (для будущей авторизации через VK). */
export function vkLaunchParams(): string | null {
  return platform === 'vk' ? location.search.slice(1) : null;
}

export function apiBase(): string {
  const env = (import.meta as any).env?.VITE_API_URL as string | undefined;
  if (env) return env.replace(/\/$/, '');
  return ''; // тот же хост (в dev — прокси Vite)
}

export function wsUrl(token: string): string {
  const base = apiBase();
  const u = base ? new URL(base) : new URL(location.href);
  const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${u.host}/ws?token=${encodeURIComponent(token)}`;
}
