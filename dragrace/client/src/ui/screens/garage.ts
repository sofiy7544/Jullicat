import {
  CAR_MAP, PARTS, PART_GOLD, PART_KINDS, PART_UNLOCK, buildSimCar, carName, computeZones, estimate0to100, newOwnedCar,
  partPrice, peakPower, performanceIndex, repairCost, torqueAt, type OwnedCar, type PartKind, type SimCar,
} from '@drag/shared';
import { svc } from '../../api/service';
import { EngineSound, cylinders, unlockAudio } from '../../game/audio';
import { settings } from '../../settings';
import { carPreview, go, refresh, register } from '../app';
import { btn, condBar, confirmBox, guard, h, price } from '../dom';

function curCar(uid?: string): OwnedCar {
  const p = svc.profile;
  return p.cars.find((c) => c.uid === (uid ?? p.currentCar)) ?? p.cars[0];
}

function statsBlock(car: OwnedCar) {
  const s = buildSimCar(car);
  const pw = peakPower(s);
  return h('div', null,
    h('div', { class: 'stat' }, 'Мощность', h('b', null, `${pw.hp.toFixed(0)} л.с. @ ${pw.rpm}`)),
    h('div', { class: 'stat' }, 'Макс. момент', h('b', null, pw.tq.toFixed(0) + ' Н·м')),
    h('div', { class: 'stat' }, 'Масса', h('b', null, s.mass.toFixed(0) + ' кг')),
    h('div', { class: 'stat' }, 'Привод / передач', h('b', null, `${s.drive} / ${s.gears.length}`)),
    h('div', { class: 'stat' }, '0–100 км/ч', h('b', null, estimate0to100(s).toFixed(2) + ' с')),
    h('div', { class: 'stat' }, '402 м (идеально)', h('b', null, performanceIndex(s).toFixed(2) + ' с')));
}

register('garage', () => {
  const p = svc.profile;
  const car = curCar();
  const def = CAR_MAP[car.carId];
  let repairTotal = 0;
  for (const k of PART_KINDS) repairTotal += repairCost(k, car.parts[k], car.carId);
  repairTotal = Math.round(repairTotal * 0.9);
  const avgCond = PART_KINDS.reduce((a, k) => a + car.parts[k].cond, 0) / PART_KINDS.length;
  const worst = PART_KINDS.filter((k) => car.parts[k].cond < 50);
  const el = h('div', null,
    h('div', { class: 'row between' }, h('h1', null, '🔧 Гараж'), h('span', { class: 'muted' }, `${p.cars.length} машин`)),
    h('div', { class: 'hero' }, carPreview(car.carId, car.visual, 720, 250),
      h('div', { class: 'over' }, h('div', null, h('div', { style: { fontSize: '20px' } }, carName(car.carId)), h('div', { class: 'muted' }, def.blurb)))),
    h('div', { class: 'row', style: { overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: '6px' } },
      ...p.cars.map((c) => h('div', {
        class: 'panel card' + (c.uid === car.uid ? ' sel' : ''), style: { minWidth: '150px', padding: '6px' },
        onClick: () => guard(() => svc.op('selectCar', { uid: c.uid })).then(refresh),
      }, carPreview(c.carId, c.visual, 200, 80, { floor: false }), h('div', { class: 'small' }, carName(c.carId))))),
    h('div', { class: 'grid wide' },
      h('div', { class: 'panel' }, h('h3', null, 'Характеристики'), statsBlock(car)),
      h('div', { class: 'panel' }, h('h3', null, 'Состояние'),
        h('div', { class: 'stat' }, 'Среднее', h('b', null, avgCond.toFixed(0) + '%')), condBar(avgCond),
        worst.length ? h('p', { class: 'down small' }, '⚠ Изношено: ' + worst.map((k) => PARTS[k].name).join(', ')) : h('p', { class: 'up small' }, 'Машина в порядке'),
        h('div', { class: 'row' },
          btn(`🛠 Ремонт всего (${repairTotal ? price(repairTotal) : '—'})`, () => guard(() => svc.op('repairAll', { uid: car.uid }), 'Отремонтировано').then(refresh), 'orange', { disabled: !repairTotal }),
          h('span', { class: 'muted' }, `🧰 ремкомплектов: ${p.repairKits}`)))),
    h('div', { class: 'hub', style: { marginTop: '12px' } },
      btn([h('span', { class: 'ic' }, '⚙'), 'Тюнинг'], () => go('tuning', { uid: car.uid }), 'green'),
      btn([h('span', { class: 'ic' }, '📈'), 'КПП и стенд'], () => go('dyno', { uid: car.uid }), 'purple'),
      btn([h('span', { class: 'ic' }, '🎨'), 'Внешний вид'], () => go('paint', { uid: car.uid }), 'orange'),
      btn([h('span', { class: 'ic' }, '🚗'), 'Автосалон'], () => go('dealer')),
      p.cars.length > 1 ? btn([h('span', { class: 'ic' }, '💸'), 'Продать'], async () => {
        if (await confirmBox(`Продать ${carName(car.carId)}? Вернётся половина цены и часть стоимости деталей.`)) { await guard(() => svc.op('sellCar', { uid: car.uid }), 'Продано'); refresh(); }
      }, 'red') : null));
  return el;
});

