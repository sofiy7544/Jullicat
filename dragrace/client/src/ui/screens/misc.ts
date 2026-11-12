import { ACHIEVEMENTS, DAILY_POOL, FUEL_GOLD_PRICE } from '@drag/shared';
import { LocalService, login, restoreSession, setService, svc } from '../../api/service';
import { socket } from '../../api/net';
import { setVolume } from '../../game/audio';
import { platform } from '../../platform';
import { saveSettings, settings } from '../../settings';
import { go, mountApp, refresh, register } from '../app';
import { btn, confirmBox, guard, h, toast } from '../dom';

register('tasks', () => {
  const p = svc.profile;
  const el = h('div', null, h('h1', null, '📋 Ежедневные задания'), h('p', { class: 'muted' }, 'Новые задания каждый день в 00:00 UTC.'));
  const list = h('div', { class: 'list' });
  for (const t of p.daily.tasks) {
    const def = DAILY_POOL.find((d) => d.id === t.id)!;
    const done = t.progress >= t.goal;
    list.append(h('div', { class: 'item' },
      h('div', { class: 'ava' }, t.claimed ? '✓' : done ? '🎁' : '📋'),
      h('div', { class: 'grow' }, def.title, h('div', { class: 'bar', style: { marginTop: '4px' } }, h('i', { class: 'cond-good', style: { width: (t.progress / t.goal) * 100 + '%' } })),
        h('div', { class: 'muted small' }, `${t.progress}/${t.goal} · награда 💰${def.money} ⭐${def.xp}${def.gold ? ' 💎' + def.gold : ''}`)),
      t.claimed ? h('span', { class: 'up' }, 'получено') : btn('Забрать', () => guard(() => svc.op('claimDaily', { id: t.id }), 'Награда получена').then(refresh), done ? 'gold small' : 'dark small', { disabled: !done })));
  }
  el.append(list,
    h('div', { class: 'panel', style: { marginTop: '12px' } }, h('h3', null, '💎 Кристаллы'),
      h('p', { class: 'muted' }, 'Редкая валюта: за достижения, боссов, бонусы и задания. Реальных платежей нет.'),
      h('div', { class: 'row' },
        btn(`⛽ Полный бак за 💎${FUEL_GOLD_PRICE}`, () => guard(() => svc.op('buyFuel'), 'Бак заправлен').then(refresh), 'orange small'),
        btn('💎5 → 💰600', () => guard(() => svc.op('exchangeGold', { gold: 5 }), 'Обменяно').then(refresh), 'dark small'))));
  return el;
});

register('achievements', () => {
  const p = svc.profile;
  const el = h('div', null, h('h1', null, '🏅 Достижения'), h('p', { class: 'muted' }, `Получено ${p.achievements.length} из ${ACHIEVEMENTS.length}`));
  const grid = h('div', { class: 'grid' });
  for (const a of ACHIEVEMENTS) {
    const got = p.achievements.includes(a.id);
    grid.append(h('div', { class: 'panel' + (got ? ' glow' : ' locked') }, h('div', { style: { fontSize: '28px' } }, got ? '🏅' : '🔒'),
      h('h3', null, a.title), h('div', { class: 'muted small' }, a.desc), h('div', { class: 'small', style: { color: '#5ce1ff' } }, '💎 ' + a.gold)));
  }
  const s = p.stats;
  el.append(grid, h('div', { class: 'panel', style: { marginTop: '12px' } }, h('h3', null, 'Статистика'),
    h('div', { class: 'stat' }, 'Заездов / побед', h('b', null, `${s.races} / ${s.wins}`)),
    h('div', { class: 'stat' }, 'Идеальных переключений', h('b', null, String(s.perfectShifts))),
    h('div', { class: 'stat' }, 'Лучшая реакция', h('b', null, s.bestReaction != null ? s.bestReaction.toFixed(3) + ' с' : '—')),
    ...([201, 402, 804] as const).map((d) => h('div', { class: 'stat' }, `Рекорд ${d} м`, h('b', null, s.bestTimes[d] ? s.bestTimes[d]!.toFixed(3) + ' с' : '—')))));
  return el;
});

