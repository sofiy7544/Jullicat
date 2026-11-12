import { GIFT_KINDS, TRACKS, TRACK_MAP, carName, type Distance, type GiftKind, type PublicProfile } from '@drag/shared';
import { svc } from '../../api/service';
import { http, socket } from '../../api/net';
import { carPreview, go, refresh, register } from '../app';
import { btn, fmtTime, guard, h, modal, timeAgo, toast } from '../dom';
import { startRace } from './race';

const me = () => (svc as any).userId as string;

function userRow(u: any, right: any) {
  return h('div', { class: 'item' },
    h('div', { class: 'ava' }, u.online ? '🟢' : '👤'),
    h('div', { class: 'grow card', onClick: () => go('player', { id: u.id }) }, h('div', null, u.nick, ' ', h('span', { class: 'pill' }, 'ур. ' + u.level)),
      h('div', { class: 'muted small' }, (u.carId ? carName(u.carId) : '') + (u.pi ? ` · сила ${u.pi.toFixed(2)} с` : ''))),
    right);
}

register('friends', async () => {
  const [fr, gifts] = await Promise.all([http<any>('GET', '/api/friends'), http<any>('GET', '/api/gifts')]);
  const q = h('input', { class: 'field', placeholder: 'Поиск игроков по нику…' }) as HTMLInputElement;
  const results = h('div', { class: 'list' });
  const search = async () => {
    const r = await guard(() => http<any>('GET', '/api/users/search?q=' + encodeURIComponent(q.value.trim())));
    results.innerHTML = '';
    if (!r) return;
    if (!r.users.length) results.append(h('div', { class: 'muted' }, 'Никого не нашли'));
    for (const u of r.users) results.append(userRow(u, u.id === me() ? h('span', { class: 'muted' }, 'это вы') : btn('+ В друзья', () => guard(() => http('POST', '/api/friends/request', { userId: u.id }), 'Заявка отправлена'), 'small')));
  };
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
  const el = h('div', null, h('h1', null, '👥 Друзья'),
    gifts.gifts.length ? h('div', { class: 'panel glow' }, h('h3', null, '🎁 Подарки для вас'), h('div', { class: 'list' }, ...gifts.gifts.map((g: any) => h('div', { class: 'item' },
      h('div', { class: 'ava' }, GIFT_KINDS[g.kind as GiftKind].icon), h('div', { class: 'grow' }, `${GIFT_KINDS[g.kind as GiftKind].title} от ${g.fromNick}`, h('div', { class: 'muted small' }, timeAgo(g.at))),
      btn('Забрать', async () => { const r = await guard(() => http<any>('POST', '/api/gifts/claim', { id: g.id }), 'Подарок получен!'); if (r) { (svc as any).setProfile(r.profile); refresh(); } }, 'gold small'))))) : null,
    fr.incoming.length ? h('div', { class: 'panel' }, h('h3', null, 'Заявки в друзья'), h('div', { class: 'list' }, ...fr.incoming.map((u: any) => userRow(u, h('div', { class: 'row' },
      btn('✓', () => guard(() => http('POST', '/api/friends/respond', { userId: u.id, accept: true }), 'Теперь вы друзья').then(refresh), 'green small'),
      btn('✕', () => guard(() => http('POST', '/api/friends/respond', { userId: u.id, accept: false })).then(refresh), 'dark small')))))) : null,
    h('div', { class: 'panel' }, h('h3', null, `Мои друзья (${fr.friends.length})`),
      fr.friends.length ? h('div', { class: 'list' }, ...fr.friends.map((u: any) => userRow(u, h('div', { class: 'row' },
        btn('⚔ Вызов', () => challenge(u), 'orange small'),
        btn('🎁', () => giftDialog(u), 'dark small'))))) : h('p', { class: 'muted' }, 'Найди соперников через поиск ниже.')),
    fr.outgoing.length ? h('div', { class: 'panel' }, h('h3', null, 'Отправленные заявки'), h('div', { class: 'list' }, ...fr.outgoing.map((u: any) => userRow(u, h('span', { class: 'muted small' }, 'ожидает'))))) : null,
    h('div', { class: 'panel' }, h('h3', null, 'Все игроки'), h('div', { class: 'row' }, h('div', { class: 'grow' }, q), btn('Найти', search, 'small')), h('div', { style: { marginTop: '8px' } }, results)));
  search();
  return el;
});

