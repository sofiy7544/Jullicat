import { BONUS_MS, FUEL_MAX, nextFuelIn, syncFuel, xpForLevel, type Visual } from '@drag/shared';
import { svc } from '../api/service';
import { drawCar, carMetrics } from '../game/carArt';
import { sfx } from '../game/audio';
import { btn, guard, h, modal, toast } from './dom';

export type ScreenFn = (params: any) => HTMLElement | Promise<HTMLElement>;
const screens: Record<string, ScreenFn> = {};
const stack: { name: string; params: any }[] = [];
let mainEl: HTMLElement;
let topEl: HTMLElement;
let current = '';

export function register(name: string, fn: ScreenFn) { screens[name] = fn; }

export function mountApp(root: HTMLElement) {
  root.innerHTML = '';
  topEl = h('div', { class: 'topbar' });
  mainEl = h('div', { class: 'screen' });
  root.append(topEl, mainEl);
  svc.onChange(() => renderTop());
  setInterval(renderTop, 1000);
}

export async function go(name: string, params: any = {}, replace = false) {
  if (replace) stack.pop();
  if (name === 'menu') stack.length = 0;
  stack.push({ name, params });
  await show(name, params);
}

export async function back() {
  stack.pop();
  const prev = stack[stack.length - 1] ?? { name: 'menu', params: {} };
  if (!stack.length) stack.push(prev);
  await show(prev.name, prev.params);
}

export async function refresh() {
  const cur = stack[stack.length - 1];
  if (cur) await show(cur.name, cur.params, true);
}

async function show(name: string, params: any, keepScroll = false) {
  const fn = screens[name];
  if (!fn) return;
  const scroll = mainEl.scrollTop;
  current = name;
  let el: HTMLElement;
  try { el = await fn(params); } catch (e: any) { toast(e?.message ?? 'Ошибка', 'err'); el = h('div', null, h('p', null, 'Не удалось открыть экран'), btn('Назад', back, 'dark')); }
  if (current !== name) return;
  mainEl.innerHTML = '';
  mainEl.appendChild(el);
  mainEl.scrollTop = keepScroll ? scroll : 0;
  renderTop();
}

export function currentScreen() { return current; }

function fmtMs(ms: number) {
  const s = Math.ceil(ms / 1000);
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;
}

function renderTop() {
  if (!topEl || !svc?.profile) return;
  const p = svc.profile;
  const now = svc.now();
  syncFuel(p, now);
  const lvlStart = xpForLevel(p.level), lvlEnd = xpForLevel(p.level + 1);
  const pct = Math.min(100, ((p.xp - lvlStart) / Math.max(1, lvlEnd - lvlStart)) * 100);
  const bonusIn = BONUS_MS - (now - p.bonusAt);
  const fuelIn = nextFuelIn(p, now);
  topEl.innerHTML = '';
  topEl.append(...[
    current !== 'menu' ? btn('◀', back, 'dark small') : h('span', { style: { fontSize: '18px', color: '#ff3fd8', whiteSpace: 'nowrap' } }, 'НИТРО-ДВОР'),
    h('div', { class: 'lvl' }, h('div', { class: 'badge' }, String(p.level)), h('div', null, h('div', { class: 'small' }, p.nick), h('div', { class: 'xpbar' }, h('i', { style: { width: pct + '%' } })))),
    h('div', { class: 'grow' }),
    h('span', { class: 'chip money' }, '💰 ' + p.money.toLocaleString('ru-RU')),
    h('span', { class: 'chip gold' }, '💎 ' + p.gold),
    h('span', { class: 'chip fuel', title: 'Топливо' }, `⛽ ${p.fuel}/${FUEL_MAX}` + (fuelIn ? ' · ' + fmtMs(fuelIn) : '')),
    bonusIn <= 0
      ? btn('🎁 Бонус', () => claimBonus(), 'gold small')
      : h('span', { class: 'chip', title: 'Бонус каждые 8 часов' }, '🎁 ' + fmtMs(bonusIn)),
    svc.mode === 'online' && !svc.online ? h('span', { class: 'chip', style: { color: '#ff4d5e' } }, '📡 офлайн') : null,
  ].filter((x): x is HTMLElement => !!x));
}

async function claimBonus() {
  const r = await guard(() => svc.op('claimBonus'));
  if (r) {
    sfx.coin();
    modal((close) => [
      h('h2', { style: { textAlign: 'center' } }, '🎁 Бонус за вход!'),
      h('p', { style: { textAlign: 'center', fontSize: '20px' } }, `💰 ${r.money}   💎 ${r.gold}   ⛽ +${r.fuel}`),
      h('p', { class: 'muted', style: { textAlign: 'center' } }, 'Следующий — через 8 часов'),
      h('div', { class: 'row', style: { justifyContent: 'center' } }, btn('Забрать', close, 'green big')),
    ]);
  }
}

/** Канвас-витрина машины (гараж, автосалон, профиль). */
export function carPreview(carId: string, visual: Visual, w = 520, hgt = 220, opts: { floor?: boolean; night?: boolean } = {}) {
  const cv = h('canvas') as HTMLCanvasElement;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = w * dpr; cv.height = hgt * dpr;
  cv.style.aspectRatio = `${w} / ${hgt}`;
  cv.style.width = '100%'; cv.style.display = 'block';
  const g = cv.getContext('2d')!;
  g.scale(dpr, dpr);
  const bg = g.createLinearGradient(0, 0, 0, hgt);
  bg.addColorStop(0, '#1a1440'); bg.addColorStop(0.65, '#0b0d1c'); bg.addColorStop(1, '#05060c');
  g.fillStyle = bg; g.fillRect(0, 0, w, hgt);
  const spot = g.createRadialGradient(w / 2, hgt * 0.1, 10, w / 2, hgt * 0.5, w * 0.6);
  spot.addColorStop(0, 'rgba(255,255,255,0.22)'); spot.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = spot; g.fillRect(0, 0, w, hgt);
  if (opts.floor !== false) {
    g.fillStyle = 'rgba(255,255,255,0.04)';
    for (let i = 0; i < 14; i++) { g.beginPath(); g.moveTo(w / 2, hgt * 0.78); g.lineTo(i * (w / 13) * 2 - w / 2, hgt); g.lineTo(i * (w / 13) * 2 - w / 2 + 3, hgt); g.fill(); }
    g.fillStyle = 'rgba(255,63,216,0.35)'; g.fillRect(0, hgt * 0.78, w, 2);
  }
  const scale = Math.min((w * 0.8) / carMetrics(carId, 1).L, (hgt * 0.62) / 1.5);
  const m = carMetrics(carId, scale);
  const x = (w - m.L) / 2, y = hgt * 0.84;
  g.save(); g.globalAlpha = 0.22; g.translate(0, y * 2 + 2); g.scale(1, -1);
  drawCar(g, { carId, visual, x, y, scale });
  g.restore();
  drawCar(g, { carId, visual, x, y, scale, night: opts.night });
  return cv;
}

export function section(title: string, ...kids: any[]) {
  return h('div', { class: 'panel' }, h('h3', null, title), ...kids);
}
