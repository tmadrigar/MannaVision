// src/utils/brushEngine.ts
//
// Motor de pincéis do MannaVision Paint:
//  - Suavização das pontas dos dedos (EMA) + curvas quadráticas por ponto médio
//    (traço fluido, sem serrilhado entre frames do MediaPipe)
//  - Espessura dinâmica pela velocidade da mão (pressão simulada)
//  - 8 estilos de pincel (sólido, neon, tracejado, spray, psicodélico, fita,
//    fagulhas e caligrafia)
//  - Simetria: espelho e caleidoscópio radial (4/6/8/12 eixos)
//  - Sistema de partículas para efeitos vivos (renderizado num canvas de FX)

export interface Point {
  x: number;
  y: number;
}

export type BrushStyle =
  | 'solid'
  | 'neon'
  | 'dashed'
  | 'spray'
  | 'rainbow'
  | 'ribbon'
  | 'sparkle'
  | 'calligraphy';

export type SymmetryMode = 'none' | 'mirror' | 'radial4' | 'radial6' | 'radial8' | 'radial12';

export interface BrushSettings {
  style: BrushStyle;
  color: string; // hex (#RRGGBB)
  size: number; // espessura base em px (na escala do canvas)
  eraser: boolean;
  symmetry: SymmetryMode;
}

export interface StrokeState {
  active: boolean;
  smoothed: Point | null; // posição suavizada (EMA)
  prev: Point | null; // último ponto comprometido
  prevMid: Point | null; // ponto médio anterior (curva quadrática)
  lastTime: number;
  speed: number; // px/ms suavizado
  hue: number; // matiz atual (psicodélico)
  travelled: number; // distância acumulada no traço
}

export const BRUSH_STYLES: { id: BrushStyle; label: string; hint: string }[] = [
  { id: 'solid', label: 'Sólido', hint: 'Traço limpo e suave' },
  { id: 'neon', label: 'Neon', hint: 'Núcleo branco com halo luminoso da cor escolhida' },
  { id: 'ribbon', label: 'Fita', hint: 'Espessura varia com a velocidade da mão' },
  { id: 'calligraphy', label: 'Caligrafia', hint: 'Pena chanfrada: fino num sentido, grosso no outro' },
  { id: 'rainbow', label: 'Psicodélico', hint: 'Cor muda ao longo do traço' },
  { id: 'sparkle', label: 'Fagulhas', hint: 'Rastro de estrelas que se dispersam' },
  { id: 'spray', label: 'Spray', hint: 'Tinta pulverizada' },
  { id: 'dashed', label: 'Tracejado', hint: 'Linha pontilhada' },
];

export const SYMMETRY_MODES: { id: SymmetryMode; label: string; hint: string }[] = [
  { id: 'none', label: 'Livre', hint: 'Sem simetria' },
  { id: 'mirror', label: 'Espelho', hint: 'Reflexo horizontal' },
  { id: 'radial4', label: '4', hint: 'Caleidoscópio de 4 eixos' },
  { id: 'radial6', label: '6', hint: 'Caleidoscópio de 6 eixos' },
  { id: 'radial8', label: '8', hint: 'Caleidoscópio de 8 eixos' },
  { id: 'radial12', label: '12', hint: 'Caleidoscópio de 12 eixos' },
];

// Suavização da posição (0.1 = muito suave/atrasado, 1.0 = cru)
const SMOOTHING_ALPHA = 0.5;
// Suavização da velocidade
const SPEED_ALPHA = 0.25;

export function createStrokeState(): StrokeState {
  return {
    active: false,
    smoothed: null,
    prev: null,
    prevMid: null,
    lastTime: 0,
    speed: 0,
    hue: Math.random() * 360,
    travelled: 0,
  };
}