export function giftDialog(u: { id: string; nick: string }) {
  modal((close) => [h('h2', null, '🎁 Подарок для ' + u.nick), h('p', { class: 'muted' }, 'Один подарок каждому другу в сутки. Тебе это ничего не стоит.'),
    h('div', { class: 'list' }, ...(Object.keys(GIFT_KINDS) as GiftKind[]).map((k) => h('div', { class: 'item' }, h('div', { class: 'ava' }, GIFT_KINDS[k].icon),
      h('div', { class: 'grow' }, GIFT_KINDS[k].title, h('div', { class: 'muted small' }, GIFT_KINDS[k].desc)),
      btn('Подарить', async () => { if (await guard(() => http('POST', '/api/gifts/send', { toId: u.id, kind: k }), 'Подарок отправлен!')) close(); }, 'green small'))))]);
}

export function challenge(u: { id: string; nick: string; online?: boolean }) {
  let dist: Distance = 402, track = 'neon', bet = 0;
  modal((close) => {
    const body = h('div');
    const render = () => {
      body.innerHTML = '';
      body.append(
        h('label', { class: 'f' }, 'Дистанция'), h('div', { class: 'tabs' }, ...([201, 402, 804] as Distance[]).map((d) => btn(d + ' м', () => { dist = d; render(); }, dist === d ? 'on small' : 'dark small'))),
        h('label', { class: 'f' }, 'Трасса'), h('select', { class: 'field', onChange: (e: any) => (track = e.target.value) }, ...TRACKS.map((t) => h('option', { value: t.id, selected: t.id === track }, t.name))),
        h('label', { class: 'f' }, 'Ставка (только онлайн)'), h('input', { class: 'field', type: 'number', min: '0', step: '50', value: String(bet), onInput: (e: any) => (bet = Math.max(0, +e.target.value || 0)) }));
    };
    render();
    return [h('h2', null, '⚔ Вызов: ' + u.nick), body,
      h('div', { class: 'row', style: { marginTop: '10px', justifyContent: 'center' } },
        btn('🌐 Онлайн сейчас', () => { socket.send({ t: 'invite', userId: u.id, distance: dist, trackId: track, bet }); toast('Приглашение отправлено. Ждём ответа…'); close(); }, 'purple', { disabled: u.online === false }),
        btn('👻 Против призрака', async () => {
          const g = await guard(() => http<any>('GET', `/api/users/${u.id}`));
          const gh = g?.ghosts?.find((x: any) => x.distance === dist) ?? g?.ghosts?.[0];
          if (!gh) return toast('У игрока ещё нет записанных заездов', 'err');
          close(); startRace({ kind: 'ghost', trackId: gh.trackId, distance: gh.distance, ghostId: gh.id });
        }, 'dark'))];
  });
}

register('player', async ({ id }) => {
  const u = await http<PublicProfile & { ghosts: any[]; friendState: string }>('GET', '/api/users/' + id);
  const isMe = id === me();
  const car = u.cars.find((c) => c.name === u.currentCar) ?? u.cars[0];
  const el = h('div', null,
    h('div', { class: 'row between' }, h('h1', null, `👤 ${u.nick}`), h('span', { class: 'pill' }, `уровень ${u.level}` + (u.online ? ' · 🟢 онлайн' : ''))),
    car ? h('div', { class: 'hero' }, carPreview(car.carId, car.visual, 720, 240)) : null,
    h('div', { class: 'row' },
      isMe ? null : u.friendState === 'friend' ? btn('⚔ Вызов', () => challenge(u as any), 'orange') : u.friendState === 'none' ? btn('+ В друзья', () => guard(() => http('POST', '/api/friends/request', { userId: id }), 'Заявка отправлена'), 'green') : h('span', { class: 'pill' }, 'заявка: ' + u.friendState),
      !isMe && u.friendState === 'friend' ? btn('🎁 Подарок', () => giftDialog(u as any), 'dark') : null,
      btn('📰 Стена', () => go('wall', { userId: id }), 'dark')),
    h('div', { class: 'grid wide', style: { marginTop: '10px' } },
      h('div', { class: 'panel' }, h('h3', null, 'Статистика'),
        h('div', { class: 'stat' }, 'Заездов / побед', h('b', null, `${u.stats.races} / ${u.stats.wins}`)),
        h('div', { class: 'stat' }, 'Боссов побеждено', h('b', null, String(u.stats.bossesBeaten))),
        ...([201, 402, 804] as const).map((d) => h('div', { class: 'stat' }, `Рекорд ${d} м`, h('b', null, fmtTime(u.stats.bestTimes[d] ?? 0)))),
        h('div', { class: 'stat' }, 'Достижений', h('b', null, String(u.achievements.length)))),
      h('div', { class: 'panel' }, h('h3', null, '👻 Записанные заезды'),
        u.ghosts.length ? h('div', { class: 'list' }, ...u.ghosts.map((g: any) => h('div', { class: 'item' },
          h('div', { class: 'grow' }, `${g.distance} м · ${TRACK_MAP[g.trackId]?.short}`, h('div', { class: 'muted small' }, carName(g.carId) + ' · ' + fmtTime(g.time))),
          isMe ? null : btn('Гонка ⛽1', () => startRace({ kind: 'ghost', trackId: g.trackId, distance: g.distance, ghostId: g.id }), 'green small'))))
          : h('p', { class: 'muted' }, 'Пока нет'))),
    h('h2', null, `🚗 Гараж (${u.cars.length})`),
    h('div', { class: 'grid wide' }, ...u.cars.map((c) => h('div', { class: 'panel' }, carPreview(c.carId, c.visual, 360, 130), h('div', null, carName(c.carId)),
      h('div', { class: 'muted small' }, `сила ${c.pi.toFixed(2)} с · тюнинг ${(Object.values(c.parts).reduce((a, p) => a + p.lvl, 0) / 10).toFixed(1)}`)))));
  return el;
});

