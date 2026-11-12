// Сцена заезда: фиксированный шаг физики 120 Гц, рендер Canvas 2D, мультитач-управление.
import {
  BotDriver, CAR_MAP, TICK_HZ, shiftInputs, TRACK_MAP, createSim, raceConfig, resultFromState, stepSim,
  type InputCode, type InputEvent, type RaceContext, type RemoteState, type RunResult, type SimCar, type SimConfig, type SimState, type Visual,
} from '@drag/shared';
import { carMetrics, drawCar } from './carArt';
import { drawBackground, drawRoad, worldX, type SceneLayout } from './scenery';
import { EngineSound, cylinders, sfx, unlockAudio } from './audio';
import { settings } from '../settings';
import { haptic } from '../platform';

export interface RaceSetup {
  ctx: RaceContext;
  player: { car: SimCar; carId: string; visual: Visual; name: string };
  opp: { car: SimCar; carId: string; visual: Visual; name: string };
  remote?: { startAt: number; now: () => number; send: (s: RemoteState) => void; subscribe: (h: (s: RemoteState) => void) => () => void };
  tutorial?: boolean;
  onFinish: (r: { inputs: InputEvent[]; player: RunResult; oppLocal: RunResult | null }) => void;
  onQuit: () => void;
}

interface Btn { id: string; x: number; y: number; w: number; h: number; label: string; sub?: string; color: string; round?: boolean }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; lane: number }
interface Popup { text: string; color: string; t: number }

export class RaceScene {
  private cv: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private dpr = 1;
  private W = 0; private H = 0;
  private layout!: SceneLayout;
  private dashTop = 0;
  private btns: Btn[] = [];
  private pressed = new Map<number, string>();
  private keys = new Set<string>();
  private cfgP: SimConfig; private cfgO: SimConfig;
  private sP: SimState; private sO: SimState;
  private bot: BotDriver | null = null;
  private oppInputs: InputEvent[] = [];
  private log: InputEvent[] = [];
  private startPerf = 0;
  private raf = 0;
  private running = true;
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private shake = 0;
  private engP: EngineSound | null = null;
  private engO: EngineSound | null = null;
  private wheelP = 0; private wheelO = 0;
  private finishedAt = 0;
  private reported = false;
  private remoteStates: RemoteState[] = [];
  private unsub: (() => void) | null = null;
  private lastSend = 0;
  private lightsPlayed = 0;
  private thrHeld = false; private clutchHeld = false;
  private tutStep = 0;
  private track;
  private time = 0;
  private cleanup: (() => void)[] = [];

  constructor(private root: HTMLElement, private S: RaceSetup) {
    this.cv = document.createElement('canvas');
    this.cv.className = 'race-canvas';
    root.appendChild(this.cv);
    this.g = this.cv.getContext('2d')!;
    this.track = TRACK_MAP[S.ctx.trackId];
    const semi = settings.gearbox === 'semi';
    this.cfgP = raceConfig(S.ctx, S.player.car, semi);
    this.cfgO = raceConfig(S.ctx, S.opp.car, S.ctx.opponent.type === 'ghost' ? S.ctx.opponent.semiAuto : true);
    this.sP = createSim(this.cfgP);
    this.sO = createSim(this.cfgO);
    const o = S.ctx.opponent;
    if (o.type === 'bot') this.bot = new BotDriver(o.skill, S.ctx.seed + 1, this.cfgO, this.sO);
    else if (o.type === 'ghost') this.oppInputs = shiftInputs(o.inputs, o.green, this.cfgO.greenTick);
    if (S.remote) {
      this.unsub = S.remote.subscribe((st) => { this.remoteStates.push(st); if (this.remoteStates.length > 60) this.remoteStates.shift(); });
    }
    unlockAudio();
    if (settings.sound) {
      this.engP = new EngineSound(cylinders(CAR_MAP[S.player.carId].body), 1);
      this.engO = new EngineSound(cylinders(CAR_MAP[S.opp.carId].body), 0.35);
    }
    this.startPerf = S.remote ? performance.now() + (S.remote.startAt - S.remote.now()) : performance.now() + 700;
    this.resize();
    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    this.cleanup.push(() => window.removeEventListener('resize', onResize));
    this.bindInput();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.engP?.stop(); this.engO?.stop();
    this.unsub?.();
    this.cleanup.forEach((f) => f());
    this.cv.remove();
  }