register('tuning', ({ uid }) => {
  const p = svc.profile;
  const car = curCar(uid);
  const base = buildSimCar(car);
  const basePI = performanceIndex(base);
  const el = h('div', null, h('h1', null, '⚙ Тюнинг — ' + carName(car.carId)),
    h('p', { class: 'muted' }, 'У каждой детали 5 уровней и состояние. Изношенные детали снижают характеристики. Мощные детали ускоряют износ других — следи за компромиссами.'));
  const list = h('div', { class: 'grid wide' });
  for (const k of PART_KINDS) {
    const def = PARTS[k];
    const st = car.parts[k];
    const next = st.lvl + 1;
    let delta = '';
    if (next <= 5) {
      const test: OwnedCar = JSON.parse(JSON.stringify(car));
      test.parts[k] = { lvl: next, cond: 100 };
      const d = performanceIndex(buildSimCar(test)) - basePI;
      delta = d < -0.005 ? `${d.toFixed(2)} с на 402 м` : k === 'gearbox' ? 'быстрее переключения' : k === 'nitro' ? 'мощнее впрыск' : 'небольшой эффект';
    }
    const rc = repairCost(k, st, car.carId);
    const locked = next <= 5 && p.level < PART_UNLOCK[next];
    list.append(h('div', { class: 'panel' },
      h('div', { class: 'row between' }, h('h3', null, `${def.icon} ${def.name}`), h('span', { class: 'pill' }, `ур. ${st.lvl}/5`)),
      h('div', { class: 'small' }, def.levels[st.lvl]),
      h('div', { class: 'muted small' }, def.desc),
      def.tradeoff !== '—' ? h('div', { class: 'small', style: { color: '#ffb03f' } }, '⚖ ' + def.tradeoff) : null,
      h('div', { class: 'row between small', style: { marginTop: '6px' } }, 'Состояние', h('b', null, st.cond.toFixed(0) + '%')), condBar(st.cond),
      h('div', { class: 'row', style: { marginTop: '8px' } },
        next <= 5
          ? btn([`▲ ${def.levels[next]}`, h('br'), h('span', { class: 'small' }, locked ? `🔒 ур. игрока ${PART_UNLOCK[next]}` : price(partPrice(k, next, car.carId), PART_GOLD[next]))],
            () => guard(() => svc.op('buyPart', { uid: car.uid, kind: k, lvl: next }), 'Установлено!').then(refresh), 'green small grow', { disabled: locked })
          : h('span', { class: 'up grow' }, '★ Максимум'),
        rc ? btn(`🛠 ${price(rc)}`, () => guard(() => svc.op('repairPart', { uid: car.uid, kind: k }), 'Починено').then(refresh), 'orange small') : null,
        rc && p.repairKits ? btn('🧰', () => guard(() => svc.op('useKit', { uid: car.uid, kind: k }), '+25%').then(refresh), 'dark small', { title: 'Ремкомплект' }) : null),
      next <= 5 && !locked ? h('div', { class: 'muted small', style: { marginTop: '4px' } }, 'Эффект: ' + delta) : null));
  }
  el.append(list);
  return el;
});

