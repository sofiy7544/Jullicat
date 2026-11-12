import {
  CAR_MAP, DISTANCES, PARTS, PART_KINDS, TRACKS, TRACK_MAP, buildSimCar, carName, defaultVisual, opponentSimCar, peakPower, performanceIndex,
  type Distance, type InputEvent, type MatchInfo, type RaceContext, type RunResult, type SimCar, type Visual,
} from '@drag/shared';
import { svc, type FinishResponse, type StartRequest } from '../../api/service';
import { socket } from '../../api/net';
import { RaceScene } from '../../game/raceScene';
import { sfx, unlockAudio } from '../../game/audio';
import { settings } from '../../settings';
import { carPreview, go, refresh, register } from '../app';
import { btn, fmtTime, guard, h, modal, toast } from '../dom';

let selTrack = 'neon';
let selDist: Distance = 402;

register('quick', () => {
  const p = svc.profile;
  const el = h('div', null, h('h1', null, '🏁 Быстрый заезд'),
    h('p', { class: 'muted' }, 'Соперник подбирается по силе твоей машины. Трассы отличаются сцеплением покрытия.'));
  const tracks = h('div', { class: 'grid' });
  for (const t of TRACKS) {
    const locked = p.level < t.unlock;
    tracks.append(h('div', {
      class: 'panel card' + (selTrack === t.id ? ' sel' : '') + (locked ? ' locked' : ''),
      style: { background: `linear-gradient(180deg, ${t.sky[1]}, ${t.sky[0]})` },
      onClick: () => { if (locked) return toast(`Откроется на ${t.unlock} уровне`, 'err'); selTrack = t.id; refresh(); },
    }, h('h3', { style: { color: t.accent } }, t.short), h('div', { class: 'small' }, t.name),
      h('div', { class: 'muted small' }, `${t.surface} · сцепление ${(t.mu * 100).toFixed(0)}%`), locked ? h('div', { class: 'pill' }, '🔒 ур. ' + t.unlock) : null));
  }
  const dists = h('div', { class: 'tabs' }, ...DISTANCES.map((d) => btn(`${d} м`, () => { selDist = d; refresh(); }, selDist === d ? 'on' : 'dark')));
  el.append(h('h3', null, 'Трасса'), tracks, h('h3', { style: { marginTop: '12px' } }, 'Дистанция'), dists,
    h('div', { class: 'row', style: { marginTop: '10px' } },
      btn('🏁 ГОНКА (⛽1)', () => startRace({ kind: 'quick', trackId: selTrack, distance: selDist }), 'green big grow'),
      !p.tutorialDone ? btn('🎓 Обучение', () => startTutorial(), 'gold big') : null));
  return el;
});

export function startTutorial() {
  modal((close) => [
    h('h2', null, '🎓 Как ездить'),
    h('div', { class: 'list' },
      h('div', { class: 'item' }, h('div', { class: 'ava' }, '1'), h('div', null, 'Зажми ', h('b', null, 'СЦЕПЛЕНИЕ'), ' (левая педаль, Пробел) и держи.')),
      h('div', { class: 'item' }, h('div', { class: 'ava' }, '2'), h('div', null, 'Газуй (правая педаль, ↑), держи стрелку тахометра в ', h('b', { class: 'up' }, 'зелёной зоне'), '.')),
      h('div', { class: 'item' }, h('div', { class: 'ava' }, '3'), h('div', null, 'На ', h('b', { class: 'up' }, 'зелёный'), ' свет — отпусти сцепление. Раньше — фальстарт!')),
      h('div', { class: 'item' }, h('div', { class: 'ava' }, '4'), h('div', null, 'Когда стрелка в ', h('b', { style: { color: '#2fd9ff' } }, 'голубой зоне'), ' — отпусти газ и жми ▲ (→). Без сброса газа изнашивается коробка.')),
      h('div', { class: 'item' }, h('div', { class: 'ava' }, '⚡'), h('div', null, 'НИТРО (N) — один раз за заезд, если установлено.')),
    ),
    h('p', { class: 'muted' }, 'Газ и передачи можно жать одновременно разными пальцами.'),
    h('div', { class: 'row', style: { justifyContent: 'center' } }, btn('Поехали!', () => { close(); startRace({ kind: 'quick', trackId: 'neon', distance: 201, tutorial: true }); }, 'green big')),
  ]);
}

