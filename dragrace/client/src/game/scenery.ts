// Процедурные фоны шести трасс: параллакс, трибуны, мокрый асфальт.
import { hashStr, mulberry32, type TrackDef } from '@drag/shared';

export interface SceneLayout { W: number; H: number; horizon: number; roadTop: number; farLane: number; nearLane: number; roadBottom: number; ppm: number; anchor: number }

const tileCache = new Map<string, HTMLCanvasElement>();

function tile(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D, rnd: () => number) => void) {
  const k = `${key}:${w}:${h}`;
  let c = tileCache.get(k);
  if (!c) {
    c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d')!, mulberry32(hashStr(key)));
    tileCache.set(k, c);
    if (tileCache.size > 40) tileCache.delete(tileCache.keys().next().value!);
  }
  return c;
}

function windows(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rnd: () => number, colors: string[], density = 0.45) {
  for (let yy = y + 6; yy < y + h - 6; yy += 9) for (let xx = x + 4; xx < x + w - 5; xx += 7) {
    if (rnd() < density) { c.fillStyle = colors[Math.floor(rnd() * colors.length)]; c.fillRect(xx, yy, 3, 4); }
  }
}

function farSkyline(t: TrackDef, w: number, h: number) {
  return tile('far-' + t.id, w, h, (c, rnd) => {
    const base = h;
    c.fillStyle = shadeSky(t);
    switch (t.scenery) {
      case 'industrial':
        for (let x = 0; x < w;) {
          const bw = 40 + rnd() * 90, bh = 30 + rnd() * 70;
          c.fillStyle = '#2a1f2e'; c.fillRect(x, base - bh, bw, bh);
          if (rnd() < 0.5) { c.fillRect(x + bw * 0.3, base - bh - 50 - rnd() * 40, 10, 120); c.fillStyle = 'rgba(200,180,170,0.15)'; c.beginPath(); c.arc(x + bw * 0.3 + 5, base - bh - 90, 18, 0, 7); c.fill(); }
          windows(c, x, base - bh, bw, bh, rnd, ['#ffb35a', '#ff8a3c'], 0.15);
          x += bw + rnd() * 20;
        }
        break;
      case 'downtown': case 'bridge':
        for (let x = 0; x < w;) {
          const bw = 30 + rnd() * 70, bh = 60 + rnd() * (t.scenery === 'bridge' ? 120 : 200);
          c.fillStyle = rnd() < 0.5 ? '#0e0b26' : '#151236'; c.fillRect(x, base - bh, bw, bh);
          windows(c, x, base - bh, bw, bh, rnd, ['#ffe9a8', '#9fe8ff', '#ff9ff3', '#ffffff'], 0.35);
          if (rnd() < 0.25) { c.fillStyle = '#ff2b2b'; c.fillRect(x + bw / 2 - 1, base - bh - 14, 2, 14); }
          x += bw + 2 + rnd() * 8;
        }
        break;
      case 'port':
        for (let x = 0; x < w;) {
          const bw = 60 + rnd() * 100;
          c.fillStyle = '#0b2236';
          c.fillRect(x, base - 25 - rnd() * 30, bw, 60);
          if (rnd() < 0.6) { // кран
            c.strokeStyle = '#0d2c45'; c.lineWidth = 5;
            const cx = x + bw / 2, top = base - 150 - rnd() * 50;
            c.beginPath(); c.moveTo(cx, base); c.lineTo(cx, top); c.lineTo(cx + 90, top); c.moveTo(cx - 30, top); c.lineTo(cx, top - 25); c.lineTo(cx + 90, top); c.stroke();
            c.fillStyle = '#ff3b3b'; c.fillRect(cx - 2, top - 28, 4, 4);
          }
          x += bw + rnd() * 30;
        }
        break;
      case 'highway':
        c.fillStyle = '#3a3157';
        c.beginPath(); c.moveTo(0, base);
        for (let x = 0; x <= w; x += 20) c.lineTo(x, base - 50 - Math.sin(x * 0.006) * 35 - rnd() * 10);
        c.lineTo(w, base); c.fill();
        c.fillStyle = '#26324a';
        c.beginPath(); c.moveTo(0, base);
        for (let x = 0; x <= w; x += 30) c.lineTo(x, base - 25 - Math.sin(x * 0.011 + 2) * 18);
        c.lineTo(w, base); c.fill();
        break;
      case 'airfield':
        for (let x = 0; x < w;) {
          c.fillStyle = '#132a40';
          const bw = 120 + rnd() * 80;
          c.beginPath(); c.moveTo(x, base); c.lineTo(x, base - 40); c.quadraticCurveTo(x + bw / 2, base - 90, x + bw, base - 40); c.lineTo(x + bw, base); c.fill();
          if (rnd() < 0.3) { c.fillRect(x + bw + 20, base - 120, 14, 120); c.fillRect(x + bw + 10, base - 135, 34, 18); c.fillStyle = '#9fe8ff'; c.fillRect(x + bw + 12, base - 131, 30, 6); }
          x += bw + 60 + rnd() * 80;
        }
        break;
    }
  });
}

