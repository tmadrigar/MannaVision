// src/utils/harp/harpStrings.ts
//
// Cordas de luz: geometria, detecção de toque, vibração visual e faíscas.
//
// Espaço "mundo": X = u · aspecto, Y = v, onde (u, v) são as coordenadas normalizadas
// da câmera já espelhadas como o usuário vê. Assim 1.0 = altura da imagem e as
// distâncias são iguais na horizontal e na vertical.

export interface Vec2 { x: number; y: number }

export interface HarpString {
  id: number;
  a: Vec2;
  b: Vec2;
  length: number;
  midi: number;
  hue: number;
  createdAt: number;   // ms
  // vibração
  pluckAt: number;     // ms do último toque (0 = nunca)
  pluckPos: number;    // 0..1
  amp: number;         // amplitude inicial do último toque (unidades de mundo)
  lastPluckMs: number; // para o intervalo mínimo entre toques
  removingAt?: number; // ms em que começou a se dissolver
}

export interface Spark {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  hue: number;
  size: number;
}

export interface ViewTransform {
  k: number;     // pixels por unidade de mundo
  offX: number;
  offY: number;
}

export const VIB_DECAY_S = 1.4;   // constante de tempo da vibração visual
export const DISSOLVE_MS = 450;

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Distância assinada do ponto à reta AB e parâmetro t da projeção (0 = A, 1 = B). */
export function sideAndParam(p: Vec2, a: Vec2, b: Vec2): { d: number; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = Math.max(1e-9, dx * dx + dy * dy);
  const len = Math.sqrt(len2);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  const d = (dx * (p.y - a.y) - dy * (p.x - a.x)) / len;
  return { d, t };
}

export function pointSegmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const { t } = sideAndParam(p, a, b);
  const tc = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + (b.x - a.x) * tc), p.y - (a.y + (b.y - a.y) * tc));
}

/** Energia visual atual da corda (1 = acabou de ser tocada, 0 = em repouso). */
export function stringEnergy(s: HarpString, now: number): number {
  if (!s.pluckAt) return 0;
  return Math.exp(-(now - s.pluckAt) / 1000 / VIB_DECAY_S);
}

/** Dispara a vibração visual da corda. */
export function exciteString(s: HarpString, now: number, velocity: number, position: number) {
  // Se a corda ainda vibra, soma um pouco da energia restante
  const rest = stringEnergy(s, now) * s.amp;
  s.amp = Math.min(s.length * 0.12, rest * 0.4 + (0.012 + 0.03 * velocity) * Math.min(1, s.length * 2.2));
  s.pluckAt = now;
  s.pluckPos = Math.max(0.05, Math.min(0.95, position));
  s.lastPluckMs = now;
}

/** Faíscas que correm ao longo da corda a partir do ponto tocado. */
export function spawnSparks(out: Spark[], s: HarpString, position: number, velocity: number, count = 18) {
  const px = s.a.x + (s.b.x - s.a.x) * position;
  const py = s.a.y + (s.b.y - s.a.y) * position;
  const ux = (s.b.x - s.a.x) / Math.max(1e-6, s.length);
  const uy = (s.b.y - s.a.y) / Math.max(1e-6, s.length);
  const n = Math.round(count * (0.5 + velocity));
  for (let i = 0; i < n; i++) {
    const dir = Math.random() < 0.5 ? -1 : 1;
    const along = (0.25 + Math.random() * 0.9) * (0.6 + velocity);
    const perp = (Math.random() * 2 - 1) * 0.18;
    const maxLife = 0.35 + Math.random() * 0.55;
    out.push({
      x: px,
      y: py,
      vx: ux * along * dir - uy * perp,
      vy: uy * along * dir + ux * perp,
      life: maxLife,
      maxLife,
      hue: s.hue + (Math.random() * 40 - 20),
      size: 0.8 + Math.random() * 1.6,
    });
  }
  if (out.length > 900) out.splice(0, out.length - 900);
}

