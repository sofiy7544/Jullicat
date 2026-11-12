import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { authRoutes, HttpError } from './auth';
import { gameRoutes } from './routes/game';
import { socialRoutes } from './routes/social';
import { wsRoutes } from './ws';

// .env без зависимостей
const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
if (existsSync(envPath)) for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'warn' }, bodyLimit: 512 * 1024 });
const origins = (process.env.CORS_ORIGIN ?? '*').split(',').map((s) => s.trim());
await app.register(cors, { origin: origins.includes('*') ? true : origins });
await app.register(websocket, { options: { maxPayload: 64 * 1024 } });

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof HttpError) return reply.status(err.status).send({ error: err.message });
  if ((err as any).statusCode && (err as any).statusCode < 500) return reply.status((err as any).statusCode).send({ error: (err as Error).message });
  app.log.error(err);
  return reply.status(500).send({ error: 'Ошибка сервера' });
});

app.get('/api/health', async () => ({ ok: true, time: Date.now() }));
authRoutes(app);
gameRoutes(app);
socialRoutes(app);
wsRoutes(app);

// Если клиент собран — раздаём его этим же сервером (один деплой на Render/Railway).
const dist = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'dist');
if (existsSync(dist)) {
  await app.register(fastifyStatic, { root: dist, wildcard: false });
  app.setNotFoundHandler((req, reply) => (req.url.startsWith('/api') ? reply.status(404).send({ error: 'Not found' }) : reply.sendFile('index.html')));
}

const port = Number(process.env.PORT ?? 8787);
await app.listen({ port, host: '0.0.0.0' });
const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i!.address);
console.log(`🏁 Сервер Нитро-Двор: http://localhost:${port}  (в сети: ${ips.map((ip) => `http://${ip}:${port}`).join(', ')})`);
