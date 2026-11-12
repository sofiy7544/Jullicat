// Быстрая проверка физики и баланса: npm test
import { CARS, buildSimCar, newOwnedCar, performanceIndex, estimate0to100, peakPower, runBot, greenTickFromSeed, TRACKS, resolveRace, newProfile, prepareRace, applyRaceResult, runSim, computeZones } from './index';

console.log('Машина            сток: л.с.  0-100  402м | тюн5: л.с.  402м');
for (const c of CARS) {
  const s0 = buildSimCar(newOwnedCar(c.id, 'x', 0));
  const s5 = buildSimCar(newOwnedCar(c.id, 'x', 5));
  console.log(`${(c.maker + ' ' + c.model).padEnd(18)} ${peakPower(s0).hp.toFixed(0).padStart(5)} ${estimate0to100(s0).toFixed(2).padStart(6)} ${performanceIndex(s0).toFixed(2).padStart(6)} | ${peakPower(s5).hp.toFixed(0).padStart(5)} ${performanceIndex(s5).toFixed(2).padStart(6)}`);
}
// детерминизм: бот → запись → повтор
const car = buildSimCar(newOwnedCar('kastor', 'x', 2));
const cfg = { car, mu: TRACKS[0].mu, distance: 402, greenTick: greenTickFromSeed(42), semiAuto: false };
const a = runBot(cfg, 0.8, 5);
const b = runSim(cfg, a.inputs);
console.log('Повтор совпадает:', a.result.time === b.time, a.result.time, b.time, 'зоны', computeZones(car, 1));
const p = newProfile('u1', 'test', Date.now());
const ctx = prepareRace(p, { kind: 'quick', trackId: 'neon', distance: 402 }, Date.now(), 1234, 'r1');
const res = resolveRace(ctx, buildSimCar(p.cars[0]), a.inputs.map(x => x), false);
console.log('Бот-соперник', ctx.opponent, res.opp?.time);
console.log(applyRaceResult(p, ctx, res.player, res.opp, Date.now()));