export function resetStroke(state: StrokeState) {
  state.active = false;
  state.smoothed = null;
  state.prev = null;
  state.prevMid = null;
  state.speed = 0;
  state.travelled = 0;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return { r: 255, g: 255, b: 255 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ---------------------------------------------------------------------------
// Simetria
// ---------------------------------------------------------------------------

function symmetryCopies(mode: SymmetryMode): number {
  switch (mode) {
    case 'radial4': return 4;
    case 'radial6': return 6;
    case 'radial8': return 8;
    case 'radial12': return 12;
    default: return 1;
  }
}

/**
 * Executa `draw` uma vez para cada cópia simétrica. No modo radial cada eixo
 * recebe também a cópia espelhada (efeito caleidoscópio).
 */
export function withSymmetry(
  ctx: CanvasRenderingContext2D,
  mode: SymmetryMode,
  w: number,
  h: number,
  draw: () => void
) {
  if (mode === 'none') {
    draw();
    return;
  }

  if (mode === 'mirror') {
    draw();
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    draw();
    ctx.restore();
    return;
  }

  const copies = symmetryCopies(mode);
  const cx = w / 2;
  const cy = h / 2;
  for (let k = 0; k < copies; k++) {
    const angle = (Math.PI * 2 * k) / copies;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.scale(-1, 1);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Sistema de partículas (efeitos vivos no canvas de FX)
// ---------------------------------------------------------------------------

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export class ParticleSystem {
  private particles: Particle[] = [];
  private readonly maxParticles = 700;

  get count(): number {
    return this.particles.length;
  }

  spawn(x: number, y: number, color: string, count: number, speedScale = 1) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) {
        this.particles.shift();
      }
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.04 + Math.random() * 0.28) * speedScale; // px/ms
      const maxLife = 350 + Math.random() * 650;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.05,
        life: maxLife,
        maxLife,
        size: 1 + Math.random() * 2.2,
        color,
      });
    }
  }

  update(dt: number) {
    const gravity = 0.00035;
    const drag = Math.pow(0.985, dt / 16.67);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += gravity * dt;
      p.vx *= drag;
      p.vy *= drag;
    }
  }

  render(ctx: CanvasRenderingContext2D, symmetry: SymmetryMode, w: number, h: number) {
    if (this.particles.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    withSymmetry(ctx, symmetry, w, h, () => {
      for (const p of this.particles) {
        const t = p.life / p.maxLife;
        ctx.globalAlpha = t;
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.4, p.size * t), 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.restore();
  }

  clear() {
    this.particles = [];
  }
}

// ---------------------------------------------------------------------------
// Traço
// ---------------------------------------------------------------------------

interface Segment {
  from: Point; // prevMid
  ctrl: Point; // prev
  to: Point; // mid
}

/** Ponto sobre a curva quadrática em t (0..1) */
function quadPoint(s: Segment, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt * mt * s.from.x + 2 * mt * t * s.ctrl.x + t * t * s.to.x,
    y: mt * mt * s.from.y + 2 * mt * t * s.ctrl.y + t * t * s.to.y,
  };
}

function tracePath(ctx: CanvasRenderingContext2D, s: Segment) {
  ctx.beginPath();
  ctx.moveTo(s.from.x, s.from.y);
  ctx.quadraticCurveTo(s.ctrl.x, s.ctrl.y, s.to.x, s.to.y);
}

/** Largura efetiva conforme o estilo e a velocidade (px/ms) */
function effectiveWidth(settings: BrushSettings, speed: number): number {
  const base = Math.max(1.5, settings.size);
  if (settings.eraser) return base * 2.5;
  switch (settings.style) {
    case 'ribbon':
      // devagar = grosso, rápido = fino (como uma caneta de tinta)
      return base * clamp(1.7 - speed * 1.1, 0.3, 1.7);
    case 'calligraphy':
      return base * 1.4;
    case 'sparkle':
      return base * 0.6;
    default:
      return base;
  }
}

/**
 * Alimenta o traço com uma nova posição bruta da ponta do dedo.
 * Desenha o segmento correspondente em `ctx` (canvas persistente) e, se
 * necessário, emite partículas em `particles` (canvas de FX).
 */
export function strokeTo(
  ctx: CanvasRenderingContext2D,
  particles: ParticleSystem | null,
  state: StrokeState,
  raw: Point,
  now: number,
  settings: BrushSettings,
  canvasW: number,
  canvasH: number
) {
  // Primeiro ponto do traço
  if (!state.active || !state.smoothed || !state.prev) {
    state.active = true;
    state.smoothed = { ...raw };
    state.prev = { ...raw };
    state.prevMid = { ...raw };
    state.lastTime = now;
    state.speed = 0;
    state.travelled = 0;
    // Um toque sem movimento ainda deixa um ponto
    stampDot(ctx, raw, effectiveWidth(settings, 0), settings, canvasW, canvasH);
    return;
  }

  // Suavização exponencial da posição
  const sm = state.smoothed;
  sm.x += SMOOTHING_ALPHA * (raw.x - sm.x);
  sm.y += SMOOTHING_ALPHA * (raw.y - sm.y);

  const cur: Point = { x: sm.x, y: sm.y };
  const prev = state.prev;
  const d = dist(prev, cur);
  if (d < 0.35) return; // ignora tremor mínimo

  const dt = Math.max(1, now - state.lastTime);
  const instSpeed = d / dt;
  state.speed += SPEED_ALPHA * (instSpeed - state.speed);
  state.lastTime = now;
  state.travelled += d;

  const mid: Point = { x: (prev.x + cur.x) / 2, y: (prev.y + cur.y) / 2 };
  const seg: Segment = { from: state.prevMid || prev, ctrl: prev, to: mid };
  const width = effectiveWidth(settings, state.speed);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (settings.eraser) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth = width;
    withSymmetry(ctx, settings.symmetry, canvasW, canvasH, () => {
      tracePath(ctx, seg);
      ctx.stroke();
    });
  } else {
    ctx.globalCompositeOperation = 'source-over';
    switch (settings.style) {
      case 'solid':
        drawSolid(ctx, seg, width, settings, canvasW, canvasH);
        break;
      case 'neon':
        drawNeon(ctx, seg, width, settings.color, settings, canvasW, canvasH);
        break;
      case 'dashed':
        drawDashed(ctx, seg, width, settings, canvasW, canvasH, state.travelled);
        break;
      case 'rainbow':
        drawRainbow(ctx, seg, width, settings, canvasW, canvasH, state, d);
        break;
      case 'ribbon':
        drawSolid(ctx, seg, width, settings, canvasW, canvasH);
        break;
      case 'calligraphy':
        drawCalligraphy(ctx, prev, cur, width, settings, canvasW, canvasH);
        break;
      case 'spray':
        drawSpray(ctx, seg, width, settings, canvasW, canvasH, d);
        break;
      case 'sparkle':
        drawSparkle(ctx, particles, seg, width, settings, canvasW, canvasH, d, state);
        break;
    }
  }

  ctx.restore();

  state.prev = cur;
  state.prevMid = mid;
}

