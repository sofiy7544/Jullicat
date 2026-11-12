import { KITS, RIMS, SPOILERS, TINTS, VISUAL_GOLD, VISUAL_PRICE, carName, visualCost, type Vinyl, type Visual } from '@drag/shared';
import { svc } from '../../api/service';
import { carMetrics, drawCar, SHAPE_LIST, SHAPE_NAMES, STICKER_LIST, STICKER_NAMES } from '../../game/carArt';
import { go, register } from '../app';
import { btn, guard, h, price } from '../dom';

const PALETTE = ['#f2f2f2', '#111111', '#e63946', '#ff7b00', '#ffd23f', '#3fffb0', '#2ecc71', '#00b3a6', '#3a86ff', '#1f2a44', '#7a4ff2', '#ff3fd8', '#9aa4b0', '#c8102e', '#b08d57', '#5ce1ff'];

register('paint', ({ uid }) => {
  const p = svc.profile;
  const car = p.cars.find((c) => c.uid === uid) ?? p.cars[0];
  const v: Visual = JSON.parse(JSON.stringify(car.visual));
  let sel = -1;
  const cv = h('canvas', { width: 900, height: 360 }) as HTMLCanvasElement;
  const costEl = h('b');
  const layersEl = h('div', { class: 'list' });
  const propsEl = h('div');
  const W = 900, H = 360;
  const scale = Math.min((W * 0.82) / carMetrics(car.carId, 1).L, (H * 0.7) / 1.5);
  const m = carMetrics(car.carId, scale);
  const ox = (W - m.L) / 2, oy = H * 0.85;
  const base = m.bottom * 0.95;

  const draw = () => {
    const g = cv.getContext('2d')!;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#20184a'); bg.addColorStop(1, '#05060c');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    for (let x = 0; x < W; x += 30) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    drawCar(g, { carId: car.carId, visual: v, x: ox, y: oy, scale, selected: sel });
    const c = visualCost(car.visual, v);
    costEl.textContent = c.money || c.gold ? price(c.money, c.gold) : 'без изменений';
  };

  // перетаскивание слоя пальцем/мышью
  const toBody = (e: PointerEvent) => {
    const r = cv.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
    return { u: (x - ox) / m.L, w: (oy - base - y) / (m.H - base) };
  };
  let dragging = false;
  cv.addEventListener('pointerdown', (e) => {
    const b = toBody(e);
    // выбираем ближайший слой
    let best = -1, bd = 0.08;
    v.vinyls.forEach((l, i) => { const d = Math.hypot(l.x - b.u, (l.y - b.w) * 0.4); if (d < bd) { bd = d; best = i; } });
    if (best >= 0) sel = best;
    if (sel >= 0) { dragging = true; cv.setPointerCapture(e.pointerId); }
    renderLayers(); draw();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!dragging || sel < 0) return;
    const b = toBody(e);
    v.vinyls[sel].x = Math.round(b.u * 1000) / 1000; v.vinyls[sel].y = Math.round(b.w * 1000) / 1000;
    draw();
  });
  cv.addEventListener('pointerup', () => { dragging = false; renderProps(); });

  const addLayer = (l: Partial<Vinyl>) => {
    if (v.vinyls.length >= 16) return;
    v.vinyls.push({ id: Math.random().toString(36).slice(2, 8), kind: 'shape', x: 0.5, y: 0.5, s: 1, r: 0, color: '#ffffff', ...l } as Vinyl);
    sel = v.vinyls.length - 1;
    renderLayers(); renderProps(); draw();
  };

  const renderLayers = () => {
    layersEl.innerHTML = '';
    if (!v.vinyls.length) layersEl.append(h('div', { class: 'muted' }, 'Слоёв нет. Добавь надпись, фигуру или стикер.'));
    v.vinyls.forEach((l, i) => layersEl.append(h('div', { class: 'layer' + (i === sel ? ' sel' : ''), onClick: () => { sel = i; renderLayers(); renderProps(); draw(); } },
      h('span', { style: { width: '14px', height: '14px', background: l.color, borderRadius: '3px', display: 'inline-block' } }),
      h('span', { class: 'grow' }, `${i + 1}. ${l.kind === 'text' ? '«' + (l.text ?? '') + '»' : l.kind === 'shape' ? SHAPE_NAMES[l.shape!] : STICKER_NAMES[l.sticker!]}`))));
  };

  const slider = (label: string, min: number, max: number, step: number, val: number, set: (n: number) => void) =>
    [h('label', { class: 'f' }, label), h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(val), onInput: (e: any) => { set(+e.target.value); draw(); } })];

  const renderProps = () => {
    propsEl.innerHTML = '';
    if (sel < 0 || !v.vinyls[sel]) return;
    const l = v.vinyls[sel];
    propsEl.append(...[
      h('h3', null, 'Слой ' + (sel + 1)),
      l.kind === 'text' || l.sticker === 'roundel' ? h('input', { class: 'field', maxLength: 16, value: l.text ?? '', onInput: (e: any) => { l.text = e.target.value; draw(); renderLayers(); } }) : null,
      ...slider('Размер', 0.1, 3, 0.05, l.s, (n) => (l.s = n)),
      ...slider('Поворот', -3.14, 3.14, 0.02, l.r, (n) => (l.r = n)),
      h('label', { class: 'f' }, 'Цвет'),
      h('div', { class: 'row' }, ...PALETTE.map((c) => h('div', { class: 'swatch' + (l.color === c ? ' sel' : ''), style: { background: c }, onClick: () => { l.color = c; renderProps(); renderLayers(); draw(); } })),
        h('input', { type: 'color', value: l.color, onInput: (e: any) => { l.color = e.target.value; draw(); } })),
      h('div', { class: 'row', style: { marginTop: '8px' } },
        btn('⬆', () => { if (sel < v.vinyls.length - 1) { [v.vinyls[sel], v.vinyls[sel + 1]] = [v.vinyls[sel + 1], v.vinyls[sel]]; sel++; renderLayers(); draw(); } }, 'dark small', { title: 'Выше' }),
        btn('⬇', () => { if (sel > 0) { [v.vinyls[sel], v.vinyls[sel - 1]] = [v.vinyls[sel - 1], v.vinyls[sel]]; sel--; renderLayers(); draw(); } }, 'dark small', { title: 'Ниже' }),
        btn('⇋', () => { l.flip = !l.flip; draw(); }, 'dark small', { title: 'Отразить' }),
        btn('⧉', () => addLayer({ ...l, id: undefined, x: l.x + 0.05 }), 'dark small', { title: 'Копия' }),
        btn('🗑 Удалить', () => { v.vinyls.splice(sel, 1); sel = -1; renderLayers(); renderProps(); draw(); }, 'red small'))].filter((x) => !!x) as HTMLElement[]);
  };

  const optRow = (title: string, names: string[], key: 'rims' | 'spoiler' | 'kit' | 'tint', prices: number[], golds?: number[]) =>
    h('div', null, h('label', { class: 'f' }, title), h('div', { class: 'tabs' }, ...names.map((n, i) => {
      const b = btn([n, prices[i] || golds?.[i] ? h('span', { class: 'small' }, ' ' + price(prices[i], golds?.[i] ?? 0)) : ''], () => { (v as any)[key] = i; [...b.parentElement!.children].forEach((x, j) => x.classList.toggle('on', j === i)); draw(); }, v[key] === i ? 'on' : 'dark');
      return b;
    })));

  const colorRow = (title: string, get: () => string, set: (c: string) => void, cost: number) => {
    const row = h('div', { class: 'swatches' });
    const fill = () => { row.innerHTML = ''; row.append(...PALETTE.map((c) => h('div', { class: 'swatch' + (get() === c ? ' sel' : ''), style: { background: c }, onClick: () => { set(c); fill(); draw(); } })), h('input', { type: 'color', value: get(), onInput: (e: any) => { set(e.target.value); draw(); } })); };
    fill();
    return h('div', null, h('label', { class: 'f' }, `${title} (${price(cost)})`), row);
  };

  const el = h('div', { class: 'editor' }, h('h1', null, '🎨 Внешний вид — ' + carName(car.carId)),
    h('div', { class: 'panel' }, cv, h('div', { class: 'row between', style: { marginTop: '8px' } },
      h('span', null, 'Стоимость: ', costEl),
      h('div', { class: 'row' }, btn('Отмена', () => go('garage', {}, true), 'dark'),
        btn('💾 Применить', async () => { if (await guard(() => svc.op('setVisual', { uid: car.uid, visual: v }), 'Готово!')) go('garage', {}, true); }, 'green')))),
    h('div', { class: 'grid wide', style: { marginTop: '10px' } },
      h('div', { class: 'panel' }, h('h3', null, 'Покраска и детали'),
        colorRow('Основной цвет', () => v.paint, (c) => (v.paint = c), VISUAL_PRICE.paint),
        colorRow('Нижний тон (#000 — без)', () => v.paint2, (c) => (v.paint2 = c), VISUAL_PRICE.paint2),
        optRow('Диски', RIMS, 'rims', VISUAL_PRICE.rims, VISUAL_GOLD.rims),
        colorRow('Цвет дисков', () => v.rimColor, (c) => (v.rimColor = c), VISUAL_PRICE.rimColor),
        optRow('Спойлер', SPOILERS, 'spoiler', VISUAL_PRICE.spoiler),
        optRow('Обвес', KITS, 'kit', VISUAL_PRICE.kit, VISUAL_GOLD.kit),
        optRow('Тонировка', TINTS, 'tint', VISUAL_PRICE.tint),
        h('label', { class: 'f' }, `Подсветка днища (${price(VISUAL_PRICE.glow)})`),
        h('div', { class: 'swatches' }, h('div', { class: 'swatch', style: { background: 'repeating-linear-gradient(45deg,#333 0 4px,#000 4px 8px)' }, onClick: () => { v.glow = null; draw(); } }),
          ...['#00e5ff', '#ff3fd8', '#3fff6a', '#ffd23f', '#ff3b3b', '#7d5cff'].map((c) => h('div', { class: 'swatch', style: { background: c }, onClick: () => { v.glow = c; draw(); } })))),
      h('div', { class: 'panel' }, h('h3', null, 'Винилы (слои)'),
        h('p', { class: 'muted small' }, `Перетаскивай слой по машине пальцем. До 16 слоёв. ${price(VISUAL_PRICE.vinylBase)} + ${VISUAL_PRICE.vinylLayer} за слой.`),
        h('div', { class: 'row' },
          btn('+ Надпись', () => addLayer({ kind: 'text', text: 'NITRO', y: 0.45, s: 0.45 }), 'small'),
          h('select', { class: 'field', style: { width: 'auto' }, onChange: (e: any) => { if (e.target.value) addLayer({ kind: 'shape', shape: e.target.value, s: 0.5 }); e.target.value = ''; } },
            h('option', { value: '' }, '+ Фигура'), ...SHAPE_LIST.map((s) => h('option', { value: s }, SHAPE_NAMES[s]))),
          h('select', { class: 'field', style: { width: 'auto' }, onChange: (e: any) => { if (e.target.value) addLayer({ kind: 'sticker', sticker: e.target.value, text: '7', color: '#e63946', s: 0.7 }); e.target.value = ''; } },
            h('option', { value: '' }, '+ Стикер'), ...STICKER_LIST.map((s) => h('option', { value: s }, STICKER_NAMES[s])))),
        h('div', { style: { marginTop: '8px' } }, layersEl), propsEl)));
  renderLayers();
  requestAnimationFrame(draw);
  return el;
});