register('settings', () => {
  const tog = (label: string, key: 'sound' | 'vibration' | 'showHints') => h('label', { class: 'item' },
    h('span', { class: 'grow' }, label),
    h('input', { type: 'checkbox', checked: settings[key], onChange: (e: any) => { settings[key] = e.target.checked; saveSettings(); } }));
  const el = h('div', null, h('h1', null, '⚙ Настройки'),
    h('div', { class: 'panel' }, h('div', { class: 'list' },
      tog('Звук', 'sound'),
      h('div', { class: 'item' }, h('span', null, 'Громкость'), h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(settings.volume), class: 'grow', onInput: (e: any) => { settings.volume = +e.target.value; setVolume(settings.volume); saveSettings(); } })),
      tog('Вибрация (Android / iOS-приложение)', 'vibration'),
      h('div', { class: 'item' }, h('span', { class: 'grow' }, 'Коробка передач'),
        h('div', { class: 'tabs', style: { margin: 0 } },
          btn('Ручная', () => { settings.gearbox = 'manual'; saveSettings(); refresh(); }, settings.gearbox === 'manual' ? 'on small' : 'dark small'),
          btn('Полуавтомат', () => { settings.gearbox = 'semi'; saveSettings(); refresh(); }, settings.gearbox === 'semi' ? 'on small' : 'dark small'))),
      h('div', { class: 'muted small', style: { padding: '0 10px' } }, 'Полуавтомат сам сбрасывает газ при переключении (нет износа коробки), но переключение чуть медленнее.'),
      h('div', { class: 'item' }, h('span', { class: 'grow' }, 'Качество графики'),
        h('div', { class: 'tabs', style: { margin: 0 } },
          btn('Высокое', () => { settings.quality = 'high'; saveSettings(); refresh(); }, settings.quality === 'high' ? 'on small' : 'dark small'),
          btn('Экономия', () => { settings.quality = 'low'; saveSettings(); refresh(); }, settings.quality === 'low' ? 'on small' : 'dark small'))))),
    h('div', { class: 'panel' }, h('h3', null, 'Аккаунт'),
      h('p', null, svc.mode === 'online' ? `Вы вошли как ${svc.profile.nick}` : 'Гостевой режим (прогресс на этом устройстве)'),
      h('div', { class: 'row' },
        svc.mode === 'online'
          ? btn('Выйти', async () => { (svc as any).logout(); setService(new LocalService()); mountApp(document.getElementById('app')!); go('menu'); }, 'red')
          : btn('Войти / регистрация', () => go('auth'), 'green'),
        svc.mode === 'guest' ? btn('Сбросить гостевой прогресс', async () => { if (await confirmBox('Удалить весь гостевой прогресс?')) { (svc as LocalService).reset(); go('menu'); } }, 'dark') : null)),
    h('div', { class: 'panel' }, h('h3', null, 'Управление с клавиатуры'),
      h('div', { class: 'muted' }, '↑ / W — газ · Пробел / S — сцепление · → / E — передача вверх · ← / Q — вниз · N / Shift — нитро · Esc — выход')),
    h('p', { class: 'muted small', style: { textAlign: 'center' } }, `Платформа: ${platform} · v0.1`));
  return el;
});

register('auth', () => {
  const nick = h('input', { class: 'field', placeholder: 'Ник (3–16 символов)', maxLength: 16, autocomplete: 'username' }) as HTMLInputElement;
  const pass = h('input', { class: 'field', type: 'password', placeholder: 'Пароль (от 6 символов)', autocomplete: 'current-password' }) as HTMLInputElement;
  const doIt = async (reg: boolean) => {
    const ok = await guard(() => login(nick.value.trim(), pass.value, reg));
    if (ok === undefined) return;
    const s = await restoreSession();
    if (!s) return toast('Не удалось загрузить профиль', 'err');
    setService(s);
    socket.connect();
    mountApp(document.getElementById('app')!);
    toast(reg ? 'Аккаунт создан!' : 'С возвращением!', 'ok');
    go('menu');
  };
  return h('div', { class: 'center', style: { maxWidth: '420px', margin: '0 auto' } },
    h('h1', { style: { textAlign: 'center' } }, '🔐 Вход в Нитро-Двор'),
    h('div', { class: 'panel glow' },
      h('label', { class: 'f' }, 'Ник'), nick, h('label', { class: 'f' }, 'Пароль'), pass,
      h('div', { class: 'row', style: { marginTop: '12px' } }, btn('Войти', () => doIt(false), 'green grow'), btn('Регистрация', () => doIt(true), 'orange grow')),
      h('p', { class: 'muted small' }, 'Аккаунт нужен для друзей, рейтингов и онлайна. Деньги и детали хранятся на сервере. Вход через VK ID — в следующей версии.')),
    h('p', { class: 'muted small' }, 'Гостевой прогресс не переносится в аккаунт.'));
});
