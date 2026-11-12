// Сквозная проверка сервера: npm -w server test (сервер должен быть запущен).
import { runBot, raceConfig, buildSimCar, type RaceContext, type Profile, type ServerMsg, type MatchInfo } from '@drag/shared';

const BASE = process.env.BASE ?? 'http://localhost:8787';
let fails = 0;
const ok = (cond: unknown, msg: string) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) fails++; };

async function api(token: string | null, method: string, path: string, body?: unknown) {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data: any = await r.json().catch(() => ({}));
  return { status: r.status, ...data };
}

function botInputsFor(ctx: RaceContext, p: Profile, skill = 0.9) {
  const car = p.cars.find((c) => c.uid === ctx.carUid)!;
  return runBot(raceConfig(ctx, buildSimCar(car), true), skill, 77).inputs;
}

const suffix = Math.random().toString(36).slice(2, 7);
console.log('Регистрация');
const A = await api(null, 'POST', '/api/auth/register', { nick: 'Ас_' + suffix, password: 'secret1' });
const B = await api(null, 'POST', '/api/auth/register', { nick: 'Бэ_' + suffix, password: 'secret2' });
ok(A.token && B.token, 'два аккаунта созданы');
ok((await api(null, 'POST', '/api/auth/login', { nick: 'Ас_' + suffix, password: 'wrong!' })).status === 401, 'неверный пароль отклонён');
const meA = await api(A.token, 'GET', '/api/me');
ok(meA.profile?.money === 1500, 'стартовый профиль');

console.log('Экономика только на сервере');
const buy = await api(A.token, 'POST', '/api/op', { op: 'buyPart', args: { uid: 'c1', kind: 'tires', lvl: 1 } });
ok(buy.profile?.cars[0].parts.tires.lvl === 1 && buy.profile.money < 1500, 'шины куплены, деньги списаны');
const bad = await api(A.token, 'POST', '/api/op', { op: 'buyPart', args: { uid: 'c1', kind: 'engine', lvl: 5 } });
ok(bad.status === 400, 'деталь 5 уровня недоступна на 1 уровне: ' + bad.error);
ok((await api(A.token, 'POST', '/api/op', { op: 'hackMoney', args: {} })).status === 400, 'неизвестная операция отклонена');

console.log('Заезд с проверкой');
const st = await api(A.token, 'POST', '/api/race/start', { kind: 'quick', trackId: 'neon', distance: 201 });
ok(st.ctx?.raceId, 'заезд создан, соперник: ' + st.ctx?.opponent?.name);
const inputs = botInputsFor(st.ctx, st.profile);
const fin = await api(A.token, 'POST', '/api/race/finish', { raceId: st.ctx.raceId, inputs, semiAuto: true });
ok(fin.player?.time > 0 && fin.rewards, `сервер пересчитал время: ${fin.player?.time} с, победа: ${fin.rewards?.win}, +${fin.rewards?.money}`);
const again = await api(A.token, 'POST', '/api/race/finish', { raceId: st.ctx.raceId, inputs, semiAuto: true });
ok(again.status === 409, 'повторная отправка отклонена');
const st2 = await api(A.token, 'POST', '/api/race/start', { kind: 'quick', trackId: 'neon', distance: 402 });
const cheat = await api(A.token, 'POST', '/api/race/finish', { raceId: st2.ctx.raceId, inputs: Array.from({ length: 200 }, (_, i) => [i, 2, 1]), semiAuto: true });
ok(cheat.status === 400, 'нечеловеческая запись отклонена: ' + cheat.error);
const st3 = await api(A.token, 'POST', '/api/race/start', { kind: 'quick', trackId: 'neon', distance: 402 });
const fin3 = await api(A.token, 'POST', '/api/race/finish', { raceId: st3.ctx.raceId, inputs: botInputsFor(st3.ctx, st3.profile), semiAuto: true });
ok(fin3.player?.time > 0, 'заезд 402 м засчитан (будет призраком): ' + fin3.player?.time);
const off = await api(A.token, 'POST', '/api/race/offline', { ctx: { ...st3.ctx, raceId: 'offx' + suffix, startedAt: Date.now() - 1000 }, inputs: botInputsFor(st3.ctx, st3.profile), semiAuto: true });
ok(off.player && off.rewards, 'офлайн-заезд перепроверен сервером: ' + off.player?.time);

