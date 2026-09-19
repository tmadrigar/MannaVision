// src/utils/vectorExperiences/cosmicScaleExperience.ts
import { createTimeline } from 'animejs';
import { AnimeExperienceInstance } from './types';

/**
 * Experiência: Escala Cósmica (Powers of Ten / Do Átomo à Galáxia)
 * Percorre 31 ordens de magnitude em tempo real com a pinça dos dedos:
 * Átomo -> Hélice de DNA -> Célula Viva -> Planeta Terra -> Galáxia Espiral
 */
export function createCosmicScaleExperience(container: HTMLElement): AnimeExperienceInstance {
  container.innerHTML = '';

  const width = 1000;
  const height = 1000;
  const cx = width / 2;
  const cy = height / 2;

  // Gerar degraus da hélice de DNA
  const dnaRungsCount = 14;
  const dnaSvg = Array.from({ length: dnaRungsCount }, (_, i) => {
    const y = cy - 200 + i * 30;
    const wave = Math.sin((i / dnaRungsCount) * Math.PI * 2);
    const x1 = cx - 90 * wave;
    const x2 = cx + 90 * wave;
    return `
      <g class="dna-rung">
        <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#38bdf8" stroke-width="2" opacity="0.8" />
        <circle cx="${x1}" cy="${y}" r="5" fill="#06b6d4" />
        <circle cx="${x2}" cy="${y}" r="5" fill="#a855f7" />
      </g>
    `;
  }).join('');

  // Gerar estrelas da galáxia espiral (60 pontos em espiral logarítmica)
  const starsCount = 72;
  const starsSvg = Array.from({ length: starsCount }, (_, i) => {
    const theta = (i / starsCount) * Math.PI * 6;
    const r = 25 + Math.pow(i / starsCount, 1.2) * 380;
    const arm1X = cx + Math.cos(theta) * r;
    const arm1Y = cy + Math.sin(theta) * r;
    const arm2X = cx + Math.cos(theta + Math.PI) * r;
    const arm2Y = cy + Math.sin(theta + Math.PI) * r;
    const size = 1.5 + (1 - i / starsCount) * 4;
    return `
      <circle cx="${arm1X}" cy="${arm1Y}" r="${size}" fill="#e0f2fe" opacity="${0.4 + (i % 3) * 0.2}" />
      <circle cx="${arm2X}" cy="${arm2Y}" r="${size}" fill="#fdf4ff" opacity="${0.4 + (i % 3) * 0.2}" />
    `;
  }).join('');

  const markup = `
    <div class="relative w-full h-full flex items-center justify-center select-none overflow-hidden bg-radial from-[#050b1a] via-[#02050e] to-black" style="perspective: 1300px; perspective-origin: 50% 50%;">
      
      <!-- PALCO HOLOGRÁFICO 3D -->
      <div
        id="cosmic-holo-stage"
        class="relative flex items-center justify-center w-[85vmin] h-[85vmin] pointer-events-none"
        style="transform-style: preserve-3d; will-change: transform; transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg);"
      >
        <svg class="absolute w-0 h-0 pointer-events-none">
          <defs>
            <radialGradient id="atomNucleusGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#ffffff" />
              <stop offset="35%" stop-color="#38bdf8" />
              <stop offset="70%" stop-color="#0284c7" />
              <stop offset="100%" stop-color="#000000" stop-opacity="0" />
            </radialGradient>

            <radialGradient id="earthGrad" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stop-color="#38bdf8" />
              <stop offset="40%" stop-color="#0284c7" />
              <stop offset="75%" stop-color="#065f46" />
              <stop offset="100%" stop-color="#022c22" />
            </radialGradient>

            <radialGradient id="galaxyCoreGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#ffffff" />
              <stop offset="30%" stop-color="#fef08a" />
              <stop offset="60%" stop-color="#c084fc" />
              <stop offset="100%" stop-color="#000000" stop-opacity="0" />
            </radialGradient>
          </defs>
        </svg>

        <!-- FASE 1 (Z: +50px): Átomo Quântico (10^-10 m) -->
        <svg id="stage-atom" class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(50px); transform-style: preserve-3d;">
          <!-- Três orbitais eletrônicos inclinados -->
          <g id="atom-orbits" style="transform-origin: ${cx}px ${cy}px;">
            <ellipse cx="${cx}" cy="${cy}" rx="260" ry="85" fill="none" stroke="#38bdf8" stroke-width="2" stroke-dasharray="6 4" transform="rotate(0 ${cx} ${cy})" />
            <ellipse cx="${cx}" cy="${cy}" rx="260" ry="85" fill="none" stroke="#a855f7" stroke-width="2" stroke-dasharray="6 4" transform="rotate(60 ${cx} ${cy})" />
            <ellipse cx="${cx}" cy="${cy}" rx="260" ry="85" fill="none" stroke="#f59e0b" stroke-width="2" stroke-dasharray="6 4" transform="rotate(120 ${cx} ${cy})" />
            <!-- Elétrons em órbita -->
            <circle id="electron-1" cx="${cx + 260}" cy="${cy}" r="7" fill="#38bdf8" />
            <circle id="electron-2" cx="${cx - 130}" cy="${cy + 225}" r="7" fill="#a855f7" />
            <circle id="electron-3" cx="${cx - 130}" cy="${cy - 225}" r="7" fill="#f59e0b" />
          </g>
          <!-- Núcleo de Quarks -->
          <circle cx="${cx}" cy="${cy}" r="45" fill="url(#atomNucleusGrad)" />
          <circle cx="${cx - 10}" cy="${cy - 8}" r="14" fill="#ef4444" />
          <circle cx="${cx + 12}" cy="${cy - 6}" r="14" fill="#3b82f6" />
          <circle cx="${cx}" cy="${cy + 12}" r="14" fill="#ef4444" />
        </svg>

        <!-- FASE 2 (Z: +100px): Hélice Dupla de DNA (10^-8 m) -->
        <svg id="stage-dna" class="absolute inset-0 w-full h-full pointer-events-none opacity-0" viewBox="0 0 ${width} ${height}" style="transform: translateZ(100px); transform-style: preserve-3d;">
          <g id="dna-strand" style="transform-origin: ${cx}px ${cy}px;">
            ${dnaSvg}
            <!-- Trilhos de Açúcar-Fosfato -->
            <path d="M ${cx - 90} ${cy - 200} Q ${cx} ${cy - 120}, ${cx + 90} ${cy - 40} T ${cx - 90} ${cy + 120} T ${cx + 90} ${cy + 200}" fill="none" stroke="#06b6d4" stroke-width="3.5" />
            <path d="M ${cx + 90} ${cy - 200} Q ${cx} ${cy - 120}, ${cx - 90} ${cy - 40} T ${cx + 90} ${cy + 120} T ${cx - 90} ${cy + 200}" fill="none" stroke="#a855f7" stroke-width="3.5" />
          </g>
        </svg>

        <!-- FASE 3 (Z: +150px): Célula Biológica Viva (10^-5 m) -->
        <svg id="stage-cell" class="absolute inset-0 w-full h-full pointer-events-none opacity-0" viewBox="0 0 ${width} ${height}" style="transform: translateZ(150px); transform-style: preserve-3d;">
          <g id="cell-body" style="transform-origin: ${cx}px ${cy}px;">
            <!-- Membrana celular ondulada -->
            <circle cx="${cx}" cy="${cy}" r="260" fill="#042f2e" stroke="#10b981" stroke-width="3" opacity="0.6" stroke-dasharray="16 4" />
            <!-- Núcleo celular e nucléolo -->
            <circle cx="${cx - 30}" cy="${cy - 20}" r="90" fill="#064e3b" stroke="#34d399" stroke-width="2.5" />
            <circle cx="${cx - 30}" cy="${cy - 20}" r="35" fill="#6ee7b7" opacity="0.8" />
            <!-- Mitocôndrias -->
            <ellipse cx="${cx + 120}" cy="${cy - 90}" rx="45" ry="22" transform="rotate(35 ${cx + 120} ${cy - 90})" fill="#0f766e" stroke="#2dd4bf" stroke-width="2" />
            <ellipse cx="${cx + 90}" cy="${cy + 110}" rx="50" ry="24" transform="rotate(-25 ${cx + 90} ${cy + 110})" fill="#0f766e" stroke="#2dd4bf" stroke-width="2" />
          </g>
        </svg>

        <!-- FASE 4 (Z: +200px): Planeta Terra em Órbita (10^7 m) -->
        <svg id="stage-earth" class="absolute inset-0 w-full h-full pointer-events-none opacity-0" viewBox="0 0 ${width} ${height}" style="transform: translateZ(200px); transform-style: preserve-3d;">
          <g id="earth-globe" style="transform-origin: ${cx}px ${cy}px;">
            <!-- Atmosfera com halo de luz azul -->
            <circle cx="${cx}" cy="${cy}" r="190" fill="none" stroke="#38bdf8" stroke-width="8" opacity="0.3" />
            <!-- Globo -->
            <circle cx="${cx}" cy="${cy}" r="180" fill="url(#earthGrad)" stroke="#38bdf8" stroke-width="2" />
            <!-- Linhas de Latitude e Longitude -->
            <ellipse cx="${cx}" cy="${cy}" rx="180" ry="70" fill="none" stroke="#38bdf8" stroke-width="1.2" opacity="0.5" />
            <ellipse cx="${cx}" cy="${cy}" rx="70" ry="180" fill="none" stroke="#38bdf8" stroke-width="1.2" opacity="0.5" />
            <!-- Anel Orbital com Satélites -->
            <ellipse cx="${cx}" cy="${cy}" rx="320" ry="90" fill="none" stroke="#60a5fa" stroke-width="1.5" stroke-dasharray="8 6" transform="rotate(-20 ${cx} ${cy})" />
            <circle cx="${cx + 300}" cy="${cy - 60}" r="6" fill="#ffffff" />
          </g>
        </svg>

        <!-- FASE 5 (Z: +260px): Galáxia Espiral & Quasar Cósmico (10^21 m) -->
        <svg id="stage-galaxy" class="absolute inset-0 w-full h-full pointer-events-none opacity-0" viewBox="0 0 ${width} ${height}" style="transform: translateZ(260px); transform-style: preserve-3d;">
          <g id="galaxy-arms" style="transform-origin: ${cx}px ${cy}px;">
            ${starsSvg}
            <!-- Quasar central supermassivo -->
            <circle cx="${cx}" cy="${cy}" r="60" fill="url(#galaxyCoreGrad)" />
            <circle cx="${cx}" cy="${cy}" r="15" fill="#ffffff" />
          </g>
        </svg>
      </div>

      <!-- HUD Flutuante de Escala Cósmica -->
      <div class="absolute top-6 left-6 pointer-events-none z-30 flex flex-col space-y-1.5 font-mono text-[11px] text-cyan-400/90 bg-black/80 backdrop-blur-lg p-3.5 rounded-xl border border-cyan-500/30 shadow-2xl">
        <div class="flex items-center space-x-2 text-cyan-300 font-bold text-xs uppercase tracking-wider">
          <span class="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#38bdf8]"></span>
          <span>Potências de Dez • Zoom Cósmico 3D</span>
        </div>
        <div class="text-gray-300">Escala Atual: <span id="cosmic-metric" class="text-amber-300 font-bold">10⁻¹⁰ m (Átomo)</span></div>
        <div class="text-gray-400">Pinça: Percorre do subatômico ao galáctico</div>
        <div class="text-gray-400">Posição da Mão: Inclina e navega no espaço 3D</div>
        <div class="text-amber-300 pt-1 border-t border-white/10 font-bold flex items-center justify-between">
          <span>Magnitude: <span id="cosmic-hud-progress">0.0%</span></span>
          <span class="text-[10px] text-purple-300 bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-500/30">31 Ordens</span>
        </div>
        <div class="text-gray-400 text-[10px] flex items-center space-x-3 pt-0.5">
          <span>Inclinação: <span id="cosmic-hud-pitch" class="text-white">0°</span></span>
          <span>Giro: <span id="cosmic-hud-yaw" class="text-white">0°</span></span>
          <span>Torção: <span id="cosmic-hud-roll" class="text-white">0°</span></span>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = markup;

  const holoStage = container.querySelector('#cosmic-holo-stage') as HTMLElement;
  const stageAtom = container.querySelector('#stage-atom') as SVGElement;
  const stageDna = container.querySelector('#stage-dna') as SVGElement;
  const stageCell = container.querySelector('#stage-cell') as SVGElement;
  const stageEarth = container.querySelector('#stage-earth') as SVGElement;
  const stageGalaxy = container.querySelector('#stage-galaxy') as SVGElement;

  const atomOrbits = container.querySelector('#atom-orbits') as SVGElement;
  const dnaStrand = container.querySelector('#dna-strand') as SVGElement;
  const cellBody = container.querySelector('#cell-body') as SVGElement;
  const earthGlobe = container.querySelector('#earth-globe') as SVGElement;
  const galaxyArms = container.querySelector('#galaxy-arms') as SVGElement;

  const cosmicMetric = container.querySelector('#cosmic-metric') as HTMLElement;
  const hudProgress = container.querySelector('#cosmic-hud-progress') as HTMLElement;
  const hudPitch = container.querySelector('#cosmic-hud-pitch') as HTMLElement;
  const hudYaw = container.querySelector('#cosmic-hud-yaw') as HTMLElement;
  const hudRoll = container.querySelector('#cosmic-hud-roll') as HTMLElement;

  const DURATION = 1000;
  const tl = createTimeline({ duration: DURATION, autoplay: false });

  // 1. Átomo (0% a 25%)
  if (atomOrbits) {
    tl.add(atomOrbits, { rotate: [0, 360], duration: DURATION * 0.35, ease: 'linear' }, 0);
  }
  if (stageAtom) {
    tl.add(stageAtom, { opacity: [1, 1], scale: [1, 2.5], duration: DURATION * 0.22, ease: 'inQuad' }, 0);
    tl.add(stageAtom, { opacity: [1, 0], duration: DURATION * 0.08, ease: 'linear' }, DURATION * 0.18);
  }

  // 2. DNA (20% a 48%)
  if (stageDna) {
    tl.add(stageDna, { opacity: [0, 1], scale: [0.3, 1], duration: DURATION * 0.15, ease: 'outCubic' }, DURATION * 0.18);
    tl.add(stageDna, { opacity: [1, 0], scale: [1, 2.2], duration: DURATION * 0.12, ease: 'inQuad' }, DURATION * 0.38);
  }
  if (dnaStrand) {
    tl.add(dnaStrand, { rotate: [0, 180], duration: DURATION * 0.3, ease: 'linear' }, DURATION * 0.2);
  }

  // 3. Célula (42% a 72%)
  if (stageCell) {
    tl.add(stageCell, { opacity: [0, 1], scale: [0.3, 1], duration: DURATION * 0.15, ease: 'outCubic' }, DURATION * 0.38);
    tl.add(stageCell, { opacity: [1, 0], scale: [1, 2.4], duration: DURATION * 0.12, ease: 'inQuad' }, DURATION * 0.6);
  }
  if (cellBody) {
    tl.add(cellBody, { rotate: [0, -120], duration: DURATION * 0.35, ease: 'linear' }, DURATION * 0.4);
  }

  // 4. Terra (65% a 88%)
  if (stageEarth) {
    tl.add(stageEarth, { opacity: [0, 1], scale: [0.3, 1], duration: DURATION * 0.15, ease: 'outCubic' }, DURATION * 0.6);
    tl.add(stageEarth, { opacity: [1, 0], scale: [1, 2.6], duration: DURATION * 0.1, ease: 'inQuad' }, DURATION * 0.8);
  }
  if (earthGlobe) {
    tl.add(earthGlobe, { rotate: [0, 180], duration: DURATION * 0.3, ease: 'linear' }, DURATION * 0.62);
  }

  // 5. Galáxia Espiral (82% a 100%)
  if (stageGalaxy) {
    tl.add(stageGalaxy, { opacity: [0, 1], scale: [0.2, 1], duration: DURATION * 0.18, ease: 'outBack' }, DURATION * 0.8);
  }
  if (galaxyArms) {
    tl.add(galaxyArms, { rotate: [0, 360], duration: DURATION * 0.25, ease: 'linear' }, DURATION * 0.75);
  }

  tl.seek(0);

  const METRICS = [
    { p: 0.0, label: '10⁻¹⁰ m (Átomo Quântico)' },
    { p: 0.22, label: '10⁻⁸ m (Hélice de DNA)' },
    { p: 0.45, label: '10⁻⁵ m (Célula Viva)' },
    { p: 0.68, label: '10⁷ m (Planeta Terra)' },
    { p: 0.88, label: '10²¹ m (Galáxia Espiral)' },
  ];

  return {
    seek: (progress: number) => {
      const clamped = Math.max(0, Math.min(1, progress));
      tl.seek(clamped * DURATION);
      if (hudProgress) hudProgress.textContent = `${(clamped * 100).toFixed(1)}%`;
      if (cosmicMetric) {
        let currentLabel = METRICS[0].label;
        for (const m of METRICS) {
          if (clamped >= m.p) currentLabel = m.label;
        }
        cosmicMetric.textContent = currentLabel;
      }
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