// ───────── КПП и диностенд ─────────
function drawDyno(cv: HTMLCanvasElement, cars: { s: SimCar; color: string; label: string }[], sweep = 1) {
  const g = cv.getContext('2d')!;
  const W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#05060c'; g.fillRect(0, 0, W, H);
  const padL = 46, padB = 30, padT = 14, padR = 46;
  const maxRpm = Math.max(...cars.map((c) => c.s.limiter)) + 200;
  let maxHp = 50, maxTq = 50;
  for (const c of cars) { const p = peakPower(c.s); maxHp = Math.max(maxHp, p.hp); maxTq = Math.max(maxTq, p.tq); }
  maxHp *= 1.15; maxTq *= 1.15;
  const X = (r: number) => padL + (r / maxRpm) * (W - padL - padR);
  const Yh = (v: number) => H - padB - (v / maxHp) * (H - padB - padT);
  const Yt = (v: number) => H - padB - (v / maxTq) * (H - padB - padT);
  g.strokeStyle = 'rgba(92,225,255,0.12)'; g.lineWidth = 1; g.font = '11px Arial'; g.fillStyle = '#8f9bc7';
  for (let r = 0; r <= maxRpm; r += 1000) { g.beginPath(); g.moveTo(X(r), padT); g.lineTo(X(r), H - padB); g.stroke(); g.fillText(String(r / 1000), X(r) - 3, H - 12); }
  for (let i = 0; i <= 5; i++) { const y = padT + ((H - padB - padT) * i) / 5; g.beginPath(); g.moveTo(padL, y); g.lineTo(W - padR, y); g.stroke();
    g.fillText(String(Math.round(maxHp * (1 - i / 5))), 6, y + 4); g.fillText(String(Math.round(maxTq * (1 - i / 5))), W - padR + 6, y + 4); }
  g.fillText('л.с.', 6, H - 12); g.fillText('Н·м', W - padR + 6, H - 12); g.fillText('об/мин ×1000', W / 2 - 30, H - 1);
  for (const c of cars) {
    const lim = c.s.idle + (c.s.limiter - c.s.idle) * sweep;
    for (const [fn, Y, dash] of [[(r: number) => (torqueAt(c.s, r) * r) / 9549 * 1.36, Yh, []], [(r: number) => torqueAt(c.s, r), Yt, [6, 4]]] as const) {
      g.strokeStyle = c.color; g.lineWidth = 2.5; g.setLineDash(dash as unknown as number[]);
      g.beginPath();
      for (let r = c.s.idle; r <= lim; r += 50) { const y = Y(fn(r)); r === c.s.idle ? g.moveTo(X(r), y) : g.lineTo(X(r), y); }
      g.stroke();
    }
    g.setLineDash([]);
  }
  cars.forEach((c, i) => { g.fillStyle = c.color; g.fillRect(padL + 10 + i * 120, padT + 4, 12, 4); g.fillStyle = '#ddd'; g.fillText(c.label, padL + 26 + i * 120, padT + 10); });
}

register('dyno', ({ uid }) => {
  const car = curCar(uid);
  const def = CAR_MAP[car.carId];
  const canTune = car.parts.gearbox.lvl >= 2;
  const range = 0.12 + 0.03 * car.parts.gearbox.lvl;
  const gears = [...car.gearTune];
  let fin = car.finalTune;
  const cv = h('canvas', { width: 900, height: 380 }) as HTMLCanvasElement;
  const out = h('div');
  const draft = (): OwnedCar => ({ ...car, gearTune: gears, finalTune: fin });
  const stock = buildSimCar(newOwnedCar(car.carId, 'stock'));
  const redraw = () => {
    const s = buildSimCar(draft());
    drawDyno(cv, [{ s: stock, color: '#666e8f', label: 'Сток' }, { s, color: '#ff3fd8', label: 'Сейчас' }]);
    const z = computeZones(s, 1);
    const pw = peakPower(s);
    out.innerHTML = '';
    out.append(
      h('div', { class: 'stat' }, 'Пиковая мощность', h('b', null, `${pw.hp.toFixed(0)} л.с. @ ${pw.rpm} об/мин`)),
      h('div', { class: 'stat' }, '0–100 км/ч', h('b', null, estimate0to100(s).toFixed(2) + ' с')),
      h('div', { class: 'stat' }, '402 м (идеальный пилот)', h('b', null, performanceIndex(s).toFixed(2) + ' с')),
      h('div', { class: 'stat' }, 'Зона старта', h('b', { class: 'up' }, `${Math.round(z.launchLo)}–${Math.round(z.launchHi)} об/мин`)),
      h('div', { class: 'stat' }, 'Идеальное переключение', h('b', { style: { color: '#2fd9ff' } }, `${Math.round(z.perfLo[0])}–${Math.round(z.perfHi[0])} об/мин`)),
      h('div', { class: 'stat' }, 'Макс. скорость на передачах', h('b', null, s.gears.map((g) => ((s.redline / (g * s.fd)) * s.r * 0.377).toFixed(0)).join(' / ') + ' км/ч')));
  };
  const sliders = h('div');
  def.gears.forEach((g0, i) => {
    const val = h('b', null, (g0 * gears[i]).toFixed(2));
    sliders.append(h('label', { class: 'f' }, `${i + 1}-я передача: `, val),
      h('input', { type: 'range', min: String(1 - range), max: String(1 + range), step: '0.005', value: String(gears[i]), disabled: !canTune,
        onInput: (e: any) => { gears[i] = +e.target.value; val.textContent = (g0 * gears[i]).toFixed(2); redraw(); } }));
  });
  const fval = h('b', null, (def.fd * fin).toFixed(2));
  sliders.append(h('label', { class: 'f' }, 'Главная пара: ', fval),
    h('input', { type: 'range', min: String(1 - range), max: String(1 + range), step: '0.005', value: String(fin), disabled: !canTune,
      onInput: (e: any) => { fin = +e.target.value; fval.textContent = (def.fd * fin).toFixed(2); redraw(); } }));
  const runDyno = () => {
    unlockAudio();
    const s = buildSimCar(draft());
    const eng = settings.sound ? new EngineSound(cylinders(def.body)) : null;
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 3500);
      drawDyno(cv, [{ s: stock, color: '#666e8f', label: 'Сток' }, { s, color: '#ff3fd8', label: 'Замер' }], k);
      eng?.update(s.idle + (s.limiter - s.idle) * k, 1, k, 0, false);
      if (k < 1) requestAnimationFrame(step); else { eng?.stop(); redraw(); }
    };
    step();
  };
  const el = h('div', null, h('h1', null, '📈 Диностенд и КПП'),
    h('div', { class: 'panel dyno' }, cv, h('div', { class: 'row', style: { marginTop: '8px' } }, btn('▶ Замер на стенде', runDyno, 'purple'), h('span', { class: 'muted' }, 'сплошная — мощность, пунктир — момент'))),
    h('div', { class: 'grid wide', style: { marginTop: '10px' } },
      h('div', { class: 'panel' }, h('h3', null, 'Результаты'), out),
      h('div', { class: 'panel' }, h('h3', null, 'Передаточные числа'),
        canTune ? h('p', { class: 'muted small' }, `Диапазон ±${Math.round(range * 100)}%. Короче передачи — быстрее разгон, длиннее — выше скорость.`)
          : h('p', { class: 'down small' }, 'Нужна спортивная коробка (ур. 2+) — купи в тюнинге.'),
        sliders,
        canTune ? h('div', { class: 'row', style: { marginTop: '8px' } },
          btn('Сброс', () => { gears.fill(1); fin = 1; go('dyno', { uid }, true); }, 'dark small'),
          btn('💾 Сохранить настройку', () => guard(() => svc.op('setGears', { uid: car.uid, gears, final: fin }), 'Сохранено').then(refresh), 'green')) : null)));
  requestAnimationFrame(redraw);
  return el;
});