console.log('Друзья, подарки, стена, призраки');
const idA = meA.userId, idB = (await api(B.token, 'GET', '/api/me')).userId;
await api(A.token, 'POST', '/api/friends/request', { userId: idB });
await api(B.token, 'POST', '/api/friends/respond', { userId: idA, accept: true });
const fr = await api(A.token, 'GET', '/api/friends');
ok(fr.friends?.some((f: any) => f.id === idB), 'дружба подтверждена');
ok((await api(A.token, 'POST', '/api/gifts/send', { toId: idB, kind: 'fuel' })).ok, 'подарок отправлен');
ok((await api(A.token, 'POST', '/api/gifts/send', { toId: idB, kind: 'money' })).status === 409, 'второй подарок за день отклонён');
const gifts = await api(B.token, 'GET', '/api/gifts');
const claimed = await api(B.token, 'POST', '/api/gifts/claim', { id: gifts.gifts[0].id });
ok(claimed.profile, 'подарок получен');
await api(B.token, 'POST', '/api/wall/' + idA, { text: 'Привет, гонщик!' });
const wall = await api(A.token, 'GET', '/api/wall/' + idA);
ok(wall.posts?.length >= 2, `стена: ${wall.posts?.length} записей`);
const prof = await api(B.token, 'GET', '/api/users/' + idA);
ok(prof.ghosts?.length >= 1, 'у игрока A есть призраки: ' + prof.ghosts?.map((g: any) => g.distance).join(','));
const gst = await api(B.token, 'POST', '/api/race/start', { kind: 'ghost', ghostId: prof.ghosts[0].id });
const gfin = await api(B.token, 'POST', '/api/race/finish', { raceId: gst.ctx.raceId, inputs: botInputsFor(gst.ctx, gst.profile, 0.3), semiAuto: true });
ok(gfin.opp?.time > 0, `гонка с призраком: B ${gfin.player?.time} против призрака ${gfin.opp?.time}`);
for (const t of ['global', 'weekly', 'friends', 'record']) { const lb = await api(A.token, 'GET', `/api/leaderboard?type=${t}&distance=402`); ok(Array.isArray(lb.rows), `рейтинг ${t}: ${lb.rows?.length}`); }

console.log('Онлайн: лобби со ставкой');
const wsUrl = BASE.replace('http', 'ws') + '/ws?token=';
function connect(token: string) {
  const ws = new WebSocket(wsUrl + token);
  const msgs: ServerMsg[] = [];
  const waiters: [(m: ServerMsg) => boolean, (m: ServerMsg) => void][] = [];
  ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); msgs.push(m); for (const w of [...waiters]) if (w[0](m)) { waiters.splice(waiters.indexOf(w), 1); w[1](m); } };
  const wait = (f: (m: ServerMsg) => boolean, ms = 10000) => new Promise<ServerMsg>((res, rej) => { const m = msgs.find(f); if (m) return res(m); waiters.push([f, res]); setTimeout(() => rej(new Error('timeout')), ms); });
  return { ws, wait, open: new Promise((r) => (ws.onopen = r)) };
}
const wa = connect(A.token), wb = connect(B.token);
await Promise.all([wa.open, wb.open]);
wa.ws.send(JSON.stringify({ t: 'lobby.subscribe' })); wb.ws.send(JSON.stringify({ t: 'lobby.subscribe' }));
wa.ws.send(JSON.stringify({ t: 'lobby.create', distance: 201, trackId: 'rust', bet: 100 }));
const list = await wb.wait((m) => m.t === 'lobby.list' && m.entries.length > 0) as any;
ok(list.entries[0].car.pi > 0, `B видит вызов A: ставка ${list.entries[0].bet}, сила ${list.entries[0].car.pi.toFixed(2)}`);
const moneyA0 = (await api(A.token, 'GET', '/api/me')).profile.money;
wb.ws.send(JSON.stringify({ t: 'lobby.accept', id: list.entries[0].id }));
const [ma, mb] = await Promise.all([wa.wait((m) => m.t === 'match'), wb.wait((m) => m.t === 'match')]) as any[];
ok(ma.m.seed === mb.m.seed && ma.m.opponent.nick.startsWith('Бэ'), 'матч создан для обоих, общий сид');
wa.ws.send(JSON.stringify({ t: 'race.state', matchId: ma.m.matchId, s: { t: 1, x: 1, v: 1, rpm: 3000, gear: 1, nitro: false, spin: false } }));
ok(!!(await wb.wait((m) => m.t === 'race.state')), 'состояние машины ретранслируется сопернику');
const pa = (await api(A.token, 'GET', '/api/me')).profile, pb = (await api(B.token, 'GET', '/api/me')).profile;
ok(pa.money === moneyA0 - 100, 'ставка списана в банк');
const ctxOf = (m: MatchInfo, p: Profile): RaceContext => ({ raceId: m.raceId, kind: 'online', trackId: m.trackId, distance: m.distance, carUid: p.currentCar, seed: m.seed, opponent: { type: 'bot', name: '', carId: 'borka', tune: 0, skill: 0 }, bet: m.bet, startedAt: Date.now() });
await api(A.token, 'POST', '/api/race/finish', { raceId: ma.m.raceId, inputs: botInputsFor(ctxOf(ma.m, pa), pa, 1), semiAuto: true });
await api(B.token, 'POST', '/api/race/finish', { raceId: mb.m.raceId, inputs: botInputsFor(ctxOf(mb.m, pb), pb, 0.1), semiAuto: true });
const [ra, rb] = await Promise.all([wa.wait((m) => m.t === 'race.result'), wb.wait((m) => m.t === 'race.result')]) as any[];
ok(ra.win !== rb.win, `итог: A ${ra.you} (${ra.win ? 'победа' : 'поражение'}), B ${rb.you}; выплата ${ra.payout || rb.payout}`);
ok((ra.win ? ra.payout : rb.payout) === 190, 'победитель получил банк минус 5%');
wa.ws.close(); wb.ws.close();
console.log(fails ? `\n❌ Ошибок: ${fails}` : '\n✅ Все проверки пройдены');
process.exit(fails ? 1 : 0);