function shadeSky(t: TrackDef) { return t.sky[0]; }

function midLayer(t: TrackDef, w: number, h: number) {
  return tile('mid-' + t.id, w, h, (c, rnd) => {
    const base = h;
    switch (t.scenery) {
      case 'industrial':
        for (let x = 0; x < w; x += 180 + rnd() * 120) {
          c.fillStyle = '#3b2a2f'; c.fillRect(x, base - 70, 90, 70);
          c.fillStyle = '#4b3438'; c.beginPath(); c.ellipse(x + 140, base - 40, 30, 40, 0, 0, 7); c.fill();
          c.strokeStyle = '#5c4044'; c.lineWidth = 6; c.beginPath(); c.moveTo(x + 90, base - 50); c.lineTo(x + 115, base - 50); c.stroke();
          c.fillStyle = '#ff9d3c'; c.fillRect(x + 20, base - 50, 12, 8);
        }
        break;
      case 'downtown': {
        const neon = ['#ff3fd8', '#3fffe2', '#ffd23f', '#7d5cff', '#ff5c5c'];
        const words = ['БАР', 'КИНО', '24', 'ШИНЫ', 'КАФЕ', 'NEON', 'ОТЕЛЬ', 'МОТОР'];
        for (let x = 0; x < w; x += 120 + rnd() * 140) {
          const bh = 90 + rnd() * 60;
          c.fillStyle = '#1b1440'; c.fillRect(x, base - bh, 100, bh);
          windows(c, x, base - bh, 100, bh, rnd, ['#2c2366', '#ffe9a8'], 0.3);
          const col = neon[Math.floor(rnd() * neon.length)];
          c.shadowColor = col; c.shadowBlur = 12; c.fillStyle = col;
          c.font = 'bold 18px Arial'; c.fillText(words[Math.floor(rnd() * words.length)], x + 12, base - bh + 30);
          c.shadowBlur = 0;
        }
        break;
      }
      case 'port': {
        const cols = ['#b5332e', '#2e6db5', '#d9a21b', '#2e9b5a', '#6b3fa0'];
        for (let x = 0; x < w; x += 70 + rnd() * 30) {
          const stack = 1 + Math.floor(rnd() * 3);
          for (let k = 0; k < stack; k++) {
            c.fillStyle = cols[Math.floor(rnd() * cols.length)];
            c.fillRect(x, base - 22 * (k + 1), 64, 21);
            c.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 4; i < 64; i += 6) c.fillRect(x + i, base - 22 * (k + 1) + 2, 2, 17);
          }
        }
        break;
      }
      case 'highway':
        for (let x = 0; x < w; x += 18 + rnd() * 30) {
          const th = 50 + rnd() * 50;
          c.fillStyle = rnd() < 0.5 ? '#1f3b2d' : '#18301f';
          c.beginPath(); c.moveTo(x, base - th); c.lineTo(x + 16, base - 4); c.lineTo(x - 16, base - 4); c.fill();
          c.fillStyle = '#3b2a1f'; c.fillRect(x - 2, base - 6, 4, 6);
        }
        break;
      case 'airfield':
        for (let x = 0; x < w; x += 260 + rnd() * 160) {
          // самолёт на стоянке
          c.fillStyle = '#c9d6e3';
          c.beginPath(); c.ellipse(x + 60, base - 22, 60, 9, 0, 0, 7); c.fill();
          c.beginPath(); c.moveTo(x + 50, base - 22); c.lineTo(x + 30, base - 4); c.lineTo(x + 70, base - 22); c.fill();
          c.beginPath(); c.moveTo(x + 6, base - 24); c.lineTo(x, base - 50); c.lineTo(x + 18, base - 26); c.fill();
          c.fillStyle = '#7dff6a'; c.fillRect(x + 150, base - 4, 4, 4);
        }
        break;
      case 'bridge':
        c.strokeStyle = '#1d2b4f'; c.lineWidth = 3;
        for (let x = 0; x < w; x += 400) {
          c.fillStyle = '#16213d'; c.fillRect(x + 190, base - 210, 22, 210);
          for (let i = -8; i <= 8; i++) { c.beginPath(); c.moveTo(x + 200, base - 200); c.lineTo(x + 200 + i * 24, base); c.stroke(); }
          c.fillStyle = '#ff3333'; c.fillRect(x + 197, base - 216, 6, 6);
        }
        break;
    }
  });
}