  // ───────── ввод ─────────
  private bindInput() {
    const cv = this.cv;
    const pt = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const hit = (x: number, y: number) => this.btns.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    const down = (e: PointerEvent) => {
      e.preventDefault();
      unlockAudio();
      const p = pt(e);
      const b = hit(p.x, p.y);
      if (!b) return;
      try { cv.setPointerCapture(e.pointerId); } catch { /* */ }
      this.pressed.set(e.pointerId, b.id);
      this.press(b.id, true);
    };
    const up = (e: PointerEvent) => {
      const id = this.pressed.get(e.pointerId);
      if (id) { this.pressed.delete(e.pointerId); if (![...this.pressed.values()].includes(id)) this.press(id, false); }
    };
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('lostpointercapture', up);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    const map: Record<string, string> = { ArrowUp: 'gas', KeyW: 'gas', Space: 'clutch', KeyS: 'clutch', ArrowDown: 'clutch', ArrowRight: 'up', KeyE: 'up', ArrowLeft: 'down', KeyQ: 'down', KeyN: 'nitro', ShiftLeft: 'nitro', ShiftRight: 'nitro', Escape: 'quit' };
    const kd = (e: KeyboardEvent) => {
      const id = map[e.code]; if (!id) return;
      e.preventDefault();
      if (e.repeat || this.keys.has(e.code)) return;
      this.keys.add(e.code); unlockAudio(); this.press(id, true);
    };
    const ku = (e: KeyboardEvent) => { const id = map[e.code]; if (!id) return; this.keys.delete(e.code); this.press(id, false); };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    this.cleanup.push(() => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); });
  }

  private rec(code: InputCode, v: number) {
    if (this.sP.finished) return;
    const t = Math.max(this.sP.tick, this.log.length ? this.log[this.log.length - 1][0] : 0);
    this.log.push([t, code, v]);
  }

  private press(id: string, on: boolean) {
    if (id === 'gas') { if (this.thrHeld !== on) { this.thrHeld = on; this.rec(0, on ? 1 : 0); } }
    else if (id === 'clutch') { if (this.clutchHeld !== on) { this.clutchHeld = on; this.rec(1, on ? 1 : 0); } }
    else if (!on) return;
    else if (id === 'up') { this.rec(2, 1); haptic('light'); }
    else if (id === 'down') { this.rec(3, 1); haptic('light'); }
    else if (id === 'nitro') { this.rec(4, 1); }
    else if (id === 'quit') { this.running = false; this.destroy(); this.S.onQuit(); }
  }

  // ───────── раскладка ─────────
  private resize() {
    const r = this.root.getBoundingClientRect();
    this.W = r.width; this.H = r.height;
    this.dpr = Math.min(settings.quality === 'low' ? 1 : 2, window.devicePixelRatio || 1);
    this.cv.width = Math.round(this.W * this.dpr); this.cv.height = Math.round(this.H * this.dpr);
    this.cv.style.width = this.W + 'px'; this.cv.style.height = this.H + 'px';
    const W = this.W, H = this.H;
    const land = W > H;
    const worldH = land ? H * 0.58 : H * 0.46;
    this.dashTop = worldH;
    const ppm = Math.max(12, Math.min(worldH / 9, W / 22));
    this.layout = {
      W, H: worldH, horizon: worldH * 0.42, roadTop: worldH * 0.56, farLane: worldH * 0.72, nearLane: worldH * 0.93,
      roadBottom: worldH, ppm, anchor: W * (land ? 0.3 : 0.22),
    };
    const safeB = 10, pad = 12;
    const dh = H - worldH;
    const bw = Math.min(150, W * (land ? 0.16 : 0.27));
    const ph = Math.min(dh * 0.62, 190);
    this.btns = [
      { id: 'clutch', x: pad, y: H - ph - safeB, w: bw, h: ph, label: 'СЦЕП.', sub: 'тормоз', color: '#2c7be5' },
      { id: 'gas', x: W - bw - pad, y: H - ph - safeB, w: bw, h: ph, label: 'ГАЗ', color: '#1fbf4a' },
    ];
    const sb = Math.min(76, dh * 0.33);
    if (land) {
      this.btns.push({ id: 'up', x: pad + bw + 12, y: H - ph - safeB, w: sb, h: ph * 0.55, label: '▲', sub: 'передача', color: '#f39c12', round: true });
      this.btns.push({ id: 'down', x: pad + bw + 12, y: H - ph * 0.4 - safeB, w: sb, h: ph * 0.4, label: '▼', color: '#8e6c3a', round: true });
      this.btns.push({ id: 'nitro', x: W - bw - pad - sb - 12, y: H - ph - safeB, w: sb, h: ph * 0.55, label: '⚡', sub: 'НИТРО', color: '#8e44ff', round: true });
    } else {
      this.btns.push({ id: 'up', x: pad, y: H - ph - safeB - sb * 1.15, w: bw * 0.62, h: sb, label: '▲', sub: 'передача', color: '#f39c12', round: true });
      this.btns.push({ id: 'down', x: pad + bw * 0.66, y: H - ph - safeB - sb * 0.8, w: bw * 0.34, h: sb * 0.65, label: '▼', color: '#8e6c3a', round: true });
      this.btns.push({ id: 'nitro', x: W - bw - pad, y: H - ph - safeB - sb * 1.15, w: bw, h: sb, label: '⚡ НИТРО', color: '#8e44ff', round: true });
    }
    this.btns.push({ id: 'quit', x: 8, y: 8, w: 40, h: 34, label: '✕', color: '#444', round: true });
  }

  // ───────── цикл ─────────
  private frame = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const elapsed = (now - this.startPerf) / 1000;
    const targetTick = Math.floor(elapsed * TICK_HZ);
    let steps = 0;
    while (this.sP.tick < targetTick && steps < 40 && !this.sP.finished) {
      this.stepBoth();
      steps++;
    }
    if (this.sP.finished) this.afterFinish(now);
    this.time = now / 1000;
    this.updateAudio();
    this.render(Math.max(0, elapsed));
  };

  private stepBoth() {
    // предупреждение о раннем газе в обучении
    stepSim(this.sP, this.cfgP, this.log);
    this.handleEvents(this.sP, true);
    if (!this.S.remote) {
      if (this.bot && !this.sO.finished) this.bot.control(this.sO);
      if (!this.sO.finished) { stepSim(this.sO, this.cfgO, this.bot ? this.bot.log : this.oppInputs); this.handleEvents(this.sO, false); }
    }
    const tl = this.cfgP.greenTick - this.sP.tick;
    const marks = [Math.round(1.5 * TICK_HZ), TICK_HZ, Math.round(0.5 * TICK_HZ), 0];
    if (this.lightsPlayed < 4 && tl <= marks[this.lightsPlayed]) {
      this.lightsPlayed === 3 ? sfx.go() : sfx.beep();
      this.lightsPlayed++;
    }
    if (this.S.remote && performance.now() - this.lastSend > 66) {
      this.lastSend = performance.now();
      const s = this.sP;
      this.S.remote.send({ t: s.tick, x: s.x, v: s.v, rpm: s.rpm, gear: s.gear, nitro: s.nitroLeft > 0, spin: s.spin, done: s.finished });
    }
  }

  private handleEvents(s: SimState, me: boolean) {
    for (const ev of s.events) {
      if (ev.e === 'shift') {
        if (me) {
          ev.grind ? sfx.grind() : sfx.shift();
          if (ev.grind) this.popup('СКРЕЖЕТ КПП! Сбрасывай газ', '#ff5a3c');
          else if (ev.up) this.popup(({ perfect: 'ИДЕАЛЬНО!', good: 'Хорошо', early: 'Рано', late: 'Поздно' } as const)[ev.q], ev.q === 'perfect' ? '#3fffb0' : ev.q === 'good' ? '#fff' : '#ffb03f');
          if (ev.q === 'perfect') haptic('medium');
        }
        this.spawnPop(s, me);
      } else if (ev.e === 'launch' && me) {
        this.popup(ev.q === 'perfect' ? 'ОТЛИЧНЫЙ СТАРТ!' : ev.q === 'spin' ? 'ПРОБУКСОВКА!' : 'Мало оборотов', ev.q === 'perfect' ? '#3fffb0' : '#ffb03f');
        this.shake = ev.q === 'spin' ? 0.6 : 0.3;
        haptic('heavy');
      } else if (ev.e === 'nitro') {
        if (me) { sfx.nitro(); this.popup('НИТРО!', '#b18cff'); haptic('heavy'); }
      } else if (ev.e === 'blowoff' && me) sfx.blowoff();
      else if (ev.e === 'falsestart' && me) { this.popup('ФАЛЬСТАРТ!', '#ff3c3c'); sfx.lose(); haptic('heavy'); }
      else if (ev.e === 'overrev' && me) this.popup('ПЕРЕКРУТ!', '#ff3c3c');
      else if (ev.e === 'finish' && me) { this.popup('ФИНИШ', '#ffffff'); }
    }
  }

  private afterFinish(now: number) {
    if (!this.finishedAt) this.finishedAt = now;
    // доводим соперника до финиша (для локальных соперников)
    if (!this.S.remote && !this.sO.finished) {
      let n = 0;
      const lim = now - this.finishedAt > 3500 ? 100000 : 4;
      while (!this.sO.finished && n++ < lim) {
        if (this.bot) this.bot.control(this.sO);
        stepSim(this.sO, this.cfgO, this.bot ? this.bot.log : this.oppInputs);
      }
    }
    if (this.S.remote && !this.reported) {
      const s = this.sP;
      this.S.remote.send({ t: s.tick, x: s.x, v: s.v, rpm: s.rpm, gear: s.gear, nitro: false, spin: false, done: true });
    }
    const oppDone = this.S.remote ? true : this.sO.finished;
    if (!this.reported && oppDone && now - this.finishedAt > 1400) {
      this.reported = true;
      const player = resultFromState(this.sP, this.cfgP);
      const oppLocal = this.S.remote ? null : resultFromState(this.sO, this.cfgO);
      setTimeout(() => this.S.onFinish({ inputs: this.log.slice(), player, oppLocal }), 50);
    }
  }

  private popup(text: string, color: string) { this.popups.push({ text, color, t: 0 }); if (this.popups.length > 3) this.popups.shift(); }

  private spawnPop(s: SimState, me: boolean) {
    for (let i = 0; i < 6; i++) this.particles.push({ x: s.x - 0.1, y: 0.3, vx: -2 - Math.random() * 3, vy: Math.random() * 1.5, life: 0, max: 0.25, size: 4 + Math.random() * 4, color: '#ffa53c', lane: me ? 0 : 1 });
  }

  private updateAudio() {
    const s = this.sP;
    const nitro = s.nitroLeft > 0;
    this.engP?.update(s.rpm, s.shiftTimer > 0 && !s.shiftFlare ? 0 : s.throttle, s.boost, s.spin ? 1 : 0, nitro);
    const o = this.oppView();
    this.engO?.update(o.rpm, 1, 0.5, o.spin ? 0.5 : 0, o.nitro);
  }

  private oppView(): { x: number; v: number; rpm: number; gear: number; nitro: boolean; spin: boolean } {
    if (!this.S.remote) { const s = this.sO; return { x: s.x, v: s.v, rpm: s.rpm, gear: s.gear, nitro: s.nitroLeft > 0, spin: s.spin }; }
    const st = this.remoteStates;
    if (!st.length) return { x: 0, v: 0, rpm: this.S.opp.car.idle, gear: 1, nitro: false, spin: false };
    // интерполяция с задержкой ~100 мс
    const t = this.sP.tick - 12;
    let a = st[0], b = st[st.length - 1];
    for (let i = st.length - 1; i > 0; i--) if (st[i - 1].t <= t) { a = st[i - 1]; b = st[i]; break; }
    const k = b.t > a.t ? Math.max(0, Math.min(1.5, (t - a.t) / (b.t - a.t))) : 1;
    return { x: a.x + (b.x - a.x) * k, v: a.v + (b.v - a.v) * k, rpm: a.rpm + (b.rpm - a.rpm) * k, gear: b.gear, nitro: b.nitro, spin: b.spin };
  }

  // ───────── рендер ─────────
  private render(elapsed: number) {
    const g = this.g, L = this.layout, s = this.sP;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const dt = 1 / 60;
    const o = this.oppView();
    const camX = s.x;
    let shx = 0, shy = 0;
    if (s.nitroLeft > 0) this.shake = Math.max(this.shake, 0.35);
    if (this.shake > 0 && settings.quality === 'high') { shx = (Math.random() - 0.5) * 8 * this.shake; shy = (Math.random() - 0.5) * 6 * this.shake; this.shake = Math.max(0, this.shake - dt * 1.5); }
    g.save();
    g.beginPath(); g.rect(0, 0, L.W, L.H); g.clip();
    g.translate(shx, shy);
    drawBackground(g, this.track, L, camX, this.time);
    drawRoad(g, this.track, L, camX, this.cfgP.distance, this.time);
    this.drawTree(g, L, camX);

    // дым и частицы
    if (s.spin && s.launched && !s.finished) this.smoke(s.x, 0);
    if (o.spin) this.smoke(o.x, 1);
    if (s.nitroLeft > 0) this.particles.push({ x: s.x - 0.2, y: 0.35, vx: -8, vy: (Math.random() - 0.5), life: 0, max: 0.3, size: 3, color: '#a98bff', lane: 0 });

    const farScale = L.ppm * 0.86;
    const mO = carMetrics(this.S.opp.carId, farScale);
    const mP = carMetrics(this.S.player.carId, L.ppm);
    this.wheelO += (o.v * dt) / (CAR_MAP[this.S.opp.carId].r);
    this.wheelP += ((s.v + (s.spin ? 12 : 0)) * dt) / (CAR_MAP[this.S.player.carId].r);
    // мокрое отражение
    const night = this.track.night;
    const xO = worldX(L, camX, o.x) - mO.L * 0.98;
    const xP = worldX(L, camX, s.x) - mP.L * 0.98;
    if (this.track.wet > 0.2 && settings.quality === 'high') {
      for (const [x, y, sc, cid, vis] of [[xO, L.farLane, farScale, this.S.opp.carId, this.S.opp.visual], [xP, L.nearLane, L.ppm, this.S.player.carId, this.S.player.visual]] as const) {
        g.save(); g.globalAlpha = 0.18 * this.track.wet; g.translate(0, y * 2 + 2); g.scale(1, -1);
        drawCar(g, { carId: cid, visual: vis, x, y, scale: sc, night: false });
        g.restore();
      }
    }
    this.drawParticles(g, L, camX, 1, dt);
    drawCar(g, { carId: this.S.opp.carId, visual: this.S.opp.visual, x: xO, y: L.farLane, scale: farScale, wheelRot: this.wheelO, nitro: o.nitro ? 1 : 0, night, ghost: this.S.ctx.opponent.type === 'ghost', squat: o.v > 0.5 ? 0.6 : 0 });
    this.drawParticles(g, L, camX, 0, dt);
    drawCar(g, { carId: this.S.player.carId, visual: this.S.player.visual, x: xP, y: L.nearLane, scale: L.ppm, wheelRot: this.wheelP, nitro: s.nitroLeft > 0 ? 1 : 0, night, brake: this.clutchHeld && !s.launched, squat: s.launched && s.a > 3 ? Math.min(1, s.a / 8) : 0 });
    // имена
    g.font = 'bold 12px Arial'; g.textAlign = 'center';
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(xO + mO.L / 2 - 50, L.farLane - mO.H - 26, 100, 16);
    g.fillStyle = '#ffd23f'; g.fillText(this.S.opp.name, xO + mO.L / 2, L.farLane - mO.H - 14);
    g.textAlign = 'left';
    if (this.track.scenery === 'port' && settings.quality === 'high') this.rain(g, L);
    g.restore();

    this.drawDash(g);
    this.drawHud(g, elapsed, o);
    this.drawButtons(g);
    this.drawPopups(g, dt);
    if (this.S.tutorial) this.drawTutorial(g);
  }

  private smoke(x: number, lane: number) {
    if (this.particles.length > 220) return;
    for (let i = 0; i < 2; i++) this.particles.push({ x: x - CAR_MAP[lane ? this.S.opp.carId : this.S.player.carId].length * 0.8, y: 0.2, vx: -1 - Math.random() * 3, vy: 0.6 + Math.random() * 1.2, life: 0, max: 1.2 + Math.random(), size: 10 + Math.random() * 10, color: '#d8d8e0', lane });
  }

  private drawParticles(g: CanvasRenderingContext2D, L: SceneLayout, camX: number, lane: number, dt: number) {
    const keep: Particle[] = [];
    for (const p of this.particles) {
      if (p.lane !== lane) { keep.push(p); continue; }
      p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life > p.max) continue;
      keep.push(p);
      const k = p.life / p.max;
      const sx = worldX(L, camX, p.x), sy = (lane ? L.farLane : L.nearLane) - p.y * L.ppm;
      g.globalAlpha = (1 - k) * (p.color === '#d8d8e0' ? 0.45 : 0.9);
      g.fillStyle = p.color;
      g.beginPath(); g.arc(sx, sy, p.size * (p.color === '#d8d8e0' ? 1 + k * 2.5 : 1), 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    this.particles = keep;
  }

  private rain(g: CanvasRenderingContext2D, L: SceneLayout) {
    g.strokeStyle = 'rgba(180,210,255,0.35)'; g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i < 70; i++) {
      const x = (i * 97.3 + this.time * 900) % L.W, y = (i * 53.1 + this.time * 1400) % L.H;
      g.moveTo(x, y); g.lineTo(x - 4, y + 12);
    }
    g.stroke();
  }

  private lightsState(): number {
    // 0: нет, 1..3: жёлтые, 4: зелёный, -1: фальстарт
    if (this.sP.falseStart) return -1;
    const tl = (this.cfgP.greenTick - this.sP.tick) / TICK_HZ;
    if (tl <= 0) return 4;
    if (tl <= 0.5) return 3;
    if (tl <= 1.0) return 2;
    if (tl <= 1.5) return 1;
    return 0;
  }

  private drawTree(g: CanvasRenderingContext2D, L: SceneLayout, camX: number) {
    const x = worldX(L, camX, -1.2);
    if (x < -40 || x > L.W + 40) return;
    const st = this.lightsState();
    const top = L.roadTop - 10;
    g.fillStyle = '#20232b'; g.fillRect(x - 3, top, 6, L.nearLane - top - L.ppm * 1.2);
    g.fillRect(x - 12, top - 70, 24, 76);
    for (let i = 0; i < 4; i++) {
      const on = st === -1 ? i === 3 : i < 3 ? st > i && st < 4 : st === 4;
      const col = i < 3 ? '#ffb000' : st === -1 ? '#ff2020' : '#20ff60';
      g.fillStyle = on ? col : '#3a3a3a';
      g.beginPath(); g.arc(x, top - 60 + i * 17, 6, 0, Math.PI * 2); g.fill();
      if (on) { g.fillStyle = col + '55'; g.beginPath(); g.arc(x, top - 60 + i * 17, 13, 0, Math.PI * 2); g.fill(); }
    }
  }

  private drawHud(g: CanvasRenderingContext2D, _elapsed: number, o: { x: number }) {
    const W = this.W, s = this.sP;
    // прогресс
    const bx = 60, bw = W - 120, by = 14;
    g.fillStyle = 'rgba(0,0,0,0.55)'; roundRect(g, bx - 6, by - 6, bw + 12, 26, 13); g.fill();
    g.fillStyle = '#333'; g.fillRect(bx, by + 5, bw, 4);
    const d = this.cfgP.distance;
    const mark = (x: number, c: string, label: string) => {
      const px = bx + Math.min(1, x / d) * bw;
      g.fillStyle = c; g.beginPath(); g.arc(px, by + 7, 7, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#000'; g.font = 'bold 9px Arial'; g.textAlign = 'center'; g.fillText(label, px, by + 10);
    };
    mark(o.x, '#ffd23f', 'С');
    mark(s.x, '#3fffb0', 'Я');
    g.textAlign = 'left';
    // таймер
    const t = s.launched ? (s.finished ? s.finishT : (s.tick - this.cfgP.greenTick) / TICK_HZ) : 0;
    g.font = 'bold 22px "Arial Black", Arial'; g.fillStyle = '#fff'; g.textAlign = 'right';
    g.shadowColor = '#000'; g.shadowBlur = 4;
    g.fillText(t > 0 ? t.toFixed(3) + ' с' : '0.000 с', W - 14, 58);
    g.font = 'bold 13px Arial'; g.fillStyle = '#9fe8ff';
    g.fillText(`${Math.max(0, d - s.x).toFixed(0)} м до финиша`, W - 14, 76);
    g.shadowBlur = 0; g.textAlign = 'left';
    // большой светофор при отсчёте
    const st = this.lightsState();
    if (!s.launched || st === -1) {
      const cx = W / 2, cy = 70;
      g.fillStyle = 'rgba(10,10,14,0.85)'; roundRect(g, cx - 92, cy - 22, 184, 44, 22); g.fill();
      for (let i = 0; i < 4; i++) {
        const on = st === -1 ? i === 3 : i < 3 ? st > i && st < 4 : st === 4;
        const col = i < 3 ? '#ffb000' : st === -1 ? '#ff2020' : '#20ff60';
        const lx = cx - 66 + i * 44;
        const rg = g.createRadialGradient(lx - 4, cy - 4, 2, lx, cy, 16);
        rg.addColorStop(0, on ? '#fff' : '#555'); rg.addColorStop(0.4, on ? col : '#2a2a2a'); rg.addColorStop(1, on ? col + '00' : '#1a1a1a');
        g.fillStyle = rg; g.beginPath(); g.arc(lx, cy, 15, 0, Math.PI * 2); g.fill();
      }
      if (!s.launched && s.tick < this.cfgP.greenTick) {
        const z = s.zones;
        const ok = s.rpm >= z.launchLo && s.rpm <= z.launchHi;
        g.font = 'bold 14px Arial'; g.textAlign = 'center';
        g.fillStyle = ok ? '#3fffb0' : '#ffd23f';
        g.fillText(this.clutchHeld ? (ok ? 'Обороты в зелёной зоне — жди зелёный!' : 'Держи стрелку в зелёной зоне') : 'Зажми СЦЕПЛЕНИЕ и газуй', cx, cy + 40);
        g.textAlign = 'left';
      }
    }
  }

  private drawDash(g: CanvasRenderingContext2D) {
    const W = this.W, H = this.H, top = this.dashTop, s = this.sP, car = this.cfgP.car;
    const bg = g.createLinearGradient(0, top, 0, H);
    bg.addColorStop(0, '#1d2230'); bg.addColorStop(0.08, '#0d1018'); bg.addColorStop(1, '#05060a');
    g.fillStyle = bg; g.fillRect(0, top, W, H - top);
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, top, W, 2);
    // карбон
    g.fillStyle = 'rgba(255,255,255,0.025)';
    for (let x = 0; x < W; x += 8) for (let y = top + 4; y < H; y += 8) if (((x + y) / 8) % 2 === 0) g.fillRect(x, y, 4, 4);
    const land = W > H;
    const dh = H - top;
    const R = Math.min(dh * (land ? 0.44 : 0.3), land ? W * 0.13 : W * 0.24);
    const cx = W / 2 - (land ? R * 0.15 : R * 1.05), cy = top + (land ? dh * 0.5 : R + 14);
    const z = s.zones;
    const maxRpm = Math.ceil(car.limiter / 1000) * 1000;
    const zones: [number, number, string][] = [[car.redline, maxRpm, '#ff2a2a']];
    if (!s.launched) zones.push([z.launchLo, z.launchHi, '#20ff60']);
    else if (s.gear < car.gears.length) zones.push([z.perfLo[s.gear - 1], z.perfHi[s.gear - 1], '#2fd9ff']);
    gauge(g, cx, cy, R, s.rpm, maxRpm, 1000, (v) => String(v / 1000), zones, 'об/мин ×1000');
    // индикатор передачи
    g.fillStyle = '#000'; roundRect(g, cx - R * 0.22, cy + R * 0.18, R * 0.44, R * 0.42, 6); g.fill();
    g.strokeStyle = '#333'; g.stroke();
    g.font = `bold ${R * 0.38}px "Courier New", monospace`; g.textAlign = 'center';
    g.fillStyle = s.shiftTimer > 0 ? '#555' : '#ffb000';
    g.fillText(s.shiftTimer > 0 ? '–' : String(s.gear), cx, cy + R * 0.52);
    // шифт-лампы
    const gi = s.gear - 1;
    const lo = s.launched ? z.perfLo[gi] : z.launchLo;
    const hi = s.launched ? z.perfHi[gi] : z.launchHi;
    for (let i = 0; i < 7; i++) {
      const thr = lo - 1400 + i * 233;
      const on = s.rpm >= thr;
      const perfectNow = s.rpm >= lo && s.rpm <= hi;
      const col = perfectNow ? (Math.floor(this.time * 12) % 2 ? '#2fd9ff' : '#fff') : i < 3 ? '#20ff60' : i < 5 ? '#ffd000' : '#ff2a2a';
      g.fillStyle = on ? col : '#222';
      g.beginPath(); g.arc(cx - R * 0.6 + i * R * 0.2, cy - R * 1.05 - 4, R * 0.06, 0, Math.PI * 2); g.fill();
    }
    // спидометр
    const R2 = R * 0.72;
    const cx2 = land ? cx + R + R2 + 18 : cx + R + R2 + 16, cy2 = land ? cy + R * 0.1 : cy + R * 0.15;
    const kmh = s.v * 3.6;
    gauge(g, cx2, cy2, R2, kmh, kmh > 280 ? 400 : 300, 40, (v) => String(v), [], 'км/ч');
    g.font = `bold ${R2 * 0.32}px "Courier New", monospace`; g.fillStyle = '#fff'; g.textAlign = 'center';
    g.fillText(kmh.toFixed(0), cx2, cy2 + R2 * 0.55);
    // наддув и нитро
    const by = cy2 + R2 + 10;
    if (car.boostMax > 0) bar(g, cx2 - R2, Math.min(by, H - 34), R2 * 2, 8, s.boost, '#ff9d3c', 'НАДДУВ');
    if (car.nitroPower > 0) bar(g, cx2 - R2, Math.min(by + 20, H - 14), R2 * 2, 8, s.nitroUsed ? Math.max(0, s.nitroLeft / car.nitroDur) : 1, '#a98bff', s.nitroUsed && s.nitroLeft <= 0 ? 'НИТРО ПУСТО' : 'НИТРО');
    g.textAlign = 'left';
  }

  private drawButtons(g: CanvasRenderingContext2D) {
    const held = new Set(this.pressed.values());
    if (this.thrHeld) held.add('gas');
    if (this.clutchHeld) held.add('clutch');
    for (const b of this.btns) {
      if (b.id === 'nitro' && (this.cfgP.car.nitroPower <= 0 || this.sP.nitroUsed)) { g.globalAlpha = 0.3; }
      const on = held.has(b.id);
      glossy(g, b.x, b.y + (on ? 2 : 0), b.w, b.h, b.color, on, b.round ? 18 : 14);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.shadowColor = '#000'; g.shadowBlur = 3;
      g.font = `bold ${b.id === 'quit' ? 18 : Math.min(28, b.w * 0.24)}px "Arial Black", Arial`;
      g.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + (b.sub ? 2 : 8) + (on ? 2 : 0));
      if (b.sub) { g.font = 'bold 11px Arial'; g.fillText(b.sub, b.x + b.w / 2, b.y + b.h / 2 + 20 + (on ? 2 : 0)); }
      g.shadowBlur = 0; g.globalAlpha = 1;
      if (b.id === 'gas' || b.id === 'clutch') {
        // рифление педали
        g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 3;
        for (let y = b.y + b.h * 0.62; y < b.y + b.h - 10; y += 10) { g.beginPath(); g.moveTo(b.x + 14, y + (on ? 2 : 0)); g.lineTo(b.x + b.w - 14, y + (on ? 2 : 0)); g.stroke(); }
      }
    }
    g.textAlign = 'left';
  }

  private drawPopups(g: CanvasRenderingContext2D, dt: number) {
    const cx = this.W / 2, cy = this.dashTop * 0.45;
    this.popups = this.popups.filter((p) => (p.t += dt) < 1.1);
    this.popups.forEach((p, i) => {
      const k = p.t / 1.1;
      g.globalAlpha = 1 - k * k;
      const size = 30 * (1 + Math.max(0, 0.3 - p.t) * 2);
      g.font = `italic 900 ${size}px "Arial Black", Impact, sans-serif`;
      g.textAlign = 'center';
      g.lineWidth = 6; g.strokeStyle = '#000'; g.strokeText(p.text, cx, cy - i * 36 - k * 30);
      g.fillStyle = p.color; g.fillText(p.text, cx, cy - i * 36 - k * 30);
    });
    g.globalAlpha = 1; g.textAlign = 'left';
  }

  private drawTutorial(g: CanvasRenderingContext2D) {
    const s = this.sP, z = s.zones;
    let msg = '';
    let target = '';
    if (!s.launched) {
      if (!this.clutchHeld) { msg = 'Зажми и держи СЦЕПЛЕНИЕ (левая педаль / Пробел)'; target = 'clutch'; }
      else if (s.tick < this.cfgP.greenTick) { msg = s.rpm < z.launchLo ? 'Жми ГАЗ: стрелку — в зелёную зону' : s.rpm > z.launchHi ? 'Много оборотов! Отпусти газ чуть-чуть' : 'Так держать! Жди зелёный'; target = 'gas'; }
      else { msg = 'ЗЕЛЁНЫЙ! Отпускай сцепление!'; target = 'clutch'; }
    } else if (!s.finished) {
      if (s.shiftTimer <= 0 && s.gear < this.cfgP.car.gears.length && s.rpm >= z.perfLo[s.gear - 1] - 300) { msg = 'Стрелка в голубой зоне — отпусти газ и жми ▲'; target = 'up'; }
      else if (s.shifts < 3) msg = 'Держи газ, следи за шифт-лампами';
      if (this.tutStep < 1) this.tutStep = 1;
    }
    if (!msg) return;
    const y = this.dashTop - 46;
    g.fillStyle = 'rgba(0,0,0,0.75)'; roundRect(g, 20, y, this.W - 40, 34, 17); g.fill();
    g.strokeStyle = '#ffd23f'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#ffd23f'; g.font = 'bold 15px Arial'; g.textAlign = 'center';
    g.fillText('ОБУЧЕНИЕ: ' + msg, this.W / 2, y + 22); g.textAlign = 'left';
    const b = this.btns.find((x) => x.id === target);
    if (b) {
      const pulse = 4 + Math.sin(this.time * 8) * 3;
      g.strokeStyle = '#ffd23f'; g.lineWidth = 3;
      roundRect(g, b.x - pulse, b.y - pulse, b.w + pulse * 2, b.h + pulse * 2, 18); g.stroke();
    }
  }
}

