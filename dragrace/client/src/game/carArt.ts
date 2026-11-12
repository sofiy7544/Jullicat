// Процедурная отрисовка машин сбоку (никаких растровых ассетов).
import { CAR_MAP, type BodyType, type Visual, type Vinyl } from '@drag/shared';

type Pt = [number, number];
interface BodyShape { H: number; outline: Pt[]; window: Pt[]; rearU: number; frontU: number; pillar?: number }

// u — доля длины от заднего бампера, v — доля высоты кузова
const SHAPES: Record<BodyType, BodyShape> = {
  hatch: { H: 1.45, rearU: 0.17, frontU: 0.8,
    outline: [[0.0, 0.2], [0.0, 0.5], [0.03, 0.72], [0.09, 0.96], [0.46, 1.0], [0.63, 0.67], [0.86, 0.58], [0.995, 0.48], [1, 0.27], [0.985, 0.17]],
    window: [[0.12, 0.9], [0.45, 0.94], [0.59, 0.68], [0.12, 0.66]], pillar: 0.33 },
  sedan: { H: 1.42, rearU: 0.19, frontU: 0.79,
    outline: [[0.0, 0.22], [0.005, 0.56], [0.06, 0.66], [0.2, 0.69], [0.3, 0.97], [0.58, 0.99], [0.7, 0.68], [0.9, 0.6], [1, 0.48], [1, 0.25], [0.985, 0.17]],
    window: [[0.31, 0.92], [0.57, 0.94], [0.67, 0.69], [0.23, 0.68]], pillar: 0.47 },
  wagon: { H: 1.5, rearU: 0.18, frontU: 0.8,
    outline: [[0.0, 0.2], [0.0, 0.58], [0.02, 0.92], [0.06, 0.99], [0.58, 1.0], [0.7, 0.68], [0.9, 0.6], [1, 0.48], [1, 0.25], [0.985, 0.17]],
    window: [[0.05, 0.93], [0.57, 0.95], [0.67, 0.69], [0.05, 0.67]], pillar: 0.36 },
  coupe: { H: 1.3, rearU: 0.18, frontU: 0.8,
    outline: [[0.0, 0.22], [0.0, 0.58], [0.08, 0.7], [0.26, 0.82], [0.4, 0.99], [0.58, 0.99], [0.72, 0.66], [0.92, 0.55], [1, 0.42], [1, 0.24], [0.985, 0.16]],
    window: [[0.3, 0.83], [0.42, 0.94], [0.57, 0.94], [0.69, 0.67], [0.3, 0.66]], pillar: 0.48 },
  muscle: { H: 1.32, rearU: 0.17, frontU: 0.79,
    outline: [[0.0, 0.24], [0.0, 0.62], [0.12, 0.68], [0.24, 0.72], [0.36, 0.98], [0.57, 0.99], [0.68, 0.7], [0.96, 0.66], [1, 0.58], [1, 0.25], [0.985, 0.18]],
    window: [[0.36, 0.93], [0.56, 0.94], [0.66, 0.71], [0.27, 0.71]], pillar: 0.47 },
  roadster: { H: 1.15, rearU: 0.19, frontU: 0.8,
    outline: [[0.0, 0.24], [0.0, 0.62], [0.06, 0.74], [0.3, 0.76], [0.38, 0.79], [0.5, 1.0], [0.56, 0.98], [0.6, 0.76], [0.9, 0.62], [1, 0.48], [1, 0.25], [0.985, 0.18]],
    window: [[0.5, 0.97], [0.55, 0.96], [0.58, 0.78], [0.47, 0.79]] },
  super: { H: 1.12, rearU: 0.2, frontU: 0.8,
    outline: [[0.0, 0.26], [0.0, 0.58], [0.06, 0.7], [0.22, 0.78], [0.38, 0.98], [0.55, 0.99], [0.72, 0.72], [0.92, 0.5], [1, 0.38], [1, 0.22], [0.98, 0.16]],
    window: [[0.37, 0.93], [0.54, 0.95], [0.7, 0.72], [0.34, 0.72]], pillar: 0.46 },
};