export function drawBackground(ctx: CanvasRenderingContext2D, t: TrackDef, L: SceneLayout, camX: number, time: number) {
  const { W, horizon } = L;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, t.sky[0]); sky.addColorStop(0.6, t.sky[1]); sky.addColorStop(1, t.sky[2]);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, horizon + 2);
  if (t.night) {
    const r = mulberry32(5);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 70; i++) { const x = r() * W, y = r() * horizon * 0.7; const tw = (Math.sin(time * 2 + i) + 1) * 0.5; ctx.globalAlpha = 0.3 + tw * 0.6; ctx.fillRect(x, y, 1.5, 1.5); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#f4f1de'; ctx.beginPath(); ctx.arc(W * 0.82, horizon * 0.25, 16, 0, 7); ctx.fill();
  } else {
    const g = ctx.createRadialGradient(W * 0.7, horizon * 0.85, 4, W * 0.7, horizon * 0.85, 80);
    g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = g; ctx.fillRect(W * 0.7 - 80, horizon * 0.85 - 80, 160, 160);
  }
  const farH = Math.round(horizon * 0.85);
  const far = farSkyline(t, 1024, farH);
  const off1 = -((camX * L.ppm * 0.04) % 1024);
  for (let x = off1 - 1024; x < W; x += 1024) ctx.drawImage(far, x, horizon - farH);
  const midH = Math.round(Math.max(120, horizon * 0.7));
  const mid = midLayer(t, 1200, midH);
  const off2 = -((camX * L.ppm * 0.22) % 1200);
  for (let x = off2 - 1200; x < W; x += 1200) ctx.drawImage(mid, x, L.roadTop - midH + 4);
  // туман у горизонта
  const fog = ctx.createLinearGradient(0, L.roadTop - 40, 0, L.roadTop);
  fog.addColorStop(0, 'rgba(0,0,0,0)'); fog.addColorStop(1, t.night ? 'rgba(20,10,40,0.6)' : 'rgba(255,200,170,0.25)');
  ctx.fillStyle = fog; ctx.fillRect(0, L.roadTop - 40, W, 40);
}

export function worldX(L: SceneLayout, camX: number, x: number) { return (x - camX) * L.ppm + L.anchor; }

