import './style.css';
import { TRACK_MAP } from '@drag/shared';
import { LocalService, RemoteService, restoreSession, setService, svc } from './api/service';
import { socket } from './api/net';
import { unlockAudio } from './game/audio';
import { go, mountApp } from './ui/app';
import { btn, h, modal, toast } from './ui/dom';
import './ui/screens/menu';
import './ui/screens/garage';
import './ui/screens/paint';
import './ui/screens/race';
import './ui/screens/misc';
import './ui/screens/social';
import './ui/screens/lobby';
import { runOnlineMatch } from './ui/screens/race';

// ── iOS Safari: без зума двойным тапом/щипком, звук после первого касания ──
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
let lastTouch = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouch < 300 && !(e.target as HTMLElement).closest('input,textarea,select')) e.preventDefault();
  lastTouch = now;
}, { passive: false });
const unlock = () => { unlockAudio(); };
['touchstart', 'pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, unlock, { passive: true }));

const TIPS = [
  'Совет: переключайся, когда загорятся все шифт-лампы.',
  'Совет: старт на слишком высоких оборотах сжигает сцепление.',
  'Совет: дешёвая машина с хорошим тюнингом обгонит дорогую.',
  'Совет: на мокром порту сцепление хуже — стартуй на меньших оборотах.',
  'Совет: переключение без сброса газа убивает коробку.',
  'Совет: бонус за вход доступен каждые 8 часов.',
];

function loader() {
  const bar = h('i');
  const el = h('div', { class: 'loader' },
    h('div', { class: 'logo' }, 'НИТРО', h('br'), 'ДВОР', h('small', null, 'DRAG · STREET · TUNING')),
    h('div', { class: 'spin-wheel' }),
    h('div', { class: 'pbar' }, bar),
    h('div', { class: 'tip' }, TIPS[Math.floor(Math.random() * TIPS.length)]));
  document.body.appendChild(el);
  return {
    set: (p: number) => (bar.style.width = Math.round(p * 100) + '%'),
    done: () => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); },
  };
}

async function boot() {
  const L = loader();
  L.set(0.15);
  // имитация «флеш-загрузки»: прогреваем шрифты и кэши фонов
  await (document as any).fonts?.ready?.catch?.(() => {});
  L.set(0.45);
  const remote = await restoreSession();
  L.set(0.8);
  setService(remote ?? new LocalService());
  mountApp(document.getElementById('app')!);
  if (remote) socket.connect();
  await go('menu');
  L.set(1);
  setTimeout(L.done, 250);
  if (remote && remote.pendingCount()) toast(`📡 ${remote.pendingCount()} заезд(ов) ждут отправки на сервер`);
}

// ── глобальные онлайн-события ──
socket.on((m) => {
  if (m.t === 'match') runOnlineMatch(m.m);
  else if (m.t === 'invite') {
    modal((close) => [
      h('h2', null, '⚔ Вызов от ' + m.from.nick),
      h('p', null, `${m.distance} м · ${TRACK_MAP[m.trackId]?.name ?? ''}` + (m.bet ? ` · ставка 💰${m.bet}` : '')),
      h('div', { class: 'row', style: { justifyContent: 'center' } },
        btn('Отказаться', () => { socket.send({ t: 'invite.answer', inviteId: m.inviteId, accept: false }); close(); }, 'dark'),
        btn('Принять!', () => { socket.send({ t: 'invite.answer', inviteId: m.inviteId, accept: true }); close(); }, 'green')),
    ], { dismiss: false });
  } else if (m.t === 'invite.result' && !m.accepted) toast(m.reason ?? 'Вызов отклонён', 'err');
  else if (m.t === 'error' && m.msg !== '__disconnected') toast(m.msg, 'err');
  else if (m.t === 'profile.dirty' && svc instanceof RemoteService) svc.load().catch(() => {});
});

window.addEventListener('online', () => { if (svc instanceof RemoteService) svc.load().then(() => toast('Связь восстановлена', 'ok')).catch(() => {}); });

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

boot();