function stampDot(
  ctx: CanvasRenderingContext2D,
  p: Point,
  width: number,
  settings: BrushSettings,
  w: number,
  h: number
) {
  ctx.save();
  if (settings.eraser) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,1)';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = settings.style === 'neon' ? '#ffffff' : settings.color;
    if (settings.style === 'neon' || settings.style === 'sparkle') {
      ctx.shadowBlur = width * 2;
      ctx.shadowColor = settings.color;
    }
  }
  withSymmetry(ctx, settings.symmetry, w, h, () => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, width / 2, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawSolid(
  ctx: CanvasRenderingContext2D,
  seg: Segment,
  width: number,
  settings: BrushSettings,
  w: number,
  h: number
) {
  ctx.strokeStyle = settings.color;
  ctx.lineWidth = width;
  withSymmetry(ctx, settings.symmetry, w, h, () => {
    tracePath(ctx, seg);
    ctx.stroke();
  });
}

function drawNeon(
  ctx: CanvasRenderingContext2D,
  seg: Segment,
  width: number,
  color: string,
  settings: BrushSettings,
  w: number,
  h: number
) {
  withSymmetry(ctx, settings.symmetry, w, h, () => {
    // 1) halo largo e difuso
    ctx.globalAlpha = 0.28;
    ctx.shadowBlur = width * 4;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = width * 3;
    tracePath(ctx, seg);
    ctx.stroke();

    // 2) corpo colorido
    ctx.globalAlpha = 0.85;
    ctx.shadowBlur = width * 1.5;
    ctx.lineWidth = width * 1.3;
    tracePath(ctx, seg);
    ctx.stroke();

    // 3) núcleo branco
    ctx.globalAlpha = 0.95;
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, width * 0.45);
    tracePath(ctx, seg);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function drawDashed(
  ctx: CanvasRenderingContext2D,
  seg: Segment,
  width: number,
  settings: BrushSettings,
  w: number,
  h: number,
  travelled: number
) {
  ctx.strokeStyle = settings.color;
  ctx.lineWidth = width;
  const dash = Math.max(4, width * 2);
  ctx.setLineDash([dash, dash]);
  // Mantém a fase do tracejado contínua entre segmentos
  ctx.lineDashOffset = -travelled;
  withSymmetry(ctx, settings.symmetry, w, h, () => {
    tracePath(ctx, seg);
    ctx.stroke();
  });
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}

function drawRainbow(
  ctx: CanvasRenderingContext2D,
  seg: Segment,
  width: number,
  settings: BrushSettings,
  w: number,
  h: number,
  state: StrokeState,
  d: number
) {
  // O matiz avança com a distância percorrida (não com o tempo), ficando uniforme
  const hueFrom = state.hue;
  state.hue = (state.hue + d * 0.9) % 360;
  const grad = ctx.createLinearGradient(seg.from.x, seg.from.y, seg.to.x, seg.to.y);
  grad.addColorStop(0, `hsl(${hueFrom}, 100%, 55%)`);
  grad.addColorStop(1, `hsl(${state.hue}, 100%, 55%)`);
  ctx.strokeStyle = grad;
  ctx.lineWidth = width;
  ctx.shadowBlur = width;
  ctx.shadowColor = `hsl(${state.hue}, 100%, 60%)`;
  withSymmetry(ctx, settings.symmetry, w, h, () => {
    tracePath(ctx, seg);
    ctx.stroke();
  });
  ctx.shadowBlur = 0;
}

function drawCalligraphy(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  width: number,
  settings: BrushSettings,
  w: number,
  h: number
) {
  // Pena chanfrada a 45°: o traço fica largo quando cruza o chanfro e fino quando o acompanha
  const nibAngle = -Math.PI / 4;
  const nx = (Math.cos(nibAngle) * width) / 2;
  const ny = (Math.sin(nibAngle) * width) / 2;
  ctx.fillStyle = settings.color;
  ctx.strokeStyle = settings.color;
  ctx.lineWidth = 1;
  withSymmetry(ctx, settings.symmetry, w, h, () => {
    ctx.beginPath();
    ctx.moveTo(from.x - nx, from.y - ny);
    ctx.lineTo(from.x + nx, from.y + ny);
    ctx.lineTo(to.x + nx, to.y + ny);
    ctx.lineTo(to.x - nx, to.y - ny);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
}

function drawSpray(
  ctx: CanvasRenderingContext2D,
  seg: Segment,
  width: number,
  settings: BrushSettings,
  w: number,
  h: number,
  d: number
) {
  const radius = width * 1.8;
  const steps = Math.max(1, Math.ceil(d / 2));
  const perStep = Math.max(2, Math.round(width * 1.2));
  ctx.fillStyle = settings.color;
  withSymmetry(ctx, settings.symmetry, w, h, () => {
    for (let i = 0; i <= steps; i++) {
      const p = quadPoint(seg, i / steps);
      for (let k = 0; k < perStep; k++) {
        const a = Math.random() * Math.PI * 2;
        // distribuição mais densa no centro
        const r = radius * Math.sqrt(Math.random());
        ctx.globalAlpha = 0.25 + Math.random() * 0.55;
        ctx.fillRect(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 1.4, 1.4);
      }
    }
  });
  ctx.globalAlpha = 1;
}

function drawSparkle(
  ctx: CanvasRenderingContext2D,
  particles: ParticleSystem | null,
  seg: Segment,
  width: number,
  settings: BrushSettings,
  w: number,
  h: number,
  d: number,
  state: StrokeState
) {
  // Núcleo fino e luminoso
  drawNeon(ctx, seg, width, settings.color, settings, w, h);

  // Poeira estelar persistente ao longo do caminho
  const steps = Math.max(1, Math.ceil(d / 3));
  ctx.fillStyle = '#ffffff';
  ctx.shadowBlur = 4;
  ctx.shadowColor = settings.color;
  withSymmetry(ctx, settings.symmetry, w, h, () => {
    for (let i = 0; i <= steps; i++) {
      if (Math.random() > 0.5) continue;
      const p = quadPoint(seg, i / steps);
      const spread = width * 5;
      const x = p.x + (Math.random() - 0.5) * spread;
      const y = p.y + (Math.random() - 0.5) * spread;
      ctx.globalAlpha = 0.3 + Math.random() * 0.6;
      const r = 0.5 + Math.random() * 1.3;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  // Fagulhas vivas (mais fagulhas quanto mais rápido a mão se move)
  if (particles) {
    const count = clamp(Math.round(d * 0.6 + state.speed * 4), 1, 14);
    const tip = seg.to;
    particles.spawn(tip.x, tip.y, settings.color, count, 0.8 + state.speed);
  }
}