let lbType = 'global';
let lbDist: Distance = 402;
register('leaders', async () => {
  const r = await http<any>('GET', `/api/leaderboard?type=${lbType}&distance=${lbDist}`);
  const el = h('div', null, h('h1', null, '📊 Рейтинги'),
    h('div', { class: 'tabs' }, ...[['global', 'Общий'], ['weekly', 'Недельный'], ['friends', 'Друзья'], ['record', 'Рекорды']].map(([k, n]) => btn(n, () => { lbType = k; refresh(); }, lbType === k ? 'on' : 'dark'))),
    lbType === 'record' ? h('div', { class: 'tabs' }, ...([201, 402, 804] as Distance[]).map((d) => btn(d + ' м', () => { lbDist = d; refresh(); }, lbDist === d ? 'on small' : 'dark small'))) : null,
    h('p', { class: 'muted' }, { global: 'По опыту', weekly: 'Очки за победы на этой неделе', friends: 'Ты и друзья — по опыту', record: 'Лучшее подтверждённое сервером время' }[lbType]),
    h('div', { class: 'list' }, ...r.rows.map((row: any, i: number) => h('div', { class: 'item' + (row.id === me() ? ' sel' : ''), style: row.id === me() ? { borderColor: '#ffd23f' } : {} },
      h('div', { class: 'ava' }, i < 3 ? ['🥇', '🥈', '🥉'][i] : String(i + 1)),
      h('div', { class: 'grow card', onClick: () => go('player', { id: row.id }) }, row.nick, h('div', { class: 'muted small' }, `ур. ${row.level}` + (row.carId ? ' · ' + carName(row.carId) : ''))),
      h('b', null, lbType === 'record' ? fmtTime(row.value) : lbType === 'weekly' ? row.value + ' очк.' : row.value + ' XP')))),
    !r.rows.length ? h('p', { class: 'muted' }, 'Пока пусто') : null);
  return el;
});

register('wall', async ({ userId }) => {
  const uid = userId || me();
  const r = await http<any>('GET', '/api/wall/' + uid);
  const txt = h('input', { class: 'field', placeholder: 'Написать на стене…', maxLength: 200 }) as HTMLInputElement;
  const post = async () => { if (!txt.value.trim()) return; if (await guard(() => http('POST', '/api/wall/' + uid, { text: txt.value.trim() }))) refresh(); };
  const icons: Record<string, string> = { post: '💬', record: '🏆', car: '🚗', level: '⭐', ach: '🏅', gift: '🎁', boss: '👑', win: '🏁', friend: '🤝' };
  return h('div', null, h('h1', null, '📰 Стена ' + (uid === me() ? '' : r.nick)),
    h('p', { class: 'muted' }, uid === me() ? 'Твоя стена: события друзей и твои достижения.' : 'События игрока и сообщения друзей.'),
    h('div', { class: 'row' }, h('div', { class: 'grow' }, txt), btn('Отправить', post, 'green small')),
    h('div', { class: 'list', style: { marginTop: '10px' } }, ...r.posts.map((p: any) => h('div', { class: 'item' },
      h('div', { class: 'ava' }, icons[p.type] ?? '•'),
      h('div', { class: 'grow' }, h('div', null, h('span', { class: 'card', style: { color: '#5ce1ff' }, onClick: () => go('player', { id: p.authorId }) }, p.authorNick), ' ', p.text),
        h('div', { class: 'muted small' }, timeAgo(p.at)))))),
    !r.posts.length ? h('p', { class: 'muted' }, 'Здесь пока тихо') : null);
});
