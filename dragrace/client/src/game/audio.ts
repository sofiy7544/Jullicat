// Синтез звука через Web Audio API: мотор по оборотам, турбина, пробуксовка, переключения.
import { settings } from '../settings';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

export function audioCtx() { return ctx; }

/** iOS Safari: звук разрешён только после жеста пользователя. */
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = settings.volume;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const b = ctx.createBufferSource(); b.buffer = ctx.createBuffer(1, 1, 22050); b.connect(ctx.destination); b.start(0);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function setVolume(v: number) { if (master) master.gain.value = v; }

function noise(): AudioBufferSourceNode {
  const n = ctx!.createBufferSource(); n.buffer = noiseBuf; n.loop = true; return n;
}

function curve(k: number) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / n) * 2 - 1; c[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
  return c;
}

export class EngineSound {
  private o1!: OscillatorNode; private o2!: OscillatorNode; private o3!: OscillatorNode;
  private filt!: BiquadFilterNode; private out!: GainNode; private shaper!: WaveShaperNode;
  private roar!: GainNode; private roarF!: BiquadFilterNode;
  private turbo!: OscillatorNode; private turboG!: GainNode;
  private tire!: GainNode; private tireF!: BiquadFilterNode;
  private nitroG!: GainNode;
  private alive = false;
  constructor(private cyl: number, private vol = 1) {
    if (!ctx || !master) return;
    const c = ctx;
    this.out = c.createGain(); this.out.gain.value = 0;
    this.out.connect(master);
    this.shaper = c.createWaveShaper(); this.shaper.curve = curve(8);
    this.filt = c.createBiquadFilter(); this.filt.type = 'lowpass'; this.filt.Q.value = 4;
    this.o1 = c.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = c.createOscillator(); this.o2.type = 'square';
    this.o3 = c.createOscillator(); this.o3.type = 'triangle';
    const g1 = c.createGain(); g1.gain.value = 0.35;
    const g2 = c.createGain(); g2.gain.value = 0.25;
    const g3 = c.createGain(); g3.gain.value = 0.5;
    this.o1.connect(g1); this.o2.connect(g2); this.o3.connect(g3);
    g1.connect(this.shaper); g2.connect(this.shaper); g3.connect(this.filt);
    this.shaper.connect(this.filt); this.filt.connect(this.out);
    const n = noise();
    this.roarF = c.createBiquadFilter(); this.roarF.type = 'bandpass'; this.roarF.Q.value = 1.2;
    this.roar = c.createGain(); this.roar.gain.value = 0;
    n.connect(this.roarF); this.roarF.connect(this.roar); this.roar.connect(this.out);
    this.turbo = c.createOscillator(); this.turbo.type = 'sine';
    this.turboG = c.createGain(); this.turboG.gain.value = 0;
    this.turbo.connect(this.turboG); this.turboG.connect(master);
    const n2 = noise();
    this.tireF = c.createBiquadFilter(); this.tireF.type = 'bandpass'; this.tireF.frequency.value = 1900; this.tireF.Q.value = 6;
    this.tire = c.createGain(); this.tire.gain.value = 0;
    n2.connect(this.tireF); this.tireF.connect(this.tire); this.tire.connect(master);
    const n3 = noise();
    const nf = c.createBiquadFilter(); nf.type = 'highpass'; nf.frequency.value = 3000;
    this.nitroG = c.createGain(); this.nitroG.gain.value = 0;
    n3.connect(nf); nf.connect(this.nitroG); this.nitroG.connect(master);
    for (const s of [this.o1, this.o2, this.o3, this.turbo]) s.start();
    n.start(); n2.start(); n3.start();
    this.alive = true;
  }
  update(rpm: number, throttle: number, boost: number, spin: number, nitro: boolean, load = 1) {
    if (!this.alive || !ctx) return;
    const t = ctx.currentTime, k = 0.03;
    const f = (rpm / 60) * (this.cyl / 2);
    this.o1.frequency.setTargetAtTime(f, t, k);
    this.o2.frequency.setTargetAtTime(f * 0.5, t, k);
    this.o3.frequency.setTargetAtTime(f * 0.25, t, k);
    this.filt.frequency.setTargetAtTime(300 + throttle * 2200 * load + rpm * 0.25, t, k);
    this.out.gain.setTargetAtTime((0.12 + throttle * 0.22) * this.vol, t, k);
    this.roarF.frequency.setTargetAtTime(200 + rpm * 0.15, t, k);
    this.roar.gain.setTargetAtTime(throttle * 0.08 * this.vol, t, k);
    this.turbo.frequency.setTargetAtTime(1800 + boost * 4500, t, 0.08);
    this.turboG.gain.setTargetAtTime(boost * 0.025 * this.vol, t, 0.08);
    this.tire.gain.setTargetAtTime(Math.min(1, spin) * 0.18 * this.vol, t, 0.04);
    this.tireF.frequency.setTargetAtTime(1700 + Math.random() * 400, t, 0.05);
    this.nitroG.gain.setTargetAtTime(nitro ? 0.08 * this.vol : 0, t, 0.05);
  }
  stop() {
    if (!this.alive || !ctx) return;
    this.alive = false;
    const t = ctx.currentTime;
    for (const g of [this.out, this.turboG, this.tire, this.nitroG]) g.gain.setTargetAtTime(0, t, 0.05);
    setTimeout(() => { try { this.out.disconnect(); this.turboG.disconnect(); this.tire.disconnect(); this.nitroG.disconnect(); } catch { /* */ } }, 400);
  }
}

function burst(dur: number, type: BiquadFilterType, freq: number, vol: number) {
  if (!ctx || !master || !settings.sound) return;
  const n = noise();
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  n.connect(f); f.connect(g); g.connect(master);
  n.start(t); n.stop(t + dur + 0.05);
}

function tone(freq: number, dur: number, vol = 0.15, type: OscillatorType = 'sine', slide = 0) {
  if (!ctx || !master || !settings.sound) return;
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = ctx.createGain(); const t = ctx.currentTime;
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}

export const sfx = {
  shift() { burst(0.06, 'bandpass', 2500, 0.5); tone(90, 0.12, 0.3, 'square', 0.5); },
  grind() { burst(0.25, 'bandpass', 3800, 0.6); tone(160, 0.2, 0.2, 'sawtooth', 0.7); },
  blowoff() { burst(0.35, 'highpass', 2200, 0.35); },
  nitro() { burst(0.6, 'lowpass', 600, 0.6); tone(60, 0.6, 0.3, 'sawtooth', 1.5); },
  beep() { tone(620, 0.18, 0.25, 'square'); },
  go() { tone(1250, 0.45, 0.3, 'square'); },
  click() { tone(900, 0.05, 0.1, 'square', 0.6); },
  coin() { tone(1300, 0.08, 0.15, 'square'); setTimeout(() => tone(1800, 0.15, 0.15, 'square'), 80); },
  win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.25, 0.18, 'square'), i * 110)); },
  lose() { [400, 300, 220].forEach((f, i) => setTimeout(() => tone(f, 0.3, 0.15, 'sawtooth'), i * 150)); },
  pop() { burst(0.08, 'lowpass', 400, 0.8); },
};

export function cylinders(body: string) {
  return ({ hatch: 4, sedan: 4, wagon: 4, coupe: 6, muscle: 8, roadster: 6, super: 10 } as Record<string, number>)[body] ?? 4;
}