function carStats(car: SimCar) {
  const pw = peakPower(car);
  return h('div', null,
    h('div', { class: 'stat' }, 'Мощность', h('b', null, pw.hp.toFixed(0) + ' л.с.')),
    h('div', { class: 'stat' }, 'Момент', h('b', null, pw.tq.toFixed(0) + ' Н·м')),
    h('div', { class: 'stat' }, 'Масса', h('b', null, car.mass.toFixed(0) + ' кг')),
    h('div', { class: 'stat' }, 'Привод', h('b', null, car.drive)),
    h('div', { class: 'stat' }, 'Сила (402 м)', h('b', null, performanceIndex(car).toFixed(2) + ' с')));
}

/** Экран «VS» перед стартом: видно машину и характеристики соперника. */
function versus(ctx: RaceContext, me: { car: SimCar; carId: string; visual: Visual; name: string }, op: { car: SimCar; carId: string; visual: Visual; name: string }, auto?: number) {
  return new Promise<boolean>((resolve) => {
    const t = TRACK_MAP[ctx.trackId];
    let timer = 0;
    const close = modal((c) => {
      const go1 = () => { clearInterval(timer); unlockAudio(); c(); resolve(true); };
      const cnt = h('span');
      if (auto) {
        const tick = () => { const left = Math.ceil((auto - socket.now()) / 1000); cnt.textContent = left > 0 ? ` (${left})` : ''; if (left <= 0) go1(); };
        timer = window.setInterval(tick, 200); tick();
      }
      return [
        h('div', { class: 'row between' }, h('h2', null, t.name), h('span', { class: 'pill' }, `${ctx.distance} м`)),
        h('div', { class: 'grid', style: { gridTemplateColumns: '1fr 1fr' } },
          h('div', null, h('h3', null, me.name), carPreview(me.carId, me.visual, 300, 130), h('div', { class: 'small' }, carName(me.carId)), carStats(me.car)),
          h('div', null, h('h3', { style: { color: '#ffd23f' } }, op.name, ctx.opponent.type === 'bot' && ctx.opponent.boss ? h('span', { class: 'pill boss' }, ' БОСС') : null, ctx.opponent.type === 'ghost' ? h('span', { class: 'pill' }, ' 👻 призрак') : null),
            carPreview(op.carId, op.visual, 300, 130), h('div', { class: 'small' }, carName(op.carId)), carStats(op.car))),
        ctx.bet ? h('p', { style: { textAlign: 'center', color: '#ffd23f' } }, `Ставка: 💰 ${ctx.bet} (банк ${Math.floor(ctx.bet * 2 * 0.95)})`) : null,
        h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '8px' } },
          auto ? null : btn('Отмена', () => { c(); resolve(false); }, 'dark'),
          btn(['ПОЕХАЛИ!', cnt], go1, 'green big')),
      ];
    }, { dismiss: false });
    void close;
  });
}

function mountRace(): HTMLElement {
  const root = h('div', { class: 'race-root' });
  const inner = h('div', { class: 'race-inner' });
  root.appendChild(inner);
  document.body.appendChild(root);
  return inner;
}

export async function startRace(req: StartRequest) {
  const p = svc.profile;
  const ctx = await guard(() => svc.startRace(req));
  if (!ctx) return;
  const car = p.cars.find((c) => c.uid === ctx.carUid)!;
  const o = ctx.opponent;
  const me = { car: buildSimCar(car), carId: car.carId, visual: car.visual, name: p.nick };
  const op = { car: opponentSimCar(o), carId: o.carId, visual: o.type === 'bot' ? (o.visual ?? defaultVisual(o.carId)) : o.visual, name: o.name };
  if (!(await versus(ctx, me, op))) return;
  runScene(ctx, me, op, !!ctx.tutorial);
}