register('dealer', () => {
  const p = svc.profile;
  const el = h('div', null, h('h1', null, '🚗 Автосалон'), h('p', { class: 'muted' }, 'Цена — не всегда скорость: «потенциал» показывает время на 402 м после полного тюнинга.'));
  const grid = h('div', { class: 'grid wide' });
  for (const c of Object.values(CAR_MAP)) {
    const s0 = buildSimCar(newOwnedCar(c.id, 'x', 0));
    const s5 = buildSimCar(newOwnedCar(c.id, 'x', 5));
    const owned = p.cars.filter((x) => x.carId === c.id).length;
    const locked = p.level < c.unlock;
    grid.append(h('div', { class: 'panel' + (locked ? ' locked' : '') },
      h('div', { class: 'row between' }, h('h3', null, `${c.maker} ${c.model}`), h('span', { class: 'pill' }, `класс ${c.tier}`)),
      carPreview(c.id, { ...newOwnedCar(c.id, 'x').visual }, 360, 130),
      h('div', { class: 'muted small' }, c.blurb),
      h('div', { class: 'stat' }, 'Мощность', h('b', null, peakPower(s0).hp.toFixed(0) + ' л.с.')),
      h('div', { class: 'stat' }, 'Масса / привод', h('b', null, `${c.mass} кг / ${c.drive}`)),
      h('div', { class: 'stat' }, '402 м сток → потенциал', h('b', null, `${performanceIndex(s0).toFixed(2)} → `, h('span', { class: 'up' }, performanceIndex(s5).toFixed(2) + ' с'))),
      h('div', { class: 'row', style: { marginTop: '8px' } },
        locked ? h('span', { class: 'pill' }, `🔒 уровень ${c.unlock}`)
          : btn(`Купить · ${price(c.price, c.gold)}`, async () => {
            if (await confirmBox(`Купить ${c.maker} ${c.model} за ${price(c.price, c.gold)}?`)) { await guard(() => svc.op('buyCar', { carId: c.id }), 'Поздравляем с покупкой!'); go('garage'); }
          }, 'green small'),
        owned ? h('span', { class: 'pill ok' }, `в гараже: ${owned}`) : null)));
  }
  el.append(grid);
  return el;
});
