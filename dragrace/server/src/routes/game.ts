import { randomBytes, randomInt } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  GameError, LEAGUES, MAX_RACE_S, OP_NAMES, TICK_HZ, TOURNEY_PRIZES, applyRaceResult, buildSimCar, carName, dispatch,
  getCar, greenTickFromSeed, prepareRace, resolveRace, runSim, raceConfig, tournamentInfo, validateInputs, weekKey,
  type InputEvent, type OpponentSpec, type Profile, type RaceContext, type RaceRewards, type RunResult,
} from '@drag/shared';
import { addWeekly, db, mutate, parseProfile, postEvent, saveProfile, withLock } from '../db';
import { HttpError, requireUser } from '../auth';
import { matches } from '../ws';

const RACE_TTL = 15 * 60 * 1000;
const tourneyForce = () => process.env.TOURNAMENT_ALWAYS === '1';

export function newRaceId() { return 'r' + randomBytes(9).toString('base64url'); }

function asGame<T>(fn: () => T): T {
  try { return fn(); } catch (e) { if (e instanceof GameError) throw new HttpError(400, e.message); throw e; }
}

/** Общая пост-обработка подтверждённого заезда: рекорды, призраки, стена, турнир. */
export async function afterRace(userId: string, p: Profile, ctx: RaceContext, player: RunResult, rewards: RaceRewards, inputs: InputEvent[], semiAuto: boolean) {
  const valid = !player.falseStart && !player.dnf && player.time > 0;
  await addWeekly(userId, rewards.win ? 3 + Math.min(5, Math.floor(ctx.bet / 500)) : 1);
  if (valid) {
    const car = getCar(p, ctx.carUid);
    const sim = buildSimCar(car);
    const prev = await db.ghost.findUnique({ where: { userId_distance: { userId, distance: ctx.distance } } });
    if (!prev || player.time < prev.time) {
      const { performanceIndex } = await import('@drag/shared');
      const data = { trackId: ctx.trackId, time: player.time, pi: performanceIndex(sim), carId: car.carId, simCar: JSON.stringify(sim), visual: JSON.stringify(car.visual), inputs: JSON.stringify(inputs), semiAuto, green: greenTickFromSeed(ctx.seed) };
      await db.ghost.upsert({ where: { userId_distance: { userId, distance: ctx.distance } }, create: { userId, distance: ctx.distance, ...data }, update: data });
    }
    if (ctx.kind === 'tournament') {
      const t = tournamentInfo(ctx.startedAt, tourneyForce());
      const cur = await db.tournamentEntry.findUnique({ where: { week_userId: { week: t.week, userId } } });
      if (!cur || player.time < cur.time) await db.tournamentEntry.upsert({ where: { week_userId: { week: t.week, userId } }, create: { week: t.week, userId, nick: p.nick, carId: car.carId, time: player.time }, update: { time: player.time, carId: car.carId } });
    }
  }
  if (rewards.record && valid) await postEvent(userId, userId, 'record', `установил личный рекорд ${ctx.distance} м: ${player.time.toFixed(3)} с на ${carName(getCar(p, ctx.carUid).carId)}`);
  if (rewards.levelUp) await postEvent(userId, userId, 'level', `достиг ${p.level} уровня!`);
  if (rewards.careerAdvanced && ctx.careerStep) {
    const b = LEAGUES[ctx.careerStep.league].bots[ctx.careerStep.index];
    if (b.boss) await postEvent(userId, userId, 'boss', `победил босса «${b.name}» — ${LEAGUES[ctx.careerStep.league].name} пройдена!`);
  }
  for (const a of rewards.newAchievements) {
    const { ACH_MAP } = await import('@drag/shared');
    await postEvent(userId, userId, 'ach', `получил достижение «${ACH_MAP[a]?.title ?? a}»`);
  }
}

function checkInputs(ctx: RaceContext, inputs: unknown) {
  const maxTick = greenTickFromSeed(ctx.seed) + MAX_RACE_S * TICK_HZ;
  const err = validateInputs(inputs, maxTick);
  if (err) throw new HttpError(400, 'Запись заезда отклонена: ' + err);
  return inputs as InputEvent[];
}

