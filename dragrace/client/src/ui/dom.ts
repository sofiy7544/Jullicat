import { sfx } from '../game/audio';

type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, any>;

/** Минимальный helper для DOM без фреймворков. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      const ev = k.slice(2).toLowerCase();
      if (ev === 'click' && (tag === 'button' || attrs.class?.includes('card'))) el.addEventListener('click', (e) => { sfx.click(); v(e); });
      else el.addEventListener(ev, v);
    } else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') (el as any)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, kids);
  return el;
}

function append(el: Node, kids: Child[]) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.appendChild(typeof k === 'object' ? k : document.createTextNode(String(k)));
  }
}

export const btn = (label: Child, onClick: (e: Event) => void, cls = '', extra: Attrs = {}) =>
  h('button', { class: 'btn ' + cls, onClick, ...extra }, label);

export function toast(msg: string, kind: 'ok' | 'err' | '' = '') {
  let box = document.getElementById('toasts');
  if (!box) { box = h('div', { id: 'toasts' }); document.body.appendChild(box); }
  const t = h('div', { class: 'toast ' + kind }, msg);
  box.appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity 0.4s'; t.style.opacity = '0'; }, 2600);
  setTimeout(() => t.remove(), 3100);
}

export function modal(content: (close: () => void) => Child, opts: { dismiss?: boolean } = {}) {
  const close = () => bg.remove();
  const bg = h('div', { class: 'modal-bg' });
  const box = h('div', { class: 'modal panel glow' }, content(close));
  bg.appendChild(box);
  if (opts.dismiss !== false) bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
  document.body.appendChild(bg);
  return close;
}

export function confirmBox(text: string, ok = 'Да', cancel = 'Отмена'): Promise<boolean> {
  return new Promise((res) => {
    modal((close) => [
      h('p', { style: { fontSize: '16px', textAlign: 'center' } }, text),
      h('div', { class: 'row', style: { justifyContent: 'center' } },
        btn(cancel, () => { close(); res(false); }, 'dark'),
        btn(ok, () => { close(); res(true); }, 'green')),
    ], { dismiss: false });
  });
}

export function money(n: number) { return '💰 ' + Math.round(n).toLocaleString('ru-RU'); }
export function gems(n: number) { return '💎 ' + n; }
export function price(m: number, g = 0) { return [m ? money(m) : '', g ? gems(g) : ''].filter(Boolean).join(' + ') || 'Бесплатно'; }

export function condClass(c: number) { return c >= 60 ? 'cond-good' : c >= 30 ? 'cond-mid' : 'cond-bad'; }
export function condBar(c: number) { return h('div', { class: 'bar' }, h('i', { class: condClass(c), style: { width: Math.max(2, c) + '%' } })); }

export async function guard<T>(fn: () => Promise<T>, okMsg?: string): Promise<T | undefined> {
  try { const r = await fn(); if (okMsg) toast(okMsg, 'ok'); return r; }
  catch (e: any) { toast(e?.message || String(e), 'err'); return undefined; }
}

export function fmtTime(t: number) { return t > 0 ? t.toFixed(3) + ' с' : '—'; }
export function timeAgo(ts: number) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'только что';
  if (s < 3600) return Math.floor(s / 60) + ' мин назад';
  if (s < 86400) return Math.floor(s / 3600) + ' ч назад';
  return Math.floor(s / 86400) + ' дн назад';
}
