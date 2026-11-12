import { PrismaClient, type User } from '@prisma/client';
import { buildSimCar, performanceIndex, touch, weekKey, type Profile } from '@drag/shared';

export const db = new PrismaClient();

// Простая очередь на пользователя: операции над профилем выполняются строго по одной,
// чтобы параллельные запросы не могли «удвоить» деньги.
const locks = new Map<string, Promise<unknown>>();
export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  locks.set(key, next);
  next.finally(() => { if (locks.get(key) === next) locks.delete(key); }).catch(() => {});
  return next;
}

export function parseProfile(u: User): Profile {
  const p = JSON.parse(u.profile) as Profile;
  p.id = u.id; p.nick = u.nick;
  return p;
}

export async function saveProfile(userId: string, p: Profile, extra: Partial<User> = {}) {
  const car = p.cars.find((c) => c.uid === p.currentCar) ?? p.cars[0];
  const pi = performanceIndex(buildSimCar(car));
  await db.user.update({
    where: { id: userId },
    data: {
      profile: JSON.stringify(p), level: p.level, xp: p.xp, pi, carId: car.carId,
      best201: p.stats.bestTimes[201] ?? null, best402: p.stats.bestTimes[402] ?? null, best804: p.stats.bestTimes[804] ?? null,
      lastSeen: new Date(), ...extra,
    },
  });
}

/** Загрузить профиль под блокировкой, изменить и сохранить. */
export async function mutate<T>(userId: string, fn: (p: Profile, u: User) => Promise<T> | T): Promise<{ result: T; profile: Profile }> {
  return withLock(userId, async () => {
    const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const p = parseProfile(u);
    touch(p, Date.now());
    const result = await fn(p, u);
    await saveProfile(userId, p);
    return { result, profile: p };
  });
}

export async function addWeekly(userId: string, pts: number) {
  const wk = weekKey(Date.now());
  const u = await db.user.findUnique({ where: { id: userId }, select: { weekKey: true, weeklyPoints: true } });
  if (!u) return;
  await db.user.update({ where: { id: userId }, data: u.weekKey === wk ? { weeklyPoints: { increment: pts } } : { weekKey: wk, weeklyPoints: pts } });
}

export async function postEvent(wallId: string, authorId: string, type: string, text: string) {
  await db.wallPost.create({ data: { wallId, authorId, type, text: text.slice(0, 240) } });
}

export async function friendIds(userId: string): Promise<string[]> {
  const rows = await db.friendship.findMany({ where: { status: 'accepted', OR: [{ fromId: userId }, { toId: userId }] } });
  return rows.map((r) => (r.fromId === userId ? r.toId : r.fromId));
}