export function drawRoad(ctx: CanvasRenderingContext2D, t: TrackDef, L: SceneLayout, camX: number, distance: number, time: number) {
  const { W } = L;
  const top = L.roadTop, bot = L.roadBottom;
  // барьер/трибуны
  drawStands(ctx, t, L, camX, time);
  const g = ctx.createLinearGradient(0, top, 0, bot);
  g.addColorStop(0, '#1b1d24'); g.addColorStop(0.5, '#23262e'); g.addColorStop(1, '#0f1014');
  ctx.fillStyle = g; ctx.fillRect(0, top, W, bot - top);
  // текстура асфальта
  const r = mulberry32(11);
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  const shift = (camX * L.ppm) % 64;
  for (let i = 0; i < 160; i++) { const x = ((r() * (W + 64) - shift) % (W + 64) + W + 64) % (W + 64) - 32; ctx.fillRect(x, top + r() * (bot - top), 2, 1); }
  // мокрые отражения фонарей
  const spacing = 25;
  const first = Math.floor((camX - L.anchor / L.ppm) / spacing) - 1;
  for (let i = first; i < first + W / (spacing * L.ppm) + 3; i++) {
    const x = worldX(L, camX, i * spacing);
    if (t.wet > 0) {
      const rg = ctx.createLinearGradient(0, top, 0, bot);
      rg.addColorStop(0, hexA(t.accent, 0.0)); rg.addColorStop(0.4, hexA(t.accent, 0.18 * t.wet)); rg.addColorStop(1, hexA(t.accent, 0));
      ctx.fillStyle = rg; ctx.fillRect(x - 6, top, 12, bot - top);
    }
  }
  // полосы
  const midY = (L.farLane + L.nearLane) / 2 + 4;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  const dash = 3 * L.ppm, gap = 3 * L.ppm;
  const o = -((camX * L.ppm) % (dash + gap));
  for (let x = o; x < W; x += dash + gap) ctx.fillRect(x, midY, dash, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(0, top + 2, W, 2); ctx.fillRect(0, bot - 6, W, 2);
  // старт и финиш
  for (const [mx, label] of [[0, 'СТАРТ'], [distance, 'ФИНИШ']] as const) {
    const x = worldX(L, camX, mx);
    if (x < -60 || x > W + 60) continue;
    const sq = 6;
    for (let yy = top; yy < bot; yy += sq) for (let k = 0; k < 2; k++) {
      ctx.fillStyle = ((yy / sq + k) | 0) % 2 ? '#fff' : '#111';
      ctx.fillRect(x + k * sq, yy, sq, sq);
    }
    // арка
    ctx.fillStyle = '#2b2f3a'; ctx.fillRect(x - 4, top - 120, 8, 120);
    ctx.fillStyle = label === 'ФИНИШ' ? '#d72638' : '#1e7f4f';
    ctx.fillRect(x - 70, top - 140, 140, 26);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center'; ctx.fillText(label, x, top - 121);
    ctx.textAlign = 'left';
  }
  // отметки дистанции
  for (let m = 50; m < distance; m += 50) {
    const x = worldX(L, camX, m);
    if (x < -40 || x > W + 40) continue;
    ctx.fillStyle = '#e8e8e8'; ctx.fillRect(x - 14, top - 30, 28, 16);
    ctx.fillStyle = '#111'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center'; ctx.fillText(String(m), x, top - 18); ctx.textAlign = 'left';
  }
  // фонари поверх
  for (let i = first; i < first + W / (spacing * L.ppm) + 3; i++) {
    const x = worldX(L, camX, i * spacing);
    ctx.fillStyle = '#3a3f4b'; ctx.fillRect(x - 2, top - 90, 4, 90);
    ctx.fillRect(x - 2, top - 90, 16, 3);
    ctx.fillStyle = t.night ? '#fff6c8' : '#ddd';
    ctx.fillRect(x + 8, top - 88, 8, 3);
    if (t.night) { const lg = ctx.createRadialGradient(x + 12, top - 86, 1, x + 12, top - 86, 30); lg.addColorStop(0, 'rgba(255,240,180,0.6)'); lg.addColorStop(1, 'rgba(255,240,180,0)'); ctx.fillStyle = lg; ctx.fillRect(x - 20, top - 120, 64, 64); }
  }
}

function drawStands(ctx: CanvasRenderingContext2D, t: TrackDef, L: SceneLayout, camX: number, time: number) {
  const top = L.roadTop;
  const x0 = worldX(L, camX, -60), x1 = worldX(L, camX, 90);
  if (x1 < 0 || x0 > L.W) return;
  ctx.fillStyle = '#2d3240';
  for (let row = 0; row < 5; row++) ctx.fillRect(x0, top - 18 - row * 12, x1 - x0, 10);
  const r = mulberry32(3);
  for (let i = 0; i < (x1 - x0) / 5; i++) {
    const row = Math.floor(r() * 5);
    const x = x0 + r() * (x1 - x0), y = top - 26 - row * 12 + Math.sin(time * 6 + i) * (r() < 0.3 ? 2 : 0);
    ctx.fillStyle = ['#e9c46a', '#e76f51', '#2a9d8f', '#f4f1de', '#8ab17d', '#c77dff'][i % 6];
    ctx.fillRect(x, y, 3, 6);
    ctx.fillStyle = '#e0b48a'; ctx.fillRect(x, y - 3, 3, 3);
    if (r() < 0.02 && Math.sin(time * 9 + i * 3) > 0.95) { ctx.fillStyle = '#fff'; ctx.fillRect(x - 2, y - 5, 6, 6); }
  }
  ctx.fillStyle = t.accent; ctx.fillRect(x0, top - 6, x1 - x0, 6);
  ctx.fillStyle = '#0f1116'; ctx.font = 'bold 11px Arial';
  for (let x = x0 + 20; x < x1; x += 160) ctx.fillText('★ НИТРО-ДВОР ★', x, top - 1);
}

export function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
