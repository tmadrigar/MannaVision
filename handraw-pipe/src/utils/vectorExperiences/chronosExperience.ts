// src/utils/vectorExperiences/chronosExperience.ts
import { createTimeline } from 'animejs';
import { AnimeExperienceInstance } from './types';

/**
 * Experiência: Cronógrafo Quântico 3D Holográfico
 */
export function createChronosAnimeExperience(container: HTMLElement): AnimeExperienceInstance {
  container.innerHTML = '';

  const width = 1000;
  const height = 1000;
  const cx = width / 2;
  const cy = height / 2;

  // 1. Pétalas geométricas externas (12 pétalas)
  const outerPetalsCount = 12;
  const outerPetalsSvg = Array.from({ length: outerPetalsCount }, (_, i) => {
    const angle = (i * 360) / outerPetalsCount;
    return `
      <g class="anime-outer-petal" data-angle="${angle}" transform="rotate(${angle} ${cx} ${cy})">
        <path
          d="M ${cx} ${cy - 30} C ${cx - 70} ${cy - 160}, ${cx - 90} ${cy - 320}, ${cx} ${cy - 440} C ${cx + 90} ${cy - 320}, ${cx + 70} ${cy - 160}, ${cx} ${cy - 30} Z"
          fill="url(#outerPetalGrad)"
          stroke="#06b6d4"
          stroke-width="1.8"
          opacity="0.25"
        />
        <line
          x1="${cx}"
          y1="${cy - 30}"
          x2="${cx}"
          y2="${cy - 420}"
          stroke="#38bdf8"
          stroke-width="1.2"
          stroke-dasharray="4 4"
          opacity="0.5"
        />
      </g>
    `;
  }).join('');

  // 2. Pétalas intermediárias (8 pétalas)
  const midPetalsCount = 8;
  const midPetalsSvg = Array.from({ length: midPetalsCount }, (_, i) => {
    const angle = (i * 360) / midPetalsCount + 22.5;
    return `
      <g class="anime-mid-petal" data-angle="${angle}" transform="rotate(${angle} ${cx} ${cy})">
        <path
          d="M ${cx} ${cy - 20} C ${cx - 50} ${cy - 100}, ${cx - 65} ${cy - 230}, ${cx} ${cy - 310} C ${cx + 65} ${cy - 230}, ${cx + 50} ${cy - 100}, ${cx} ${cy - 20} Z"
          fill="url(#midPetalGrad)"
          stroke="#c084fc"
          stroke-width="2"
          opacity="0.3"
        />
      </g>
    `;
  }).join('');

  // 3. Lâminas da Íris Mecânica
  const bladesCount = 8;
  const bladesSvg = Array.from({ length: bladesCount }, (_, i) => {
    const angle = (i * 360) / bladesCount;
    return `
      <path
        class="anime-iris-blade"
        data-angle="${angle}"
        d="M ${cx} ${cy - 50} L ${cx + 120} ${cy - 30} L ${cx + 70} ${cy + 70} L ${cx - 20} ${cy + 40} Z"
        fill="url(#bladeGrad)"
        stroke="#38bdf8"
        stroke-width="1.5"
        opacity="0.85"
        style="transform-origin: ${cx}px ${cy}px;"
      />
    `;
  }).join('');

  // 4. Estames / filamentos
  const stamenCount = 16;
  const stamenSvg = Array.from({ length: stamenCount }, (_, i) => {
    const angle = (i * 360) / stamenCount;
    const rad = (angle * Math.PI) / 180;
    const x2 = cx + Math.cos(rad) * 160;
    const y2 = cy + Math.sin(rad) * 160;
    return `
      <g class="anime-stamen" data-angle="${angle}">
        <line
          x1="${cx}"
          y1="${cy}"
          x2="${x2}"
          y2="${y2}"
          stroke="#f59e0b"
          stroke-width="2"
          opacity="0.35"
        />
        <circle
          cx="${x2}"
          cy="${y2}"
          r="4.5"
          fill="#fbbf24"
          filter="url(#glowAmber)"
        />
      </g>
    `;
  }).join('');

  // 5. Marcas de astrolábio
  const ticksCount = 72;
  const ticksSvg = Array.from({ length: ticksCount }, (_, i) => {
    const angle = (i * 360) / ticksCount;
    const isMajor = i % 6 === 0;
    const len = isMajor ? 18 : 8;
    return `
      <line
        class="anime-tick"
        x1="${cx}"
        y1="${cy - 460}"
        x2="${cx}"
        y2="${cy - 460 + len}"
        transform="rotate(${angle} ${cx} ${cy})"
        stroke="${isMajor ? '#38bdf8' : '#64748b'}"
        stroke-width="${isMajor ? '2.5' : '1.2'}"
        opacity="${isMajor ? '0.9' : '0.45'}"
      />
    `;
  }).join('');

  const markup = `
    <div class="relative w-full h-full flex items-center justify-center select-none overflow-hidden bg-radial from-slate-950 via-black to-[#020617]" style="perspective: 1300px; perspective-origin: 50% 50%;">
      <div
        id="anime-holo-stage"
        class="relative flex items-center justify-center w-[85vmin] h-[85vmin] pointer-events-none"
        style="transform-style: preserve-3d; will-change: transform; transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg);"
      >
        <svg class="absolute w-0 h-0 pointer-events-none">
          <defs>
            <linearGradient id="outerPetalGrad" x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stop-color="#0f172a" stop-opacity="0.8" />
              <stop offset="60%" stop-color="#0e7490" stop-opacity="0.6" />
              <stop offset="100%" stop-color="#06b6d4" stop-opacity="0.95" />
            </linearGradient>

            <linearGradient id="midPetalGrad" x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stop-color="#3b0764" stop-opacity="0.8" />
              <stop offset="70%" stop-color="#7e22ce" stop-opacity="0.6" />
              <stop offset="100%" stop-color="#c084fc" stop-opacity="0.95" />
            </linearGradient>

            <linearGradient id="bladeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#1e293b" />
              <stop offset="50%" stop-color="#0f172a" />
              <stop offset="100%" stop-color="#0284c7" />
            </linearGradient>

            <radialGradient id="coreGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#ffffff" />
              <stop offset="25%" stop-color="#38bdf8" />
              <stop offset="65%" stop-color="#8b5cf6" stop-opacity="0.8" />
              <stop offset="100%" stop-color="#000000" stop-opacity="0" />
            </radialGradient>

            <radialGradient id="plasmaGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#fbbf24" />
              <stop offset="50%" stop-color="#f59e0b" stop-opacity="0.8" />
              <stop offset="100%" stop-color="#ef4444" stop-opacity="0" />
            </radialGradient>

            <filter id="glowCyan" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>

            <filter id="glowAmber" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
        </svg>

        <!-- Z: -60px: Grade Profunda -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(-60px); transform-style: preserve-3d;">
          <g opacity="0.35">
            <circle cx="${cx}" cy="${cy}" r="470" stroke="#0284c7" stroke-width="1.5" stroke-dasharray="4 8" fill="none" />
            <circle cx="${cx}" cy="${cy}" r="390" stroke="#1e293b" stroke-width="1" stroke-dasharray="6 6" fill="none" />
            <circle cx="${cx}" cy="${cy}" r="280" stroke="#1e293b" stroke-width="1" fill="none" />
            <circle cx="${cx}" cy="${cy}" r="160" stroke="#0369a1" stroke-width="1" stroke-dasharray="4 8" fill="none" />
            <line x1="${cx - 490}" y1="${cy}" x2="${cx + 490}" y2="${cy}" stroke="#0369a1" stroke-width="1" opacity="0.4" />
            <line x1="${cx}" y1="${cy - 490}" x2="${cx}" y2="${cy + 490}" stroke="#0369a1" stroke-width="1" opacity="0.4" />
          </g>
        </svg>

        <!-- Z: 0px: Astrolábio -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(0px); transform-style: preserve-3d;">
          <g id="anime-outer-ring" style="transform-origin: ${cx}px ${cy}px;">
            <circle id="anime-outer-circle" cx="${cx}" cy="${cy}" r="460" stroke="#0ea5e9" stroke-width="2.5" fill="none" stroke-dasharray="2890" stroke-dashoffset="2890" />
            ${ticksSvg}
          </g>
          <g id="anime-mid-ring" style="transform-origin: ${cx}px ${cy}px;">
            <circle cx="${cx}" cy="${cy}" r="380" stroke="#a855f7" stroke-width="1.5" stroke-dasharray="12 12" fill="none" opacity="0.6" />
            <circle id="anime-mid-circle" cx="${cx}" cy="${cy}" r="280" stroke="#818cf8" stroke-width="2.5" fill="none" stroke-dasharray="1760" stroke-dashoffset="1760" />
          </g>
        </svg>

        <!-- Z: +50px: Pétalas Ciano -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(50px); transform-style: preserve-3d;">
          <g id="anime-outer-petals-group" style="transform-origin: ${cx}px ${cy}px;">${outerPetalsSvg}</g>
        </svg>

        <!-- Z: +100px: Pétalas Púrpura -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(100px); transform-style: preserve-3d;">
          <g id="anime-mid-petals-group" style="transform-origin: ${cx}px ${cy}px;">${midPetalsSvg}</g>
        </svg>

        <!-- Z: +150px: Íris Mecânica -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(150px); transform-style: preserve-3d;">
          <g id="anime-iris-group" style="transform-origin: ${cx}px ${cy}px;">${bladesSvg}</g>
        </svg>

        <!-- Z: +200px: Estames -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(200px); transform-style: preserve-3d;">
          <g id="anime-stamen-group" style="transform-origin: ${cx}px ${cy}px;">${stamenSvg}</g>
        </svg>

        <!-- Z: +260px: Núcleo Quântico -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(260px); transform-style: preserve-3d;">
          <g id="anime-core-group" style="transform-origin: ${cx}px ${cy}px;">
            <circle id="anime-plasma-glow" cx="${cx}" cy="${cy}" r="120" fill="url(#plasmaGrad)" opacity="0.25" style="transform-origin: ${cx}px ${cy}px;" />
            <circle id="anime-core-orb" cx="${cx}" cy="${cy}" r="48" fill="url(#coreGrad)" filter="url(#glowCyan)" style="transform-origin: ${cx}px ${cy}px;" />
            <polygon id="anime-core-polygon" points="${cx},${cy - 25} ${cx + 22},${cy + 14} ${cx - 22},${cy + 14}" fill="none" stroke="#ffffff" stroke-width="2.5" style="transform-origin: ${cx}px ${cy}px;" />
            <polygon id="anime-core-polygon-inv" points="${cx},${cy + 25} ${cx + 22},${cy - 14} ${cx - 22},${cy - 14}" fill="none" stroke="#38bdf8" stroke-width="2" style="transform-origin: ${cx}px ${cy}px;" />
          </g>
        </svg>
      </div>

      <!-- HUD 3D -->
      <div class="absolute top-6 left-6 pointer-events-none z-30 flex flex-col space-y-1.5 font-mono text-[11px] text-cyan-400/90 bg-black/75 backdrop-blur-lg p-3.5 rounded-xl border border-cyan-500/30 shadow-2xl">
        <div class="flex items-center space-x-2 text-cyan-300 font-bold text-xs uppercase tracking-wider">
          <span class="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#38bdf8]"></span>
          <span>Anime.js v4 • Parallax Holográfico 3D</span>
        </div>
        <div class="text-gray-300">Modo: Cronógrafo Quântico 3D</div>
        <div class="text-gray-400">Pinça: Abre Linha do Tempo (0% ➔ 100%)</div>
        <div class="text-gray-400">Posição da Mão: Inclina Ângulo 3D no Espaço</div>
        <div class="text-amber-300 pt-1 border-t border-white/10 font-bold flex items-center justify-between">
          <span>Linha do Tempo: <span id="anime-hud-progress">0.0%</span></span>
          <span class="text-[10px] text-cyan-300 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-500/30">7 Camadas Z</span>
        </div>
        <div class="text-gray-400 text-[10px] flex items-center space-x-3 pt-0.5">
          <span>Inclinação: <span id="anime-hud-pitch" class="text-white">0°</span></span>
          <span>Giro: <span id="anime-hud-yaw" class="text-white">0°</span></span>
          <span>Torção: <span id="anime-hud-roll" class="text-white">0°</span></span>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = markup;

  const holoStage = container.querySelector('#anime-holo-stage') as HTMLElement;
  const outerRing = container.querySelector('#anime-outer-ring') as SVGElement;
  const midRing = container.querySelector('#anime-mid-ring') as SVGElement;
  const outerCircle = container.querySelector('#anime-outer-circle') as SVGElement;
  const midCircle = container.querySelector('#anime-mid-circle') as SVGElement;
  const outerPetals = container.querySelectorAll('.anime-outer-petal');
  const midPetals = container.querySelectorAll('.anime-mid-petal');
  const irisBlades = container.querySelectorAll('.anime-iris-blade');
  const stamens = container.querySelectorAll('.anime-stamen');
  const plasmaGlow = container.querySelector('#anime-plasma-glow') as SVGElement;
  const coreOrb = container.querySelector('#anime-core-orb') as SVGElement;
  const corePolygon = container.querySelector('#anime-core-polygon') as SVGElement;
  const corePolygonInv = container.querySelector('#anime-core-polygon-inv') as SVGElement;
  const hudProgress = container.querySelector('#anime-hud-progress') as HTMLElement;
  const hudPitch = container.querySelector('#anime-hud-pitch') as HTMLElement;
  const hudYaw = container.querySelector('#anime-hud-yaw') as HTMLElement;
  const hudRoll = container.querySelector('#anime-hud-roll') as HTMLElement;

  const DURATION = 1000;
  const tl = createTimeline({ duration: DURATION, autoplay: false });

  if (outerCircle) tl.add(outerCircle, { strokeDashoffset: [2890, 0], duration: DURATION, ease: 'inOutQuad' }, 0);
  if (midCircle) tl.add(midCircle, { strokeDashoffset: [1760, 0], duration: DURATION, ease: 'inOutQuad' }, 0);
  if (outerRing) tl.add(outerRing, { rotate: [0, 180], duration: DURATION, ease: 'inOutCubic' }, 0);
  if (midRing) tl.add(midRing, { rotate: [0, -240], duration: DURATION, ease: 'inOutCubic' }, 0);

  outerPetals.forEach((petal, idx) => {
    const angle = parseFloat(petal.getAttribute('data-angle') || '0');
    tl.add(petal, { scale: [0.1, 1], rotate: [angle - 40, angle], opacity: [0.1, 1], duration: DURATION, ease: 'outBack' }, idx * 10);
  });

  midPetals.forEach((petal, idx) => {
    const angle = parseFloat(petal.getAttribute('data-angle') || '0');
    tl.add(petal, { scale: [0.05, 1], rotate: [angle + 60, angle], opacity: [0.2, 0.95], duration: DURATION * 0.9, ease: 'outCubic' }, 50 + idx * 15);
  });

  irisBlades.forEach((blade, idx) => {
    const baseAngle = (idx * 360) / irisBlades.length;
    tl.add(blade, { rotate: [baseAngle, baseAngle + 85], scale: [0.4, 1.3], opacity: [0.95, 0.35], duration: DURATION, ease: 'inOutSine' }, 0);
  });

  stamens.forEach((stamen, idx) => {
    tl.add(stamen, { scale: [0.2, 1], opacity: [0.2, 1], duration: DURATION * 0.8, ease: 'outExpo' }, 100 + idx * 12);
  });

  if (plasmaGlow) tl.add(plasmaGlow, { scale: [0.5, 2.3], opacity: [0.2, 0.75], duration: DURATION, ease: 'inOutQuad' }, 0);
  if (coreOrb) tl.add(coreOrb, { scale: [0.6, 1.7], duration: DURATION, ease: 'inOutCubic' }, 0);
  if (corePolygon) tl.add(corePolygon, { rotate: [0, 360], scale: [0.5, 1.4], duration: DURATION, ease: 'linear' }, 0);
  if (corePolygonInv) tl.add(corePolygonInv, { rotate: [0, -360], scale: [0.5, 1.4], duration: DURATION, ease: 'linear' }, 0);

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
