// src/utils/vectorExperiences/jarvisHudExperience.ts
import { createTimeline } from 'animejs';
import { AnimeExperienceInstance } from './types';

/**
 * Experiência: Interface Holográfica Sci-Fi (JARVIS / Cyberpunk Tactical HUD)
 * Anéis concêntricos de telemetria, formas de onda circulares, mira tática e cubos de dados
 * se projetam tridimensionalmente em direção ao usuário com a abertura dos dedos.
 */
export function createJarvisHudExperience(container: HTMLElement): AnimeExperienceInstance {
  container.innerHTML = '';

  const width = 1000;
  const height = 1000;
  const cx = width / 2;
  const cy = height / 2;

  // Gerar barras radiais de equalizador / waveform (36 barras circulares)
  const waveBarsCount = 36;
  const waveSvg = Array.from({ length: waveBarsCount }, (_, i) => {
    const angle = (i * 360) / waveBarsCount;
    return `
      <g transform="rotate(${angle} ${cx} ${cy})">
        <line
          class="hud-wave-bar"
          x1="${cx}"
          y1="${cy - 210}"
          x2="${cx}"
          y2="${cy - 245}"
          stroke="#06b6d4"
          stroke-width="3"
          stroke-linecap="round"
          opacity="0.8"
        />
      </g>
    `;
  }).join('');

  // Gerar segmentos do anel externo (12 arcos)
  const segmentsCount = 12;
  const outerRingSegments = Array.from({ length: segmentsCount }, (_, i) => {
    const angle = (i * 360) / segmentsCount;
    return `
      <g transform="rotate(${angle} ${cx} ${cy})">
        <circle
          cx="${cx}"
          cy="${cy - 430}"
          r="4"
          fill="#38bdf8"
        />
        <line
          x1="${cx - 15}"
          y1="${cy - 440}"
          x2="${cx + 15}"
          y2="${cy - 440}"
          stroke="#0284c7"
          stroke-width="2"
        />
      </g>
    `;
  }).join('');

  const markup = `
    <div class="relative w-full h-full flex items-center justify-center select-none overflow-hidden bg-radial from-[#02182b] via-[#010912] to-black" style="perspective: 1300px; perspective-origin: 50% 50%;">
      
      <!-- PALCO HOLOGRÁFICO 3D -->
      <div
        id="jarvis-holo-stage"
        class="relative flex items-center justify-center w-[85vmin] h-[85vmin] pointer-events-none"
        style="transform-style: preserve-3d; will-change: transform; transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg);"
      >
        <svg class="absolute w-0 h-0 pointer-events-none">
          <defs>
            <filter id="hudLaserGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <linearGradient id="hudCyanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#38bdf8" />
              <stop offset="50%" stop-color="#06b6d4" />
              <stop offset="100%" stop-color="#0891b2" />
            </linearGradient>
          </defs>
        </svg>

        <!-- CAMADA 0 (Z: -60px): Radar & Grade Hexagonal Cyberpunk -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(-60px); transform-style: preserve-3d;">
          <g opacity="0.35">
            <!-- Círculos concêntricos de radar -->
            <circle cx="${cx}" cy="${cy}" r="450" fill="none" stroke="#0369a1" stroke-width="1.5" stroke-dasharray="12 6" />
            <circle cx="${cx}" cy="${cy}" r="340" fill="none" stroke="#0284c7" stroke-width="1" />
            <circle cx="${cx}" cy="${cy}" r="220" fill="none" stroke="#0369a1" stroke-width="1" stroke-dasharray="4 8" />
            <circle cx="${cx}" cy="${cy}" r="110" fill="none" stroke="#0284c7" stroke-width="1" />
            <!-- Eixos ortogonais em cruz -->
            <line x1="40" y1="${cy}" x2="960" y2="${cy}" stroke="#0369a1" stroke-width="1" stroke-dasharray="8 8" />
            <line x1="${cx}" y1="40" x2="${cx}" y2="960" stroke="#0369a1" stroke-width="1" stroke-dasharray="8 8" />
            <!-- Varredura de radar ciano -->
            <path id="hud-radar-sweep" d="M ${cx} ${cy} L ${cx} 60 A 440 440 0 0 1 ${cx + 311} ${cy - 311} Z" fill="#06b6d4" opacity="0.1" style="transform-origin: ${cx}px ${cy}px;" />
          </g>
        </svg>

        <!-- CAMADA 1 (Z: -10px): Anel Tático de Azimute & Escala em Graus -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(-10px); transform-style: preserve-3d;">
          <g id="hud-azimuth-ring" style="transform-origin: ${cx}px ${cy}px;">
            <circle cx="${cx}" cy="${cy}" r="430" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-dasharray="40 10 10 10" />
            ${outerRingSegments}
            <text x="${cx}" y="95" fill="#38bdf8" font-size="13" font-family="monospace" font-weight="bold" text-anchor="middle">NORTE 000°</text>
            <text x="${cx + 430}" y="${cy + 5}" fill="#38bdf8" font-size="13" font-family="monospace" font-weight="bold" text-anchor="middle">LESTE 090°</text>
            <text x="${cx}" y="930" fill="#38bdf8" font-size="13" font-family="monospace" font-weight="bold" text-anchor="middle">SUL 180°</text>
            <text x="${cx - 430}" y="${cy + 5}" fill="#38bdf8" font-size="13" font-family="monospace" font-weight="bold" text-anchor="middle">OESTE 270°</text>
          </g>
        </svg>

        <!-- CAMADA 2 (Z: +50px): Forma de Onda Circular / Equalizador de Energia -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(50px); transform-style: preserve-3d;">
          <g id="hud-waveform-group" style="transform-origin: ${cx}px ${cy}px;">
            ${waveSvg}
            <circle cx="${cx}" cy="${cy}" r="210" fill="none" stroke="#06b6d4" stroke-width="2" />
            <circle cx="${cx}" cy="${cy}" r="260" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="6 12" />
          </g>
        </svg>

        <!-- CAMADA 3 (Z: +110px): Suportes de Mira Tática em Contrarrotação -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(110px); transform-style: preserve-3d;">
          <g id="hud-reticle-outer" style="transform-origin: ${cx}px ${cy}px;">
            <!-- Suportes angulares de mira (4 cantoneiras) -->
            <path d="M ${cx - 160} ${cy - 120} L ${cx - 160} ${cy - 160} L ${cx - 120} ${cy - 160}" fill="none" stroke="#22d3ee" stroke-width="3.5" />
            <path d="M ${cx + 160} ${cy - 120} L ${cx + 160} ${cy - 160} L ${cx + 120} ${cy - 160}" fill="none" stroke="#22d3ee" stroke-width="3.5" />
            <path d="M ${cx - 160} ${cy + 120} L ${cx - 160} ${cy + 160} L ${cx - 120} ${cy + 160}" fill="none" stroke="#22d3ee" stroke-width="3.5" />
            <path d="M ${cx + 160} ${cy + 120} L ${cx + 160} ${cy + 160} L ${cx + 120} ${cy + 160}" fill="none" stroke="#22d3ee" stroke-width="3.5" />
          </g>

          <g id="hud-reticle-inner" style="transform-origin: ${cx}px ${cy}px;">
            <circle cx="${cx}" cy="${cy}" r="150" fill="none" stroke="#f59e0b" stroke-width="2" stroke-dasharray="30 20" />
            <circle cx="${cx}" cy="${cy}" r="110" fill="none" stroke="#06b6d4" stroke-width="1.5" stroke-dasharray="10 10" />
          </g>
        </svg>

        <!-- CAMADA 4 (Z: +180px): Widgets Flutuantes de Dados & Telemetria Quântica -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(180px); transform-style: preserve-3d;">
          <!-- Widget Superior Esquerdo -->
          <g id="hud-widget-left" style="transform-origin: 220px 220px;">
            <rect x="140" y="160" width="160" height="90" rx="8" fill="#041e3a" stroke="#06b6d4" stroke-width="1.5" opacity="0.85" />
            <text x="155" y="185" fill="#38bdf8" font-size="10.5" font-family="monospace" font-weight="bold">ALVO FIXADO: ATIVO</text>
            <text x="155" y="208" fill="#94a3b8" font-size="10" font-family="monospace">FREQ: 1420,405 MHz</text>
            <text x="155" y="230" fill="#22c55e" font-size="10" font-family="monospace">TEMP. NÚCLEO: 320 K (OK)</text>
          </g>

          <!-- Widget Superior Direito -->
          <g id="hud-widget-right" style="transform-origin: 780px 220px;">
            <rect x="700" y="160" width="160" height="90" rx="8" fill="#041e3a" stroke="#06b6d4" stroke-width="1.5" opacity="0.85" />
            <text x="715" y="185" fill="#f59e0b" font-size="10.5" font-family="monospace" font-weight="bold">AMEAÇA: NENHUMA</text>
            <text x="715" y="208" fill="#94a3b8" font-size="10" font-family="monospace">REDE DE ENERGIA: 98,4%</text>
            <text x="715" y="230" fill="#38bdf8" font-size="10" font-family="monospace">LINK NEURAL: 60 FPS</text>
          </g>
        </svg>

        <!-- CAMADA 5 (Z: +250px): Núcleo Arc Reactor Holográfico & Mira Central -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(250px); transform-style: preserve-3d;">
          <g id="hud-arc-core" style="transform-origin: ${cx}px ${cy}px;">
            <!-- Orbe Central de Energia Tripla -->
            <circle cx="${cx}" cy="${cy}" r="65" fill="#06b6d4" opacity="0.2" filter="url(#hudLaserGlow)" />
            <circle cx="${cx}" cy="${cy}" r="45" fill="none" stroke="#38bdf8" stroke-width="3" filter="url(#hudLaserGlow)" />
            <circle cx="${cx}" cy="${cy}" r="22" fill="#ffffff" filter="url(#hudLaserGlow)" />
            <!-- Mira Cruzada Central -->
            <line x1="${cx - 30}" y1="${cy}" x2="${cx - 10}" y2="${cy}" stroke="#ffffff" stroke-width="2" />
            <line x1="${cx + 10}" y1="${cy}" x2="${cx + 30}" y2="${cy}" stroke="#ffffff" stroke-width="2" />
            <line x1="${cx}" y1="${cy - 30}" x2="${cx}" y2="${cy - 10}" stroke="#ffffff" stroke-width="2" />
            <line x1="${cx}" y1="${cy + 10}" x2="${cx}" y2="${cy + 30}" stroke="#ffffff" stroke-width="2" />
          </g>
        </svg>
      </div>

      <!-- HUD Flutuante Militar / JARVIS -->
      <div class="absolute top-6 left-6 pointer-events-none z-30 flex flex-col space-y-1.5 font-mono text-[11px] text-cyan-300/90 bg-black/80 backdrop-blur-lg p-3.5 rounded-xl border border-cyan-500/30 shadow-2xl">
        <div class="flex items-center space-x-2 text-cyan-300 font-bold text-xs uppercase tracking-wider">
          <span class="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#38bdf8]"></span>
          <span>HUD Tático 3D • Interface JARVIS</span>
        </div>
        <div class="text-gray-300">Subsistema: Matriz Holográfica Mark VII</div>
        <div class="text-gray-400">Pinça: Expande e ativa os anéis de combate</div>
        <div class="text-gray-400">Posição da Mão: Mira e orienta o HUD no espaço 3D</div>
        <div class="text-cyan-300 pt-1 border-t border-white/10 font-bold flex items-center justify-between">
          <span>Ativação Tática: <span id="jarvis-hud-progress">0.0%</span></span>
          <span class="text-[10px] text-cyan-300 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-500/30">Mira Fixada</span>
        </div>
        <div class="text-gray-400 text-[10px] flex items-center space-x-3 pt-0.5">
          <span>Inclinação: <span id="jarvis-hud-pitch" class="text-white">0°</span></span>
          <span>Giro: <span id="jarvis-hud-yaw" class="text-white">0°</span></span>
          <span>Torção: <span id="jarvis-hud-roll" class="text-white">0°</span></span>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = markup;

  const holoStage = container.querySelector('#jarvis-holo-stage') as HTMLElement;
  const radarSweep = container.querySelector('#hud-radar-sweep') as SVGElement;
  const azimuthRing = container.querySelector('#hud-azimuth-ring') as SVGElement;
  const waveformGroup = container.querySelector('#hud-waveform-group') as SVGElement;
  const waveBars = container.querySelectorAll('.hud-wave-bar');
  const reticleOuter = container.querySelector('#hud-reticle-outer') as SVGElement;
  const reticleInner = container.querySelector('#hud-reticle-inner') as SVGElement;
  const widgetLeft = container.querySelector('#hud-widget-left') as SVGElement;
  const widgetRight = container.querySelector('#hud-widget-right') as SVGElement;
  const arcCore = container.querySelector('#hud-arc-core') as SVGElement;

  const hudProgress = container.querySelector('#jarvis-hud-progress') as HTMLElement;
  const hudPitch = container.querySelector('#jarvis-hud-pitch') as HTMLElement;
  const hudYaw = container.querySelector('#jarvis-hud-yaw') as HTMLElement;
  const hudRoll = container.querySelector('#jarvis-hud-roll') as HTMLElement;

  const DURATION = 1000;
  const tl = createTimeline({ duration: DURATION, autoplay: false });

  // 1. Varredura contínua de radar (360°)
  if (radarSweep) {
    tl.add(radarSweep, { rotate: [0, 360], duration: DURATION, ease: 'linear' }, 0);
  }

  // 2. Anel de azimute rotaciona lentamente
  if (azimuthRing) {
    tl.add(azimuthRing, { rotate: [0, 90], scale: [0.85, 1], duration: DURATION, ease: 'outCubic' }, 0);
  }

  // 3. Formas de onda se expandem e barras pulsam
  if (waveformGroup) {
    tl.add(waveformGroup, { rotate: [0, -180], duration: DURATION, ease: 'inOutQuad' }, 0);
  }
  waveBars.forEach((bar, idx) => {
    const scaleFactor = 1 + (idx % 3) * 0.6;
    tl.add(bar, {
      scaleY: [0.3, scaleFactor],
      opacity: [0.4, 1],
      duration: DURATION * 0.7,
      ease: 'inOutSine',
    }, 100 + (idx % 8) * 30);
  });

  // 4. Retículos de mira em contrarrotação rápida
  if (reticleOuter) {
    tl.add(reticleOuter, {
      rotate: [0, 180],
      scale: [0.6, 1.25],
      duration: DURATION,
      ease: 'outBack',
    }, 50);
  }
  if (reticleInner) {
    tl.add(reticleInner, {
      rotate: [0, -270],
      scale: [0.7, 1.15],
      duration: DURATION,
      ease: 'outCubic',
    }, 80);
  }

  // 5. Widgets de dados se afastam lateralmente em 3D
  if (widgetLeft) {
    tl.add(widgetLeft, {
      translateX: [80, 0],
      opacity: [0, 1],
      duration: DURATION * 0.6,
      ease: 'outBack',
    }, 250);
  }
  if (widgetRight) {
    tl.add(widgetRight, {
      translateX: [-80, 0],
      opacity: [0, 1],
      duration: DURATION * 0.6,
      ease: 'outBack',
    }, 250);
  }

  // 6. Arc Reactor Core pulsa e expande
  if (arcCore) {
    tl.add(arcCore, {
      scale: [0.6, 1.4],
      duration: DURATION,
      ease: 'outBack',
    }, 0);
  }

  tl.seek(0);

  return {
    seek: (progress: number) => {
      const clamped = Math.max(0, Math.min(1, progress));
      tl.seek(clamped * DURATION);
      if (hudProgress) hudProgress.textContent = `${(clamped * 100).toFixed(1)}%`;
    },
    updatePerspective: ({ rotateX, rotateY, rotateZ, scale = 1 }) => {
      if (holoStage) holoStage.style.transform = `scale(${scale}) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) rotateZ(${rotateZ.toFixed(2)}deg)`;
      if (hudPitch) hudPitch.textContent = `${rotateX > 0 ? '+' : ''}${rotateX.toFixed(0)}°`;
      if (hudYaw) hudYaw.textContent = `${rotateY > 0 ? '+' : ''}${rotateY.toFixed(0)}°`;
      if (hudRoll) hudRoll.textContent = `${rotateZ > 0 ? '+' : ''}${rotateZ.toFixed(0)}°`;
    },
    destroy: () => {
      try { tl.revert(); } catch (e) {}
      container.innerHTML = '';
    },
  };
}
