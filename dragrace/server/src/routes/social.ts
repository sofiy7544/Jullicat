import type { FastifyInstance } from 'fastify';
import { FUEL_MAX, GIFT_KINDS, buildSimCar, dayKey, performanceIndex, weekKey, type PublicCar } from '@drag/shared';
import { db, friendIds, mutate, parseProfile, postEvent } from '../db';
import { HttpError, requireUser } from '../auth';
import { isOnline } from '../ws';

const brief = (u: { id: string; nick: string; level: number; carId: string; pi: number }) => ({ id: u.id, nick: u.nick, level: u.level, carId: u.carId, pi: u.pi, online: isOnline(u.id) });
const userSel = { id: true, nick: true, level: true, carId: true, pi: true, xp: true } as const;

export function socialRoutes(app: FastifyInstance) {
  app.get('/api/users/search', async (req) => {
    await requireUser(req);
    const q = String((req.query as any).q ?? '').trim().toLowerCase().slice(0, 20);
    const users = await db.user.findMany({ where: q ? { nickLower: { contains: q } } : {}, orderBy: { lastSeen: 'desc' }, take: 30, select: userSel });
    return { users: users.map(brief) };
  });

  app.get('/api/users/:id', async (req) => {
    const me = await requireUser(req);
    const id = (req.params as any).id as string;
    const u = await db.user.findUnique({ where: { id } });
    if (!u) throw new HttpError(404, 'Игрок не найден');
    const p = parseProfile(u);
    const cars: PublicCar[] = p.cars.map((c) => ({ carId: c.carId, visual: c.visual, parts: c.parts, pi: performanceIndex(buildSimCar(c)), name: c.uid }));
    const fs = await db.friendship.findFirst({ where: { OR: [{ fromId: me.id, toId: id }, { fromId: id, toId: me.id }] } });
    const friendState = !fs ? 'none' : fs.status === 'accepted' ? 'friend' : fs.fromId === me.id ? 'отправлена' : 'входящая';
    const ghosts = await db.ghost.findMany({ where: { userId: id }, select: { id: true, distance: true, trackId: true, time: true, carId: true }, orderBy: { distance: 'asc' } });
    return { id: u.id, nick: u.nick, level: p.level, xp: p.xp, stats: p.stats, achievements: p.achievements, cars, currentCar: p.currentCar, online: isOnline(id), friendState, ghosts };
  });

  // ── друзья ──
  app.get('/api/friends', async (req) => {
    const me = await requireUser(req);
    const rows = await db.friendship.findMany({ where: { OR: [{ fromId: me.id }, { toId: me.id }] } });
    const ids = rows.map((r) => (r.fromId === me.id ? r.toId : r.fromId));
    const users = new Map((await db.user.findMany({ where: { id: { in: ids } }, select: userSel })).map((u) => [u.id, brief(u)]));
    const friends = [], incoming = [], outgoing = [];
    for (const r of rows) {
      const other = users.get(r.fromId === me.id ? r.toId : r.fromId);
      if (!other) continue;
      if (r.status === 'accepted') friends.push(other); else if (r.toId === me.id) incoming.push(other); else outgoing.push(other);
    }
    friends.sort((a, b) => Number(b.online) - Number(a.online));
    return { friends, incoming, outgoing };
  });

  app.post('/api/friends/request', async (req) => {
    const me = await requireUser(req);
    const { userId } = (req.body ?? {}) as { userId: string };
    if (!userId || userId === me.id) throw new HttpError(400, 'Нельзя');
    if (!(await db.user.findUnique({ where: { id: userId } }))) throw new HttpError(404, 'Игрок не найден');
    const back = await db.friendship.findUnique({ where: { fromId_toId: { fromId: userId, toId: me.id } } });
    if (back) {
      if (back.status !== 'accepted') await db.friendship.update({ where: { id: back.id }, data: { status: 'accepted' } });
      return { ok: true, accepted: true };
    }
    await db.friendship.upsert({ where: { fromId_toId: { fromId: me.id, toId: userId } }, create: { fromId: me.id, toId: userId, status: 'pending' }, update: {} });
    return { ok: true };
  });

  app.post('/api/friends/respond', async (req) => {
    const me = await requireUser(req);
    const { userId, accept } = (req.body ?? {}) as { userId: string; accept: boolean };
    const f = await db.friendship.findUnique({ where: { fromId_toId: { fromId: userId, toId: me.id } } });
    if (!f) throw new HttpError(404, 'Заявка не найдена');
    if (accept) {
      await db.friendship.update({ where: { id: f.id }, data: { status: 'accepted' } });
      const other = await db.user.findUnique({ where: { id: userId } });
      await postEvent(me.id, me.id, 'friend', `теперь дружит с ${other?.nick}`);
    } else await db.friendship.delete({ where: { id: f.id } });
    return { ok: true };
  });

  app.post('/api/friends/remove', async (req) => {
    const me = await requireUser(req);
    const { userId } = (req.body ?? {}) as { userId: string };
    await db.friendship.deleteMany({ where: { OR: [{ fromId: me.id, toId: userId }, { fromId: userId, toId: me.id }] } });
    return { ok: true };
  });

  // ── рейтинги ──
  app.get('/api/leaderboard', async (req) => {
    const me = await requireUser(req);
    const q = req.query as any;
    const type = String(q.type ?? 'global');
    const sel = { ...userSel, weeklyPoints: true, best201: true, best402: true, best804: true };
    let rows: any[] = [];
    if (type === 'global') rows = (await db.user.findMany({ orderBy: { xp: 'desc' }, take: 50, select: sel })).map((u) => ({ ...u, value: u.xp }));
    else if (type === 'weekly') rows = (await db.user.findMany({ where: { weekKey: weekKey(Date.now()), weeklyPoints: { gt: 0 } }, orderBy: { weeklyPoints: 'desc' }, take: 50, select: sel })).map((u) => ({ ...u, value: u.weeklyPoints }));
    else if (type === 'friends') {
      const ids = [me.id, ...(await friendIds(me.id))];
      rows = (await db.user.findMany({ where: { id: { in: ids } }, orderBy: { xp: 'desc' }, select: sel })).map((u) => ({ ...u, value: u.xp }));
    } else if (type === 'record') {
      const d = [201, 402, 804].includes(Number(q.distance)) ? Number(q.distance) : 402;
      const key = ('best' + d) as 'best201' | 'best402' | 'best804';
      rows = (await db.user.findMany({ where: { [key]: { not: null } }, orderBy: { [key]: 'asc' }, take: 50, select: sel })).map((u) => ({ ...u, value: u[key] }));
    }
    return { rows: rows.map((r) => ({ id: r.id, nick: r.nick, level: r.level, carId: r.carId, value: r.value })) };
  });

  // ── стена ──
  app.get('/api/wall/:id', async (req) => {
    const me = await requireUser(req);
    const id = (req.params as any).id as string;
    const owner = await db.user.findUnique({ where: { id }, select: { nick: true } });
    if (!owner) throw new HttpError(404, 'Нет такого игрока');
    // своя стена = свои записи + события друзей (лента)
    const walls = id === me.id ? [id, ...(await friendIds(id))] : [id];
    const posts = await db.wallPost.findMany({
      where: id === me.id ? { OR: [{ wallId: id }, { wallId: { in: walls.slice(1) }, type: { not: 'post' } }] } : { wallId: id },
      orderBy: { createdAt: 'desc' }, take: 60,
    });
    const authors = new Map((await db.user.findMany({ where: { id: { in: [...new Set(posts.map((p) => p.authorId))] } }, select: { id: true, nick: true } })).map((u) => [u.id, u.nick]));
    return { nick: owner.nick, posts: posts.map((p) => ({ id: p.id, authorId: p.authorId, authorNick: authors.get(p.authorId) ?? '?', type: p.type, text: p.text, at: p.createdAt.getTime() })) };
  });

  app.post('/api/wall/:id', async (req) => {
    const me = await requireUser(req);
    const id = (req.params as any).id as string;
    const text = String((req.body as any)?.text ?? '').trim().slice(0, 200);
    if (!text) throw new HttpError(400, 'Пустое сообщение');
    if (id !== me.id && !(await friendIds(me.id)).includes(id)) throw new HttpError(403, 'Писать на стене можно только друзьям');
    const recent = await db.wallPost.count({ where: { authorId: me.id, createdAt: { gt: new Date(Date.now() - 60_000) } } });
    if (recent >= 5) throw new HttpError(429, 'Слишком часто');
    await postEvent(id, me.id, 'post', text);
    return { ok: true };
  });

  // ── подарки ──
  app.post('/api/gifts/send', async (req) => {
    const me = await requireUser(req);
    const { toId, kind } = (req.body ?? {}) as { toId: string; kind: string };
    if (!(kind in GIFT_KINDS)) throw new HttpError(400, 'Нет такого подарка');
    if (!(await friendIds(me.id)).includes(toId)) throw new HttpError(403, 'Дарить можно только друзьям');
    try { await db.gift.create({ data: { fromId: me.id, toId, kind, day: dayKey(Date.now()) } }); }
    catch { throw new HttpError(409, 'Сегодня ты уже дарил этому другу'); }
    await postEvent(toId, me.id, 'gift', `подарил ${GIFT_KINDS[kind as keyof typeof GIFT_KINDS].title.toLowerCase()}`);
    return { ok: true };
  });

  app.get('/api/gifts', async (req) => {
    const me = await requireUser(req);
    const gifts = await db.gift.findMany({ where: { toId: me.id, claimed: false }, orderBy: { createdAt: 'desc' }, take: 30 });
    const from = new Map((await db.user.findMany({ where: { id: { in: gifts.map((g) => g.fromId) } }, select: { id: true, nick: true } })).map((u) => [u.id, u.nick]));
    return { gifts: gifts.map((g) => ({ id: g.id, kind: g.kind, fromNick: from.get(g.fromId) ?? '?', at: g.createdAt.getTime() })) };
  });

  app.post('/api/gifts/claim', async (req) => {
    const me = await requireUser(req);
    const { id } = (req.body ?? {}) as { id: string };
    const g = await db.gift.findUnique({ where: { id } });
    if (!g || g.toId !== me.id || g.claimed) throw new HttpError(404, 'Подарок не найден');
    await db.gift.update({ where: { id }, data: { claimed: true } });
    const r = await mutate(me.id, (p) => {
      if (g.kind === 'fuel') p.fuel = Math.min(FUEL_MAX + 5, p.fuel + 3);
      else if (g.kind === 'money') p.money += 250;
      else if (g.kind === 'kit') p.repairKits += 1;
    });
    return { profile: r.profile };
  });
}