function runScene(ctx: RaceContext, me: any, op: any, tutorial: boolean, remote?: MatchInfo) {
  const inner = mountRace();
  let unsubWs: (() => void) | null = null;
  let resultMsg: any = null;
  let waiters: ((m: any) => void)[] = [];
  if (remote) {
    unsubWs = socket.on((m) => {
      if (m.t === 'race.result' && m.matchId === remote.matchId) { resultMsg = m; waiters.forEach((w) => w(m)); }
    });
  }
  const scene = new RaceScene(inner, {
    ctx, player: me, opp: op, tutorial,
    remote: remote ? {
      startAt: remote.startAt, now: () => socket.now(),
      send: (s) => socket.send({ t: 'race.state', matchId: remote.matchId, s }),
      subscribe: (hnd) => socket.on((m) => { if (m.t === 'race.state' && m.matchId === remote.matchId) hnd(m.s); }),
    } : undefined,
    onQuit: () => {
      inner.parentElement?.remove();
      if (remote) socket.send({ t: 'race.leave', matchId: remote.matchId });
      unsubWs?.();
      toast(remote ? 'Ты покинул заезд — поражение' : 'Заезд прерван');
      refresh();
    },
    onFinish: async ({ inputs, player, oppLocal }) => {
      scene.destroy();
      inner.parentElement?.remove();
      const res = await finish(ctx, inputs, player, oppLocal);
      let online: any = null;
      if (remote) {
        online = resultMsg ?? await new Promise((r) => { waiters.push(r); setTimeout(() => r(null), 25000); });
        unsubWs?.();
        if (svc.mode === 'online') await (svc as any).load?.().catch(() => {});
      }
      showResults(ctx, res, op.name, online, () => {
        if (remote) go('lobby', {}, true);
        else if (ctx.kind === 'career') go('career', {}, true);
        else startRace({ kind: ctx.kind, trackId: ctx.trackId, distance: ctx.distance });
      });
    },
  });
}

async function finish(ctx: RaceContext, inputs: InputEvent[], player: RunResult, oppLocal: RunResult | null): Promise<FinishResponse> {
  try {
    return await svc.finishRace(ctx, inputs, settings.gearbox === 'semi');
  } catch (e: any) {
    toast(e?.message ?? 'Ошибка отправки результата', 'err');
    return { rewards: null, player, opp: oppLocal, profile: svc.profile };
  }
}

export function runOnlineMatch(m: MatchInfo) {
  const p = svc.profile;
  const car = p.cars.find((c) => c.uid === p.currentCar)!;
  const ctx: RaceContext = {
    raceId: m.raceId, kind: 'online', trackId: m.trackId, distance: m.distance, carUid: car.uid, seed: m.seed,
    opponent: { type: 'remote', userId: m.opponent.userId, name: m.opponent.nick, carId: m.opponent.carId, simCar: m.opponent.simCar, visual: m.opponent.visual },
    bet: m.bet, startedAt: Date.now(),
  };
  const me = { car: buildSimCar(car), carId: car.carId, visual: car.visual, name: p.nick };
  const op = { car: m.opponent.simCar, carId: m.opponent.carId, visual: m.opponent.visual, name: m.opponent.nick };
  versus(ctx, me, op, m.startAt - 2500).then(() => runScene(ctx, me, op, false, m));
}