// ───────── примитивы приборов ─────────
export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

export function glossy(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, pressed: boolean, r = 14) {
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, lighten(color, pressed ? 0.05 : 0.35)); gr.addColorStop(0.5, color); gr.addColorStop(1, lighten(color, -0.45));
  g.fillStyle = 'rgba(0,0,0,0.5)'; roundRect(g, x, y + 4, w, h, r); g.fill();
  g.fillStyle = gr; roundRect(g, x, y, w, h, r); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.5; g.stroke();
  const hl = g.createLinearGradient(0, y, 0, y + h * 0.5);
  hl.addColorStop(0, 'rgba(255,255,255,0.55)'); hl.addColorStop(1, 'rgba(255,255,255,0.05)');
  g.fillStyle = hl; roundRect(g, x + 4, y + 3, w - 8, h * 0.45, Math.max(2, r - 4)); g.fill();
}

function lighten(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
  if (k > 0) { r += (255 - r) * k; gg += (255 - gg) * k; b += (255 - b) * k; } else { r *= 1 + k; gg *= 1 + k; b *= 1 + k; }
  return `rgb(${r | 0},${gg | 0},${b | 0})`;
}

function gauge(g: CanvasRenderingContext2D, cx: number, cy: number, R: number, val: number, max: number, step: number, fmt: (v: number) => string, zones: [number, number, string][], unit: string) {
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  const ang = (v: number) => a0 + (a1 - a0) * Math.max(0, Math.min(1, v / max));
  const face = g.createRadialGradient(cx, cy - R * 0.3, R * 0.1, cx, cy, R);
  face.addColorStop(0, '#2a2f3d'); face.addColorStop(1, '#07080c');
  g.fillStyle = '#666'; g.beginPath(); g.arc(cx, cy, R + 5, 0, Math.PI * 2); g.fill();
  const rim = g.createLinearGradient(0, cy - R, 0, cy + R);
  rim.addColorStop(0, '#e8e8e8'); rim.addColorStop(1, '#3a3a3a');
  g.fillStyle = rim; g.beginPath(); g.arc(cx, cy, R + 4, 0, Math.PI * 2); g.fill();
  g.fillStyle = face; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  for (const [a, b, c] of zones) {
    g.strokeStyle = c; g.lineWidth = R * 0.1;
    g.beginPath(); g.arc(cx, cy, R * 0.86, ang(a), ang(b)); g.stroke();
  }
  g.strokeStyle = '#ddd'; g.fillStyle = '#ddd';
  g.font = `bold ${Math.max(9, R * 0.13)}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let v = 0; v <= max; v += step / 2) {
    const a = ang(v), major = v % step === 0;
    g.lineWidth = major ? 2 : 1;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * R * 0.92, cy + Math.sin(a) * R * 0.92); g.lineTo(cx + Math.cos(a) * R * (major ? 0.78 : 0.85), cy + Math.sin(a) * R * (major ? 0.78 : 0.85)); g.stroke();
    if (major) g.fillText(fmt(v), cx + Math.cos(a) * R * 0.64, cy + Math.sin(a) * R * 0.64);
  }
  g.font = `${Math.max(8, R * 0.09)}px Arial`; g.fillStyle = '#8a93a6';
  g.fillText(unit, cx, cy - R * 0.32);
  g.textBaseline = 'alphabetic';
  const a = ang(val);
  g.strokeStyle = '#ff3b1f'; g.lineWidth = Math.max(2, R * 0.045); g.lineCap = 'round';
  g.shadowColor = '#ff3b1f'; g.shadowBlur = 8;
  g.beginPath(); g.moveTo(cx - Math.cos(a) * R * 0.12, cy - Math.sin(a) * R * 0.12); g.lineTo(cx + Math.cos(a) * R * 0.88, cy + Math.sin(a) * R * 0.88); g.stroke();
  g.shadowBlur = 0; g.lineCap = 'butt';
  g.fillStyle = '#222'; g.beginPath(); g.arc(cx, cy, R * 0.09, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#888'; g.lineWidth = 1; g.stroke();
}

function bar(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, v: number, color: string, label: string) {
  g.fillStyle = '#111'; roundRect(g, x, y, w, h, h / 2); g.fill();
  g.fillStyle = color; roundRect(g, x, y, Math.max(h, w * Math.max(0, Math.min(1, v))), h, h / 2); g.fill();
  g.font = 'bold 9px Arial'; g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(label, x + w / 2, y + h - 1);
}
