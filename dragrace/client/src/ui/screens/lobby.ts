import { TRACKS, TRACK_MAP, buildSimCar, carName, peakPower, performanceIndex, type ChatMsg, type Distance, type LobbyEntry } from '@drag/shared';
import { svc } from '../../api/service';
import { http, socket } from '../../api/net';
import { currentScreen, go, register } from '../app';
import { btn, fmtTime, guard, h, money, toast } from '../dom';
import { startRace } from './race';

let entries: LobbyEntry[] = [];
let online = 0;
let chat: ChatMsg[] = [];
let searching = false;
let myDist: Distance = 402, myTrack = 'neon', myBet = 100;

socket.on((m) => {
  if (m.t === 'lobby.list') { entries = m.entries; online = m.online; renderList(); }
  else if (m.t === 'chat.history') { chat = m.msgs; renderChat(); }
  else if (m.t === 'chat') { chat.push(m.msg); if (chat.length > 100) chat.shift(); renderChat(); }
  else if (m.t === 'quick.status') {
    searching = m.searching;
    renderQuick();
    if (m.ghostFallback) ghostFallback();
  }
});

let onlineEl: HTMLElement | null = null;
let listEl: HTMLElement | null = null, chatEl: HTMLElement | null = null, quickEl: HTMLElement | null = null;

function renderList() {
  if (!listEl || currentScreen() !== 'lobby') return;
  listEl.innerHTML = '';
  if (onlineEl) onlineEl.textContent = 'онлайн: ' + online;
  const meId = (svc as any).userId;
  const mine = entries.find((e) => e.hostId === meId);
  if (mine) listEl.append(h('div', { class: 'panel glow' }, h('div', { class: 'row between' },
    h('div', null, h('h3', null, '⏳ Ваш заезд ждёт соперника'), h('div', { class: 'muted small' }, `${mine.distance} м · ${TRACK_MAP[mine.trackId].short} · ставка ${money(mine.bet)}`)),
    btn('Отменить', () => socket.send({ t: 'lobby.cancel' }), 'red small'))));
  const others = entries.filter((e) => e.hostId !== meId);
  if (!others.length) listEl.append(h('p', { class: 'muted' }, 'Открытых заездов нет — создай свой!'));
  for (const e of others) {
    listEl.append(h('div', { class: 'item' },
      h('div', { class: 'ava' }, '🏁'),
      h('div', { class: 'grow card', onClick: () => go('player', { id: e.hostId }) },
        h('div', null, e.hostNick, ' ', h('span', { class: 'pill' }, 'ур. ' + e.hostLevel)),
        h('div', { class: 'muted small' }, `${carName(e.car.carId)} · сила ${e.car.pi.toFixed(2)} с · ${e.distance} м · ${TRACK_MAP[e.trackId].short}`)),
      h('b', { style: { color: '#ffd23f' } }, money(e.bet)),
      btn('Принять ⛽1', () => socket.send({ t: 'lobby.accept', id: e.id }), 'green small', { disabled: !!mine || svc.profile.money < e.bet })));
  }
}

function renderChat() {
  if (!chatEl) return;
  chatEl.innerHTML = '';
  for (const m of chat) chatEl.append(h('div', null, h('b', null, m.nick + ': '), m.text));
  chatEl.scrollTop = chatEl.scrollHeight;
}

function renderQuick() {
  if (!quickEl) return;
  quickEl.innerHTML = '';
  quickEl.append(searching
    ? h('div', { class: 'row' }, h('div', { class: 'spin-wheel', style: { width: '28px', height: '28px', borderWidth: '4px' } }), h('span', { class: 'grow' }, `Ищем соперника на ${myDist} м по силе машины…`), btn('Стоп', () => socket.send({ t: 'quick.leave' }), 'dark small'))
    : h('div', { class: 'row' }, h('span', { class: 'grow muted' }, 'Подбор живого соперника по силе машины. Если никого нет — заезд с призраком похожей силы.'), btn('🎯 Быстрый подбор', () => socket.send({ t: 'quick.join', distance: myDist }), 'purple')));
}

async function ghostFallback() {
  const r = await guard(() => http<any>('GET', `/api/ghosts/match?distance=${myDist}`));
  if (!r?.ghost) return toast('Живых соперников нет, а призраков пока не записано', 'err');
  toast(`Соперник не найден — едем с призраком ${r.ghost.nick}`);
  startRace({ kind: 'ghost', trackId: r.ghost.trackId, distance: r.ghost.distance, ghostId: r.ghost.id });
}

register('lobby', () => {
  socket.connect();
  socket.send({ t: 'lobby.subscribe' });
  const car = svc.profile.cars.find((c) => c.uid === svc.profile.currentCar)!;
  listEl = h('div', { class: 'list' });
  onlineEl = h('span', { class: 'pill on' }, 'онлайн: ' + online);
  chatEl = h('div', { class: 'chat' });
  quickEl = h('div');
  const input = h('input', { class: 'field', placeholder: 'Сообщение в чат лобби…', maxLength: 200 }) as HTMLInputElement;
  const send = () => { const t = input.value.trim(); if (t) { socket.send({ t: 'chat', text: t }); input.value = ''; } };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  const form = h('div');
  const renderForm = () => {
    form.innerHTML = '';
    form.append(
      h('div', { class: 'tabs' }, ...([201, 402, 804] as Distance[]).map((d) => btn(d + ' м', () => { myDist = d; renderForm(); renderQuick(); }, myDist === d ? 'on small' : 'dark small'))),
      h('select', { class: 'field', onChange: (e: any) => (myTrack = e.target.value) }, ...TRACKS.filter((t) => t.unlock <= svc.profile.level).map((t) => h('option', { value: t.id, selected: t.id === myTrack }, t.name))),
      h('label', { class: 'f' }, 'Ставка (💰, победитель забирает банк минус 5%)'),
      h('div', { class: 'tabs' }, ...[0, 100, 250, 500, 1000, 2500].map((b) => btn(b ? String(b) : 'без ставки', () => { myBet = b; renderForm(); }, myBet === b ? 'on small' : 'dark small', { disabled: b > svc.profile.money }))),
      btn('➕ Создать заезд', () => socket.send({ t: 'lobby.create', distance: myDist, trackId: myTrack, bet: myBet }), 'green block'));
  };
  renderForm();
  const el = h('div', null,
    h('div', { class: 'row between' }, h('h1', null, '🌐 Онлайн-лобби'), onlineEl),
    h('div', { class: 'panel' }, quickEl),
    h('div', { class: 'grid wide', style: { marginTop: '10px' } },
      h('div', { class: 'panel' }, h('h3', null, 'Открытые вызовы'), listEl),
      h('div', { class: 'panel' }, h('h3', null, 'Создать вызов'), h('div', { class: 'muted small' }, `Твоя машина: ${carName(car.carId)} · ${peakPower(buildSimCar(car)).hp.toFixed(0)} л.с. · сила ${performanceIndex(buildSimCar(car)).toFixed(2)} с`), form)),
    h('div', { class: 'panel' }, h('h3', null, '💬 Чат лобби'), chatEl, h('div', { class: 'row', style: { marginTop: '6px' } }, h('div', { class: 'grow' }, input), btn('➤', send, 'small'))));
  setTimeout(() => { renderList(); renderChat(); renderQuick(); });
  return el;
});

export { fmtTime };
