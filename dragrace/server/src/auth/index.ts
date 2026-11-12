// Модуль авторизации. Провайдеры: ник/пароль (сейчас) и VK (подготовлено для Mini App).
import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHmac } from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { newProfile } from '@drag/shared';
import { db, saveProfile } from '../db';

const scrypt = promisify(_scrypt) as (p: string, s: Buffer, n: number) => Promise<Buffer>;
const SESSION_DAYS = 60;

export class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

async function hashPassword(pass: string) {
  const salt = randomBytes(16);
  const key = await scrypt(pass, salt, 32);
  return salt.toString('hex') + ':' + key.toString('hex');
}
async function checkPassword(pass: string, stored: string) {
  const [s, k] = stored.split(':');
  const key = await scrypt(pass, Buffer.from(s, 'hex'), 32);
  return timingSafeEqual(key, Buffer.from(k, 'hex'));
}

export async function createSession(userId: string) {
  const token = randomBytes(24).toString('base64url');
  await db.session.create({ data: { token, userId, expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5) } });
  return token;
}

export async function userFromToken(token: string | undefined | null) {
  if (!token) return null;
  const s = await db.session.findUnique({ where: { token }, include: { user: true } });
  if (!s || s.expiresAt < new Date()) return null;
  return s.user;
}

export async function requireUser(req: FastifyRequest) {
  const h = req.headers.authorization;
  const token = h?.startsWith('Bearer ') ? h.slice(7) : undefined;
  const u = await userFromToken(token);
  if (!u) throw new HttpError(401, 'Нужно войти');
  return u;
}

const NICK = /^[A-Za-zА-Яа-яЁё0-9_\-]{3,16}$/;

async function createUser(nick: string, extra: { passHash?: string; vkId?: string }) {
  if (!NICK.test(nick)) throw new HttpError(400, 'Ник: 3–16 символов, буквы, цифры, _ и -');
  const exists = await db.user.findUnique({ where: { nickLower: nick.toLowerCase() } });
  if (exists) throw new HttpError(409, 'Такой ник уже занят');
  const u = await db.user.create({ data: { nick, nickLower: nick.toLowerCase(), profile: '{}', ...extra } });
  const p = newProfile(u.id, nick, Date.now());
  await saveProfile(u.id, p);
  return u;
}

/** Проверка подписи параметров запуска VK Mini App (vk_* + sign). */
export function verifyVkLaunch(query: string, secret: string): Record<string, string> | null {
  const params = new URLSearchParams(query);
  const sign = params.get('sign');
  if (!sign || !secret) return null;
  const vk = [...params.entries()].filter(([k]) => k.startsWith('vk_')).sort(([a], [b]) => a.localeCompare(b));
  const str = vk.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const hash = createHmac('sha256', secret).update(str).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return hash === sign ? Object.fromEntries(vk) : null;
}

export function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/register', async (req) => {
    const { nick, password } = (req.body ?? {}) as { nick?: string; password?: string };
    if (!nick || !password || password.length < 6) throw new HttpError(400, 'Пароль — минимум 6 символов');
    const u = await createUser(nick.trim(), { passHash: await hashPassword(password) });
    return { token: await createSession(u.id) };
  });
  app.post('/api/auth/login', async (req) => {
    const { nick, password } = (req.body ?? {}) as { nick?: string; password?: string };
    const u = nick ? await db.user.findUnique({ where: { nickLower: nick.trim().toLowerCase() } }) : null;
    if (!u || !u.passHash || !password || !(await checkPassword(password, u.passHash))) throw new HttpError(401, 'Неверный ник или пароль');
    return { token: await createSession(u.id) };
  });
  // VK Mini App: клиент передаёт строку параметров запуска; ник берётся из параметра или генерируется.
  app.post('/api/auth/vk', async (req) => {
    const { launch, nick } = (req.body ?? {}) as { launch?: string; nick?: string };
    const vk = verifyVkLaunch(launch ?? '', process.env.VK_APP_SECRET ?? '');
    if (!vk) throw new HttpError(401, 'Подпись VK не прошла проверку');
    let u = await db.user.findUnique({ where: { vkId: vk.vk_user_id } });
    if (!u) u = await createUser(nick && NICK.test(nick) ? nick : 'vk' + vk.vk_user_id.slice(-8), { vkId: vk.vk_user_id });
    return { token: await createSession(u.id) };
  });
  app.post('/api/auth/logout', async (req) => {
    const t = req.headers.authorization?.slice(7);
    if (t) await db.session.deleteMany({ where: { token: t } });
    return { ok: true };
  });
}
