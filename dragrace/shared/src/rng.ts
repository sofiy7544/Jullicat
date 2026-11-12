/** Детерминированный ГПСЧ (одинаковый результат в браузере и на сервере). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function uid(prefix = ''): string {
  const r = Math.random().toString(36).slice(2, 10);
  return prefix + Date.now().toString(36) + r;
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
