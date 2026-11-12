import { CAR_MAP, LEAGUES, TRACK_MAP, buildSimCar, carName, performanceIndex, tournamentInfo, type OpponentSpec } from '@drag/shared';
import { svc } from '../../api/service';
import { http } from '../../api/net';
import { carPreview, go, refresh, register } from '../app';
import { btn, fmtTime, guard, h, modal, toast } from '../dom';
import { startRace, startTutorial } from './race';

export function needAccount(): boolean {
  if (svc.mode === 'online') return false;
  modal((close) => [
    h('h2', null, '🔐 Нужен аккаунт'),
    h('p', null, 'Друзья, рейтинги, лобби со ставками и онлайн-заезды доступны после входа. Гостевой гараж хранится только на этом устройстве.'),
    h('div', { class: 'row', style: { justifyContent: 'center' } }, btn('Позже', close, 'dark'), btn('Войти / регистрация', () => { close(); go('auth'); }, 'green')),
  ]);
  return true;
}

register('menu', () => {
  const p = svc.profile;
  const car = p.cars.find((c) => c.uid === p.currentCar)!;
  const tasksReady = p.daily.tasks.filter((t) => t.progress >= t.goal && !t.claimed).length;
  const hero = h('div', { class: 'hero' }, carPreview(car.carId, car.visual, 720, 250, { night: true }),
    h('div', { class: 'over' },
      h('div', null, h('div', { style: { fontSize: '20px' } }, carName(car.carId)), h('div', { class: 'muted' }, `Сила: ${performanceIndex(buildSimCar(car)).toFixed(2)} с на 402 м`)),
      btn('🔧 Гараж', () => go('garage'), 'orange small')));
  const L = LEAGUES[p.career.league];
  const el = h('div', null, hero,
    !p.tutorialDone ? h('div', { class: 'panel glow', style: { marginBottom: '12px' } }, h('div', { class: 'row between' },
      h('div', null, h('h3', null, '🎓 Первый заезд'), h('div', { class: 'muted' }, 'Короткое обучение: старт, переключения, нитро.')),
      btn('Начать', startTutorial, 'gold'))) : null,
    h('div', { class: 'hub' },
      btn([h('span', { class: 'ic' }, '🏆'), 'Карьера', h('span', { class: 'small' }, L ? `${L.name} ${p.career.beaten}/5` : 'пройдена')], () => go('career'), 'orange'),
      btn([h('span', { class: 'ic' }, '🏁'), 'Быстрый заезд'], () => go('quick'), 'green'),
      btn([h('span', { class: 'ic' }, '🌐'), 'Онлайн-лобби'], () => { if (!needAccount()) go('lobby'); }, 'purple'),
      btn([h('span', { class: 'ic' }, '🗓'), 'Турнир выходных'], () => { if (!needAccount()) go('tournament'); }, 'red'),
      btn([h('span', { class: 'ic' }, '🔧'), 'Гараж'], () => go('garage')),
      btn([h('span', { class: 'ic' }, '🚗'), 'Автосалон'], () => go('dealer')),
      btn([h('span', { class: 'ic' }, '👥'), 'Друзья'], () => { if (!needAccount()) go('friends'); }),
      btn([h('span', { class: 'ic' }, '📊'), 'Рейтинги'], () => { if (!needAccount()) go('leaders'); }),
      btn([h('span', { class: 'ic' }, '📰'), 'Стена'], () => { if (!needAccount()) go('wall', { userId: (svc as any).userId }); }),
      btn([h('span', { class: 'ic' }, '📋'), 'Задания' + (tasksReady ? ` (${tasksReady})` : '')], () => go('tasks'), tasksReady ? 'gold' : ''),
      btn([h('span', { class: 'ic' }, '🏅'), 'Достижения'], () => go('achievements')),
      btn([h('span', { class: 'ic' }, '⚙'), 'Настройки'], () => go('settings'), 'dark'),
    ),
    svc.mode === 'guest' ? h('p', { class: 'muted', style: { textAlign: 'center', marginTop: '14px' } }, 'Гостевой режим: прогресс хранится на этом устройстве. ', h('a', { href: '#', style: { color: '#5ce1ff' }, onClick: (e: Event) => { e.preventDefault(); go('auth'); } }, 'Войти в аккаунт')) : null,
  );
  return el;
});