export function gameRoutes(app: FastifyInstance) {
  app.get('/api/me', async (req) => {
    const u = await requireUser(req);
    const { profile } = await mutate(u.id, () => null);
    return { profile, now: Date.now(), userId: u.id };
  });

  app.post('/api/op', async (req) => {
    const u = await requireUser(req);
    const { op, args } = (req.body ?? {}) as { op: string; args: unknown };
    if (!OP_NAMES.includes(op as any)) throw new HttpError(400, 'Неизвестная операция');
    let carBought = '';
    const r = await mutate(u.id, (p) => asGame(() => {
      const res = dispatch(p, op, args, Date.now());
      if (op === 'buyCar') carBought = (args as any).carId;
      return res;
    }));
    if (carBought) await postEvent(u.id, u.id, 'car', `купил ${carName(carBought)}`);
    return r;
  });

  app.post('/api/race/start', async (req) => {
    const u = await requireUser(req);
    const body = (req.body ?? {}) as any;
    const kind = body.kind;
    if (!['quick', 'career', 'ghost', 'tournament'].includes(kind)) throw new HttpError(400, 'Неверный тип заезда');
    let opponent: OpponentSpec | undefined;
    const reqData = { kind, trackId: String(body.trackId ?? 'neon'), distance: Number(body.distance) as any, careerIndex: body.careerIndex, tutorial: !!body.tutorial };
    if (kind === 'ghost') {
      const g = await db.ghost.findUnique({ where: { id: String(body.ghostId) }, include: { user: true } });
      if (!g || g.userId === u.id) throw new HttpError(404, 'Призрак не найден');
      opponent = { type: 'ghost', ghostId: g.id, userId: g.userId, name: g.user.nick, carId: g.carId, simCar: JSON.parse(g.simCar), inputs: JSON.parse(g.inputs), visual: JSON.parse(g.visual), semiAuto: g.semiAuto, green: g.green };
      reqData.trackId = g.trackId; reqData.distance = g.distance;
    }
    if (kind === 'tournament') {
      const t = tournamentInfo(Date.now(), tourneyForce());
      if (!t.active) throw new HttpError(400, 'Турнир проходит в субботу и воскресенье');
      reqData.trackId = t.trackId; reqData.distance = t.distance;
    }
    const raceId = newRaceId();
    const seed = randomInt(1, 2 ** 31 - 1);
    const r = await mutate(u.id, (p) => asGame(() => prepareRace(p, reqData, Date.now(), seed, raceId, opponent)));
    await db.race.create({ data: { id: raceId, userId: u.id, kind, ctx: JSON.stringify(r.result) } });
    return { ctx: r.result, profile: r.profile };
  });

  app.post('/api/race/finish', async (req) => {
    const u = await requireUser(req);
    const { raceId, inputs, semiAuto } = (req.body ?? {}) as { raceId: string; inputs: unknown; semiAuto: boolean };
    return withLock('race:' + raceId, async () => {
      const race = await db.race.findUnique({ where: { id: String(raceId) } });
      if (!race || race.userId !== u.id) throw new HttpError(404, 'Заезд не найден');
      if (race.status !== 'open') throw new HttpError(409, 'Результат уже засчитан');
      const ctx = JSON.parse(race.ctx) as RaceContext;
      if (Date.now() - ctx.startedAt > RACE_TTL) throw new HttpError(410, 'Заезд устарел');
      const ins = checkInputs(ctx, inputs);
      await db.race.update({ where: { id: race.id }, data: { status: 'done' } });

      if (ctx.kind === 'online') {
        // результат считает сервер; итог матча придёт по WebSocket
        const user = await db.user.findUniqueOrThrow({ where: { id: u.id } });
        const p = parseProfile(user);
        const car = getCar(p, ctx.carUid);
        const player = runSim(raceConfig(ctx, buildSimCar(car), !!semiAuto), ins);
        matches.submit(ctx.raceId, u.id, player, ins, !!semiAuto);
        return { rewards: null, player, opp: null, profile: p };
      }

      let out: any;
      const r = await mutate(u.id, async (p) => {
        const car = getCar(p, ctx.carUid);
        const { player, opp } = resolveRace(ctx, buildSimCar(car), ins, !!semiAuto);
        const rewards = applyRaceResult(p, ctx, player, opp, Date.now());
        out = { player, opp, rewards };
        return rewards;
      });
      await db.race.update({ where: { id: race.id }, data: { result: JSON.stringify(out.player) } });
      await afterRace(u.id, r.profile, ctx, out.player, out.rewards, ins, !!semiAuto);
      return { ...out, profile: r.profile };
    });
  });

  // Заезд, проведённый без связи: сервер заново готовит контекст из сида и всё перепроверяет.
  app.post('/api/race/offline', async (req) => {
    const u = await requireUser(req);
    const { ctx: c, inputs, semiAuto } = (req.body ?? {}) as { ctx: RaceContext; inputs: unknown; semiAuto: boolean };
    if (!c || !['quick', 'career'].includes(c.kind)) throw new HttpError(400, 'Этот заезд нельзя засчитать офлайн');
    const age = Date.now() - Number(c.startedAt);
    if (!(age >= 0 && age < 48 * 3600e3)) throw new HttpError(400, 'Слишком старый офлайн-заезд');
    const raceId = 'off_' + u.id + '_' + String(c.raceId).slice(0, 40);
    if (await db.race.findUnique({ where: { id: raceId } })) throw new HttpError(409, 'Уже засчитано');
    let out: any;
    const r = await mutate(u.id, async (p) => asGame(() => {
      const ctx = prepareRace(p, { kind: c.kind, trackId: c.trackId, distance: c.distance, carUid: c.carUid, careerIndex: c.careerStep?.index }, Date.now(), Number(c.seed) | 0, raceId);
      const ins = checkInputs(ctx, inputs);
      const { player, opp } = resolveRace(ctx, buildSimCar(getCar(p, ctx.carUid)), ins, !!semiAuto);
      const rewards = applyRaceResult(p, ctx, player, opp, Date.now());
      out = { player, opp, rewards, ctx, ins };
      return rewards;
    }));
    await db.race.create({ data: { id: raceId, userId: u.id, kind: c.kind, ctx: JSON.stringify(out.ctx), status: 'done', result: JSON.stringify(out.player) } });
    await afterRace(u.id, r.profile, out.ctx, out.player, out.rewards, out.ins, !!semiAuto);
    return { player: out.player, opp: out.opp, rewards: out.rewards, profile: r.profile };
  });

  app.get('/api/tournament', async (req) => {
    const u = await requireUser(req);
    const now = Date.now();
    const info = tournamentInfo(now, tourneyForce());
    // выдаём призы прошлой недели (лениво, один раз)
    const prevWeek = weekKey(now - 7 * 864e5);
    let awarded = '';
    if (!(await db.tournamentAward.findUnique({ where: { week: prevWeek } }))) {
      await db.tournamentAward.create({ data: { week: prevWeek } }).catch(() => null);
      const top = await db.tournamentEntry.findMany({ where: { week: prevWeek }, orderBy: { time: 'asc' }, take: 3 });
      for (let i = 0; i < top.length; i++) {
        const prize = TOURNEY_PRIZES[i];
        await mutate(top[i].userId, (p) => { p.gold += prize.gold; p.money += prize.money; p.stats.tournamentTop3++; });
        await postEvent(top[i].userId, top[i].userId, 'ach', `занял ${i + 1} место в турнире выходного дня!`);
        if (top[i].userId === u.id) awarded = `Ты занял ${i + 1} место в прошлом турнире: 💎${prize.gold} 💰${prize.money}`;
      }
    }
    const top = await db.tournamentEntry.findMany({ where: { week: info.week }, orderBy: { time: 'asc' }, take: 30 });
    return { info, top, awarded };
  });

  app.get('/api/ghosts/match', async (req) => {
    const u = await requireUser(req);
    const distance = Number((req.query as any).distance) || 402;
    const user = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    const list = await db.ghost.findMany({ where: { distance, userId: { not: u.id }, pi: { gte: user.pi - 1.5, lte: user.pi + 1.5 } }, include: { user: true }, take: 20 });
    const any = list.length ? list : await db.ghost.findMany({ where: { distance, userId: { not: u.id } }, include: { user: true }, take: 20 });
    if (!any.length) return { ghost: null };
    const g = any[Math.floor(Math.random() * any.length)];
    return { ghost: { id: g.id, nick: g.user.nick, distance: g.distance, trackId: g.trackId, time: g.time, carId: g.carId } };
  });
}

export { saveProfile };