export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (k >= 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
  else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export interface DrawCarOpts {
  carId: string; visual: Visual; x: number; y: number; scale: number;
  wheelRot?: number; nitro?: number; night?: boolean; brake?: boolean; squat?: number; ghost?: boolean;
  selected?: number; // индекс выделенного винила (редактор)
}

export function carMetrics(carId: string, scale: number) {
  const def = CAR_MAP[carId];
  const sh = SHAPES[def.body];
  const L = def.length * scale;
  const H = sh.H * scale;
  return { L, H, sh, def, wheelR: def.r * scale * 1.05, bottom: def.r * scale * 0.55 };
}

function path(ctx: CanvasRenderingContext2D, pts: Pt[], ox: number, oy: number, L: number, H: number, base: number) {
  ctx.beginPath();
  pts.forEach(([u, v], i) => {
    const px = ox + u * L, py = oy - base - v * (H - base);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
}

function smoothPath(ctx: CanvasRenderingContext2D, pts: Pt[], ox: number, oy: number, L: number, H: number, base: number) {
  const P = pts.map(([u, v]) => [ox + u * L, oy - base - v * (H - base)] as Pt);
  ctx.beginPath();
  ctx.moveTo((P[0][0] + P[P.length - 1][0]) / 2, (P[0][1] + P[P.length - 1][1]) / 2);
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    ctx.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  ctx.closePath();
}

export function drawCar(ctx: CanvasRenderingContext2D, o: DrawCarOpts) {
  const { L, H, sh, def, wheelR, bottom } = carMetrics(o.carId, o.scale);
  const v = o.visual;
  const ox = o.x, oy = o.y;
  const s = o.scale;
  const squat = o.squat ?? 0;
  ctx.save();
  if (o.ghost) ctx.globalAlpha = 0.55;

  // подсветка днища
  if (v.glow) {
    const g = ctx.createRadialGradient(ox + L / 2, oy, 4, ox + L / 2, oy, L * 0.65);
    g.addColorStop(0, v.glow + 'cc'); g.addColorStop(1, v.glow + '00');
    ctx.fillStyle = g;
    ctx.fillRect(ox - L * 0.2, oy - H * 0.4, L * 1.4, H * 0.7);
  }
  // тень
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.ellipse(ox + L / 2, oy + 1, L * 0.52, s * 0.18, 0, 0, Math.PI * 2); ctx.fill();

  ctx.save();
  ctx.translate(ox + L * sh.rearU, oy - bottom);
  ctx.rotate(-squat * 0.035);
  ctx.translate(-(ox + L * sh.rearU), -(oy - bottom));

  const base = bottom * 0.95;
  // кузов
  smoothPath(ctx, sh.outline, ox, oy, L, H, base);
  const grad = ctx.createLinearGradient(0, oy - H, 0, oy - base);
  grad.addColorStop(0, shade(v.paint, 0.35));
  grad.addColorStop(0.35, v.paint);
  grad.addColorStop(0.8, shade(v.paint, -0.35));
  grad.addColorStop(1, v.paint2 !== '#000000' ? v.paint2 : shade(v.paint, -0.6));
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = Math.max(1, s * 0.04);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.stroke();

  // винилы (обрезка по кузову)
  if (v.vinyls.length) {
    ctx.save();
    smoothPath(ctx, sh.outline, ox, oy, L, H, base);
    ctx.clip();
    for (let i = 0; i < v.vinyls.length; i++) drawVinyl(ctx, v.vinyls[i], ox, oy - base, L, H - base, i === o.selected);
    ctx.restore();
  }

  // блик
  ctx.save();
  smoothPath(ctx, sh.outline, ox, oy, L, H, base);
  ctx.clip();
  const gl = ctx.createLinearGradient(0, oy - H, 0, oy - H * 0.55);
  gl.addColorStop(0, 'rgba(255,255,255,0.55)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gl;
  ctx.fillRect(ox, oy - H, L, H * 0.45);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(1, s * 0.03);
  ctx.beginPath(); ctx.moveTo(ox + L * 0.05, oy - base - (H - base) * 0.52); ctx.lineTo(ox + L * 0.95, oy - base - (H - base) * 0.45); ctx.stroke();
  ctx.restore();

  // окна
  path(ctx, sh.window, ox, oy, L, H, base);
  ctx.closePath();
  const tint = [0.35, 0.55, 0.75, 0.92][v.tint] ?? 0.5;
  const wg = ctx.createLinearGradient(0, oy - H, 0, oy - H * 0.6);
  wg.addColorStop(0, `rgba(120,170,220,${1 - tint * 0.7})`);
  wg.addColorStop(1, `rgba(10,15,30,${0.6 + tint * 0.4})`);
  ctx.fillStyle = wg; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.stroke();
  if (sh.pillar) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(ox + L * sh.pillar, oy - H * 0.98, s * 0.07, H * 0.32);
  }
  // ручка двери и линия двери
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = Math.max(1, s * 0.025);
  ctx.beginPath();
  const dx = ox + L * ((sh.pillar ?? 0.45) + 0.02);
  ctx.moveTo(dx, oy - H * 0.62); ctx.lineTo(dx - s * 0.05, oy - base - s * 0.05); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(dx + s * 0.15, oy - H * 0.55, s * 0.22, s * 0.05);

  // фары
  const night = o.night;
  ctx.fillStyle = night ? '#fffbe0' : '#e8f2ff';
  ctx.beginPath(); ctx.ellipse(ox + L * 0.985, oy - base - (H - base) * 0.38, s * 0.07, s * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  if (night) {
    const hb = ctx.createLinearGradient(ox + L, 0, ox + L + s * 7, 0);
    hb.addColorStop(0, 'rgba(255,250,210,0.45)'); hb.addColorStop(1, 'rgba(255,250,210,0)');
    ctx.fillStyle = hb;
    ctx.beginPath(); ctx.moveTo(ox + L, oy - H * 0.42); ctx.lineTo(ox + L + s * 7, oy - H * 0.65); ctx.lineTo(ox + L + s * 7, oy + s * 0.2); ctx.lineTo(ox + L, oy - H * 0.3); ctx.fill();
  }
  ctx.fillStyle = o.brake ? '#ff2020' : '#b3121b';
  ctx.fillRect(ox - s * 0.01, oy - base - (H - base) * 0.55, s * 0.08, s * 0.16);
  if (o.brake || night) {
    ctx.fillStyle = 'rgba(255,30,30,0.25)';
    ctx.beginPath(); ctx.arc(ox, oy - base - (H - base) * 0.48, s * 0.16, 0, Math.PI * 2); ctx.fill();
  }

  // обвес
  ctx.fillStyle = '#121418';
  if (v.kit >= 1) ctx.fillRect(ox + L * 0.24, oy - bottom - s * 0.04, L * 0.5, s * 0.1);
  if (v.kit >= 3) {
    ctx.beginPath(); ctx.moveTo(ox + L * 0.93, oy - bottom + s * 0.02); ctx.lineTo(ox + L * 1.04, oy - bottom + s * 0.04); ctx.lineTo(ox + L * 1.0, oy - bottom - s * 0.06); ctx.fill();
    ctx.fillRect(ox - s * 0.06, oy - bottom - s * 0.02, s * 0.3, s * 0.08);
  }
  // спойлер
  if (v.spoiler > 0) {
    const sx = ox + L * 0.02, sy = oy - base - (H - base) * (sh.outline[2][1] + 0.02);
    ctx.fillStyle = shade(v.paint, -0.3);
    if (v.spoiler === 1) ctx.fillRect(sx, sy - s * 0.05, L * 0.12, s * 0.06);
    else if (v.spoiler === 2) { ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + L * 0.1, sy - s * 0.02); ctx.lineTo(sx - s * 0.05, sy - s * 0.22); ctx.fill(); }
    else {
      ctx.fillStyle = '#111';
      ctx.fillRect(sx + L * 0.04, sy - s * 0.38, s * 0.05, s * 0.38);
      ctx.fillStyle = shade(v.paint, -0.2);
      ctx.beginPath(); ctx.moveTo(sx - s * 0.12, sy - s * 0.42); ctx.lineTo(sx + L * 0.16, sy - s * 0.46); ctx.lineTo(sx + L * 0.16, sy - s * 0.36); ctx.lineTo(sx - s * 0.12, sy - s * 0.34); ctx.fill();
    }
  }
  ctx.restore();

  // колёса
  for (const u of [sh.rearU, sh.frontU]) {
    const wx = ox + L * u, wy = oy - wheelR;
    ctx.fillStyle = '#050608';
    ctx.beginPath(); ctx.arc(wx, wy - s * 0.02, wheelR * (v.kit >= 2 ? 1.22 : 1.12), Math.PI, 0); ctx.fill();
    drawWheel(ctx, wx, wy, wheelR, o.wheelRot ?? 0, v.rims, v.rimColor);
  }

  // нитро
  if (o.nitro && o.nitro > 0) {
    const ex = ox - s * 0.05, ey = oy - bottom - s * 0.05;
    const len = s * (1.2 + Math.random() * 0.8) * o.nitro;
    const fg = ctx.createLinearGradient(ex, 0, ex - len, 0);
    fg.addColorStop(0, '#ffffff'); fg.addColorStop(0.25, '#7fd8ff'); fg.addColorStop(0.6, '#5a3cff'); fg.addColorStop(1, 'rgba(90,60,255,0)');
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.moveTo(ex, ey - s * 0.1); ctx.quadraticCurveTo(ex - len * 0.5, ey - s * 0.18, ex - len, ey); ctx.quadraticCurveTo(ex - len * 0.5, ey + s * 0.18, ex, ey + s * 0.1); ctx.fill();
  }
  ctx.restore();
}

export function drawWheel(ctx: CanvasRenderingContext2D, x: number, y: number, R: number, rot: number, style: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#16181c';
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2a2d33'; ctx.lineWidth = R * 0.08;
  ctx.beginPath(); ctx.arc(0, 0, R * 0.92, 0, Math.PI * 2); ctx.stroke();
  const rr = R * 0.66;
  const rg = ctx.createRadialGradient(-rr * 0.3, -rr * 0.3, 1, 0, 0, rr);
  rg.addColorStop(0, shade(color, 0.5)); rg.addColorStop(1, shade(color, -0.35));
  ctx.fillStyle = rg;
  ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(rot);
  ctx.fillStyle = '#0c0d10'; ctx.strokeStyle = '#0c0d10';
  const n = [5, 5, 12, 8, 10, 6][style] ?? 5;
  if (style === 0) {
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; ctx.beginPath(); ctx.arc(Math.cos(a) * rr * 0.55, Math.sin(a) * rr * 0.55, rr * 0.13, 0, Math.PI * 2); ctx.fill(); }
  } else if (style === 2) {
    ctx.lineWidth = rr * 0.06;
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(0, 0, rr * 0.6, 0, Math.PI * 2); ctx.stroke();
  } else if (style === 3) {
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(Math.cos(a + 0.6) * rr * 0.6, Math.sin(a + 0.6) * rr * 0.6, Math.cos(a) * rr * 0.95, Math.sin(a) * rr * 0.95); ctx.lineTo(Math.cos(a + 0.35) * rr * 0.95, Math.sin(a + 0.35) * rr * 0.95); ctx.fill(); }
  } else {
    // вырезы между спицами
    const w = style === 4 ? 0.12 : style === 5 ? 0.22 : 0.32;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / n;
      ctx.beginPath(); ctx.moveTo(Math.cos(a - w) * rr * 0.35, Math.sin(a - w) * rr * 0.35);
      ctx.lineTo(Math.cos(a - w * 1.4) * rr * 0.9, Math.sin(a - w * 1.4) * rr * 0.9);
      ctx.lineTo(Math.cos(a + w * 1.4) * rr * 0.9, Math.sin(a + w * 1.4) * rr * 0.9);
      ctx.lineTo(Math.cos(a + w) * rr * 0.35, Math.sin(a + w) * rr * 0.35); ctx.fill();
    }
  }
  ctx.fillStyle = shade(color, 0.2);
  ctx.beginPath(); ctx.arc(0, 0, rr * 0.18, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export const SHAPE_LIST = ['stripe', 'twin', 'circle', 'star', 'flame', 'bolt', 'chevron', 'checker', 'wave', 'tri'];
export const SHAPE_NAMES: Record<string, string> = { stripe: 'Полоса', twin: 'Двойная полоса', circle: 'Круг', star: 'Звезда', flame: 'Пламя', bolt: 'Молния', chevron: 'Шеврон', checker: 'Шашки', wave: 'Волна', tri: 'Треугольник' };
export const STICKER_LIST = ['roundel', 'crown', 'wings', 'eye', 'paw', 'drop', 'gear', 'heart'];
export const STICKER_NAMES: Record<string, string> = { roundel: 'Номер', crown: 'Корона', wings: 'Крылья', eye: 'Глаз', paw: 'Лапа', drop: 'Капля', gear: 'Шестерня', heart: 'Сердце' };

function star(ctx: CanvasRenderingContext2D, R: number, n = 5, k = 0.45) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2; const r = i % 2 ? R * k : R; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  ctx.closePath();
}

/** Слой винила в координатах кузова (x,y ∈ 0..1, y=0 — низ кузова). */
export function drawVinyl(ctx: CanvasRenderingContext2D, vn: Vinyl, ox: number, oy: number, L: number, H: number, selected = false) {
  ctx.save();
  ctx.translate(ox + vn.x * L, oy - vn.y * H);
  ctx.rotate(vn.r);
  const S = vn.s * H * 0.5;
  ctx.scale(vn.flip ? -1 : 1, 1);
  ctx.fillStyle = vn.color; ctx.strokeStyle = vn.color;
  if (vn.kind === 'text') {
    ctx.font = `italic 900 ${Math.max(6, S * 0.9)}px "Arial Black", Impact, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(1, S * 0.12); ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(vn.text ?? '', 0, 0);
    ctx.fillText(vn.text ?? '', 0, 0);
  } else if (vn.kind === 'shape') {
    switch (vn.shape) {
      case 'stripe': ctx.fillRect(-L, -S * 0.15, L * 2, S * 0.3); break;
      case 'twin': ctx.fillRect(-L, -S * 0.3, L * 2, S * 0.16); ctx.fillRect(-L, S * 0.14, L * 2, S * 0.16); break;
      case 'circle': ctx.beginPath(); ctx.arc(0, 0, S * 0.6, 0, Math.PI * 2); ctx.fill(); break;
      case 'star': star(ctx, S * 0.7); ctx.fill(); break;
      case 'flame':
        ctx.beginPath(); ctx.moveTo(-S * 2, S * 0.4);
        for (let i = 0; i < 5; i++) { const x = -S * 2 + i * S * 0.8; ctx.quadraticCurveTo(x + S * 0.2, -S * (0.9 - i * 0.12), x + S * 0.8, S * 0.05); }
        ctx.lineTo(S * 2.2, S * 0.4); ctx.closePath(); ctx.fill(); break;
      case 'bolt': ctx.beginPath(); ctx.moveTo(-S * 0.2, -S * 0.8); ctx.lineTo(S * 0.4, -S * 0.8); ctx.lineTo(0, -S * 0.1); ctx.lineTo(S * 0.45, -S * 0.1); ctx.lineTo(-S * 0.35, S * 0.9); ctx.lineTo(-S * 0.05, S * 0.1); ctx.lineTo(-S * 0.45, S * 0.1); ctx.closePath(); ctx.fill(); break;
      case 'chevron': for (let i = 0; i < 3; i++) { ctx.beginPath(); const x = i * S * 0.5; ctx.moveTo(x - S * 0.3, -S * 0.6); ctx.lineTo(x + S * 0.1, 0); ctx.lineTo(x - S * 0.3, S * 0.6); ctx.lineTo(x - S * 0.1, S * 0.6); ctx.lineTo(x + S * 0.3, 0); ctx.lineTo(x - S * 0.1, -S * 0.6); ctx.fill(); } break;
      case 'checker': { const c = S * 0.25; for (let i = -6; i < 6; i++) for (let j = -2; j < 2; j++) if ((i + j) % 2 === 0) ctx.fillRect(i * c, j * c, c, c); break; }
      case 'wave': ctx.lineWidth = S * 0.18; ctx.beginPath(); for (let i = -10; i <= 10; i++) { const x = i * S * 0.3; ctx.lineTo(x, Math.sin(i * 0.9) * S * 0.25); } ctx.stroke(); break;
      case 'tri': ctx.beginPath(); ctx.moveTo(-S, S * 0.6); ctx.lineTo(S, S * 0.6); ctx.lineTo(S, -S * 0.6); ctx.closePath(); ctx.fill(); break;
    }
  } else {
    switch (vn.sticker) {
      case 'roundel':
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, S * 0.55, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = vn.color; ctx.font = `900 ${S * 0.6}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(vn.text || '7', 0, S * 0.03); break;
      case 'crown': ctx.beginPath(); ctx.moveTo(-S * 0.5, S * 0.3); ctx.lineTo(-S * 0.55, -S * 0.3); ctx.lineTo(-S * 0.25, 0); ctx.lineTo(0, -S * 0.45); ctx.lineTo(S * 0.25, 0); ctx.lineTo(S * 0.55, -S * 0.3); ctx.lineTo(S * 0.5, S * 0.3); ctx.closePath(); ctx.fill(); break;
      case 'wings':
        for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, 0); for (let i = 0; i < 4; i++) ctx.quadraticCurveTo(d * S * (0.3 + i * 0.2), -S * (0.5 - i * 0.1), d * S * (0.2 + i * 0.22), S * 0.05 * i); ctx.closePath(); ctx.fill(); }
        ctx.beginPath(); ctx.arc(0, 0, S * 0.12, 0, Math.PI * 2); ctx.fill(); break;
      case 'eye': ctx.beginPath(); ctx.moveTo(-S * 0.6, 0); ctx.quadraticCurveTo(0, -S * 0.5, S * 0.6, 0); ctx.quadraticCurveTo(0, S * 0.5, -S * 0.6, 0); ctx.fill();
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(0, 0, S * 0.18, 0, Math.PI * 2); ctx.fill(); break;
      case 'paw': ctx.beginPath(); ctx.ellipse(0, S * 0.15, S * 0.25, S * 0.2, 0, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(-S * 0.3 + i * S * 0.2, -S * 0.2 - (i % 3 ? S * 0.08 : 0), S * 0.09, 0, Math.PI * 2); ctx.fill(); } break;
      case 'drop': ctx.beginPath(); ctx.moveTo(0, -S * 0.6); ctx.quadraticCurveTo(S * 0.5, 0, 0, S * 0.4); ctx.quadraticCurveTo(-S * 0.5, 0, 0, -S * 0.6); ctx.fill(); break;
      case 'gear': star(ctx, S * 0.55, 8, 0.78); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(0, 0, S * 0.18, 0, Math.PI * 2); ctx.fill(); break;
      case 'heart': ctx.beginPath(); ctx.moveTo(0, S * 0.45); ctx.bezierCurveTo(-S * 0.8, -S * 0.1, -S * 0.3, -S * 0.6, 0, -S * 0.2); ctx.bezierCurveTo(S * 0.3, -S * 0.6, S * 0.8, -S * 0.1, 0, S * 0.45); ctx.fill(); break;
    }
  }
  if (selected) {
    ctx.setLineDash([4, 3]); ctx.strokeStyle = '#00ffea'; ctx.lineWidth = 1.5;
    ctx.strokeRect(-S * 0.8, -S * 0.7, S * 1.6, S * 1.4); ctx.setLineDash([]);
  }
  ctx.restore();
}