register('career', () => {
  const p = svc.profile;
  const el = h('div', null, h('h1', null, '🏆 Карьера'), h('p', { class: 'muted' }, 'Четыре лиги по пять соперников. В конце каждой — босс. Побеждай по порядку.'));
  LEAGUES.forEach((L, li) => {
    const locked = li > p.career.league || p.level < L.unlock;
    const done = li < p.career.league || (li === LEAGUES.length - 1 && p.stats.bossesBeaten >= LEAGUES.length);
    const panel = h('div', { class: 'panel' + (li === p.career.league && !locked ? ' glow' : '') },
      h('div', { class: 'row between' }, h('h2', null, `${li + 1}. ${L.name}`), done ? h('span', { class: 'pill ok' }, '✓ пройдена') : locked ? h('span', { class: 'pill' }, `🔒 ур. ${L.unlock}`) : null));
    const list = h('div', { class: 'list' });
    L.bots.forEach((b, bi) => {
      const beaten = done || (li === p.career.league && bi < p.career.beaten);
      const avail = !locked && li === p.career.league && bi === p.career.beaten;
      list.append(h('div', { class: 'item' },
        h('div', { class: 'ava', style: { background: b.paint } }, b.boss ? '👑' : '🏎'),
        h('div', { class: 'grow' }, h('div', null, b.name, b.boss ? h('span', { class: 'pill boss', style: { marginLeft: '6px' } }, 'БОСС') : null),
          h('div', { class: 'muted small' }, `${carName(b.carId)} · тюнинг ${b.tune.toFixed(1)} · ${b.distance} м · ${TRACK_MAP[b.trackId].short}`)),
        beaten ? h('span', { class: 'up' }, '✓') : avail ? btn('Вызов ⛽1', () => startRace({ kind: 'career', trackId: b.trackId, distance: b.distance, careerIndex: bi }), 'green small') : h('span', { class: 'muted' }, '🔒')));
    });
    panel.append(list);
    el.append(panel);
  });
  return el;
});

register('tournament', async () => {
  const info = await http<any>('GET', '/api/tournament').catch(() => null);
  const t = info?.info ?? tournamentInfo(Date.now());
  const el = h('div', null, h('h1', null, '🗓 Турнир выходного дня'),
    h('div', { class: 'panel glow' },
      h('div', { class: 'row between' }, h('h2', null, TRACK_MAP[t.trackId].name), h('span', { class: 'pill' }, `${t.distance} м`)),
      h('p', { class: 'muted' }, 'Суббота и воскресенье: лучший результат на трассе недели. Топ-3 получают кристаллы и монеты после окончания турнира. Каждая попытка — 1 топливо.'),
      t.active ? btn('🏁 Попытка (⛽1)', () => startRace({ kind: 'tournament', trackId: t.trackId, distance: t.distance }), 'green big block')
        : h('p', { style: { color: '#ffd23f' } }, 'Турнир откроется в субботу. Пока можно потренироваться в быстром заезде на этой трассе.')),
    h('div', { class: 'panel' }, h('h3', null, 'Таблица'),
      info?.top?.length ? h('div', { class: 'list' }, ...info.top.map((r: any, i: number) => h('div', { class: 'item' },
        h('div', { class: 'ava' }, i < 3 ? ['🥇', '🥈', '🥉'][i] : String(i + 1)), h('div', { class: 'grow' }, r.nick, h('div', { class: 'muted small' }, carName(r.carId))), h('b', null, fmtTime(r.time)))))
        : h('p', { class: 'muted' }, 'Пока нет результатов')),
    info?.awarded ? h('p', { class: 'up' }, info.awarded) : null);
  return el;
});

/** Гонка с «призраком» (записанный заезд другого игрока). */
export async function raceGhost(ghostId: string) {
  await startRace({ kind: 'ghost', trackId: 'neon', distance: 402, ghostId } as any);
}

export function ghostLabel(o: OpponentSpec) { return o.type === 'ghost' ? '👻 ' + o.name : o.name; }
export { CAR_MAP, refresh, guard, toast };