function showResults(ctx: RaceContext, r: FinishResponse, oppName: string, online: any, again: () => void) {
  const pl = r.player, op = r.opp, rw = r.rewards ?? online?.rewards ?? null;
  const win = online ? online.win : rw ? rw.win : (!pl.falseStart && !pl.dnf && (!op || op.falseStart || op.dnf || pl.time < op.time));
  win ? sfx.win() : sfx.lose();
  const wear = rw?.wearApplied ?? pl.wear;
  const wearRows = PART_KINDS.filter((k) => (wear[k] ?? 0) >= 0.1).map((k) =>
    h('div', { class: 'stat' }, PARTS[k].icon + ' ' + PARTS[k].name, h('b', { class: (wear[k] ?? 0) > 2 ? 'down' : '' }, '−' + (wear[k] ?? 0).toFixed(1) + '%')));
  const oppTime = online ? online.them : op?.time ?? 0;
  modal((close) => [
    h('div', { class: 'result-big ' + (win ? 'win' : 'lose') }, pl.falseStart ? 'ФАЛЬСТАРТ' : win ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ'),
    online?.reason ? h('p', { class: 'muted', style: { textAlign: 'center' } }, online.reason) : null,
    h('div', { class: 'grid', style: { gridTemplateColumns: '1fr 1fr' } },
      h('div', { class: 'panel' }, h('h3', null, 'Ты'),
        h('div', { class: 'stat' }, 'Время', h('b', null, pl.falseStart ? 'фальстарт' : fmtTime(pl.time))),
        h('div', { class: 'stat' }, 'Скорость на финише', h('b', null, (pl.finishV * 3.6).toFixed(1) + ' км/ч')),
        h('div', { class: 'stat' }, 'Реакция', h('b', { class: pl.falseStart ? 'down' : pl.reaction < 0.25 ? 'up' : '' }, pl.falseStart ? `раньше на ${Math.abs(pl.reaction).toFixed(3)} с` : pl.reaction ? pl.reaction.toFixed(3) + ' с' : '—')),
        h('div', { class: 'stat' }, 'Старт', h('b', null, { perfect: '✓ идеальный', spin: 'пробуксовка', bog: 'мало оборотов', none: '—' }[pl.launch])),
        h('div', { class: 'stat' }, 'Идеальные переключения', h('b', { class: 'up' }, `${pl.perfectShifts}/${pl.shifts}`)),
        pl.earlyShifts + pl.lateShifts ? h('div', { class: 'stat' }, 'Рано / поздно', h('b', null, `${pl.earlyShifts} / ${pl.lateShifts}`)) : null,
        pl.grinds ? h('div', { class: 'stat' }, 'Без сброса газа', h('b', { class: 'down' }, String(pl.grinds))) : null),
      h('div', { class: 'panel' }, h('h3', { style: { color: '#ffd23f' } }, oppName),
        h('div', { class: 'stat' }, 'Время', h('b', null, op?.falseStart ? 'фальстарт' : fmtTime(oppTime))),
        op ? h('div', { class: 'stat' }, 'Скорость', h('b', null, (op.finishV * 3.6).toFixed(1) + ' км/ч')) : null,
        op ? h('div', { class: 'stat' }, 'Реакция', h('b', null, op.reaction.toFixed(3) + ' с')) : null,
        h('h3', { style: { marginTop: '8px' } }, 'Износ'),
        wearRows.length ? wearRows : h('div', { class: 'muted' }, 'Почти без износа'))),
    rw ? h('div', { class: 'panel glow', style: { textAlign: 'center', marginTop: '10px' } },
      h('div', { style: { fontSize: '20px' } }, `💰 +${rw.money}   ⭐ +${rw.xp} XP` + (rw.gold ? `   💎 +${rw.gold}` : '')),
      online?.payout ? h('div', { style: { color: '#ffd23f' } }, `Выигрыш по ставке: 💰 ${online.payout}`) : null,
      rw.record ? h('div', { class: 'up' }, '🏆 Новый личный рекорд!') : null,
      rw.levelUp ? h('div', { style: { color: '#ffd23f' } }, `🎉 Новый уровень ${svc.profile.level}! +ремкомплект`) : null,
      rw.careerAdvanced ? h('div', { class: 'up' }, '📈 Прогресс карьеры!') : null,
      rw.newAchievements.length ? h('div', { style: { color: '#5ce1ff' } }, '🏅 Достижение: ' + rw.newAchievements.join(', ')) : null)
      : r.queued ? h('p', { class: 'muted', style: { textAlign: 'center' } }, '📡 Нет связи: результат сохранён и будет засчитан сервером при подключении.') : null,
    h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '10px' } },
      btn('🔧 Гараж', () => { close(); go('garage'); }, 'dark'),
      btn('Меню', () => { close(); go('menu'); }, 'dark'),
      ctx.tutorial ? null : btn(online ? 'В лобби' : ctx.kind === 'career' ? 'Карьера' : 'Ещё раз', () => { close(); again(); }, 'green')),
  ], { dismiss: false });
  if (ctx.tutorial) setTimeout(() => toast('Обучение пройдено! Загляни в гараж и карьеру', 'ok'), 400);
}