/** Faíscas ao longo de toda a corda (ao apagar). */
export function spawnDissolve(out: Spark[], s: HarpString) {
  const n = Math.round(20 + s.length * 60);
  for (let i = 0; i < n; i++) {
    const t = Math.random();
    const maxLife = 0.4 + Math.random() * 0.6;
    out.push({
      x: s.a.x + (s.b.x - s.a.x) * t,
      y: s.a.y + (s.b.y - s.a.y) * t,
      vx: (Math.random() * 2 - 1) * 0.15,
      vy: -0.05 - Math.random() * 0.25,
      life: maxLife,
      maxLife,
      hue: s.hue,
      size: 0.8 + Math.random() * 1.4,
    });
  }
}

export function updateSparks(sparks: Spark[], dt: number) {
  const drag = Math.exp(-2.6 * dt);
  let w = 0;
  for (let i = 0; i < sparks.length; i++) {
    const p = sparks[i];
    p.life -= dt;
    if (p.life <= 0) continue;
    p.vx *= drag;
    p.vy = p.vy * drag + 0.12 * dt; // gravidade leve
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    sparks[w++] = p;
  }
  sparks.length = w;
}

// --- RENDERIZAÇÃO --------------------------------------------------------------

const SEGMENTS = 56;
const TICK_SPACING = 0.028; // unidades de mundo

/** Deslocamento perpendicular (mundo) num ponto s∈[0,1] da corda no instante `now`. */
function displacement(str: HarpString, sPos: number, now: number): number {
  if (!str.pluckAt) return 0;
  const tSec = (now - str.pluckAt) / 1000;
  const env = Math.exp(-tSec / VIB_DECAY_S);
  if (env < 0.01) return 0;
  // Visual: frequência fundamental "lenta" (6–18 Hz) para o olho acompanhar
  const visF = 6 + (str.midi - 40) * 0.25;
  let y = 0;
  // Modos de uma corda tocada na posição p: amplitude ∝ sin(nπp)/n²
  for (let n = 1; n <= 4; n++) {
    const an = Math.sin(n * Math.PI * str.pluckPos) / (n * n);
    // os modos altos morrem antes
    const en = Math.exp(-tSec * (n - 1) * 1.8);
    y += an * en * Math.sin(n * Math.PI * sPos) * Math.cos(2 * Math.PI * visF * n * tSec);
  }
  return y * str.amp * env * 1.4;
}

function toPx(v: Vec2, view: ViewTransform): Vec2 {
  return { x: v.x * view.k + view.offX, y: v.y * view.k + view.offY };
}

export function drawString(ctx: CanvasRenderingContext2D, str: HarpString, view: ViewTransform, now: number, dpr: number) {
  const energy = stringEnergy(str, now);
  let alpha = 1;
  if (str.removingAt) alpha = Math.max(0, 1 - (now - str.removingAt) / DISSOLVE_MS);
  const born = Math.min(1, (now - str.createdAt) / 220);
  alpha *= born;
  if (alpha <= 0) return;

  const A = toPx(str.a, view);
  const B = toPx(str.b, view);
  const lenPx = Math.hypot(B.x - A.x, B.y - A.y);
  if (lenPx < 2) return;
  const ux = (B.x - A.x) / lenPx;
  const uy = (B.y - A.y) / lenPx;
  const nx = -uy;
  const ny = ux;

  // Pontos da corda (com vibração)
  const pts: Vec2[] = [];
  const vibrating = energy > 0.01;
  const segs = vibrating ? SEGMENTS : 1;
  for (let i = 0; i <= segs; i++) {
    const s = i / segs;
    const off = vibrating ? displacement(str, s, now) * view.k : 0;
    pts.push({ x: A.x + (B.x - A.x) * s + nx * off, y: A.y + (B.y - A.y) * s + ny * off });
  }

  const tracePath = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  };

  const hue = str.hue;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Brilho externo (aumenta com a energia)
  tracePath();
  ctx.strokeStyle = `hsla(${hue}, 100%, 60%, ${(0.10 + 0.35 * energy) * alpha})`;
  ctx.lineWidth = (6 + 14 * energy) * dpr;
  ctx.stroke();

  tracePath();
  ctx.strokeStyle = `hsla(${hue}, 100%, 70%, ${(0.25 + 0.5 * energy) * alpha})`;
  ctx.lineWidth = (2.5 + 4 * energy) * dpr;
  ctx.stroke();

  // Núcleo: branco em repouso, colorido quando vibra
  tracePath();
  const light = 92 - 22 * energy;
  ctx.strokeStyle = `hsla(${hue}, ${Math.round(30 + 70 * energy)}%, ${light}%, ${0.95 * alpha})`;
  ctx.lineWidth = 1.3 * dpr;
  ctx.stroke();
  ctx.restore();

  // Marcas de régua ao longo da corda
  ctx.save();
  ctx.strokeStyle = `rgba(255,255,255,${0.45 * alpha})`;
  ctx.lineWidth = 1 * dpr;
  const spacingPx = TICK_SPACING * view.k;
  const nTicks = Math.floor(lenPx / spacingPx);
  ctx.beginPath();
  for (let i = 1; i < nTicks; i++) {
    const d = i * spacingPx;
    const big = i % 5 === 0;
    const h = (big ? 6 : 3.5) * dpr;
    const px = A.x + ux * d;
    const py = A.y + uy * d;
    ctx.moveTo(px - nx * h, py - ny * h);
    ctx.lineTo(px, py);
  }
  ctx.stroke();

  // Pontas: anel com miolo
  for (const P of [A, B]) {
    ctx.beginPath();
    ctx.arc(P.x, P.y, 5 * dpr, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.9 * alpha})`;
    ctx.lineWidth = 1.4 * dpr;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(P.x, P.y, 1.8 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${hue}, 100%, 75%, ${alpha})`;
    ctx.fill();
  }
  ctx.restore();
}

/** Corda em construção: tracejada, com régua e o nome da nota. */
export function drawDraft(
  ctx: CanvasRenderingContext2D,
  a: Vec2,
  b: Vec2,
  hue: number,
  label: string,
  view: ViewTransform,
  dpr: number,
  now: number,
) {
  const A = toPx(a, view);
  const B = toPx(b, view);
  const lenPx = Math.hypot(B.x - A.x, B.y - A.y);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(A.x, A.y);
  ctx.lineTo(B.x, B.y);
  ctx.strokeStyle = `hsla(${hue}, 100%, 65%, 0.35)`;
  ctx.lineWidth = 8 * dpr;
  ctx.stroke();
  ctx.setLineDash([7 * dpr, 6 * dpr]);
  ctx.lineDashOffset = -now / 25;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 1.6 * dpr;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  for (const P of [A, B]) {
    ctx.beginPath();
    ctx.arc(P.x, P.y, (7 + Math.sin(now / 120) * 1.5) * dpr, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${hue}, 100%, 75%, 0.95)`;
    ctx.lineWidth = 2 * dpr;
    ctx.stroke();
  }

  if (lenPx > 30 * dpr) {
    const mx = (A.x + B.x) / 2;
    const my = (A.y + B.y) / 2;
    ctx.save();
    ctx.font = `600 ${14 * dpr}px "Inter", system-ui, sans-serif`;
    const w = ctx.measureText(label).width;
    const padX = 8 * dpr;
    const h = 22 * dpr;
    const bx = mx - w / 2 - padX;
    const by = my - h - 12 * dpr;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeStyle = `hsla(${hue}, 100%, 65%, 0.8)`;
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.roundRect(bx, by, w + padX * 2, h, 8 * dpr);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, mx, by + h / 2 + 1);
    ctx.restore();
  }
}

export function drawSparks(ctx: CanvasRenderingContext2D, sparks: Spark[], view: ViewTransform, dpr: number) {
  if (!sparks.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of sparks) {
    const k = p.life / p.maxLife;
    const x = p.x * view.k + view.offX;
    const y = p.y * view.k + view.offY;
    ctx.fillStyle = `hsla(${p.hue}, 100%, ${70 + 25 * k}%, ${k})`;
    const r = p.size * dpr * (0.6 + 0.6 * k);
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
}
