// src/utils/vectorExperiences/explodedRocketExperience.ts
import { createTimeline } from 'animejs';
import { AnimeExperienceInstance } from './types';

/**
 * Experiência: Foguete Orbital em Vista Explodida (CAD 3D Exploded View)
 * As partes aeroespaciais se desmembram em múltiplos eixos (X, Y, Z) no espaço 3D
 * com anotações de telemetria técnica acompanhando os componentes.
 */
export function createExplodedRocketExperience(container: HTMLElement): AnimeExperienceInstance {
  container.innerHTML = '';

  const width = 1000;
  const height = 1000;
  const cx = width / 2;
  const cy = height / 2;

  const markup = `
    <div class="relative w-full h-full flex items-center justify-center select-none overflow-hidden bg-radial from-[#040d1a] via-[#020611] to-black" style="perspective: 1400px; perspective-origin: 50% 50%;">
      
      <!-- PALCO HOLOGRÁFICO 3D -->
      <div
        id="rocket-holo-stage"
        class="relative flex items-center justify-center w-[85vmin] h-[85vmin] pointer-events-none"
        style="transform-style: preserve-3d; will-change: transform; transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg);"
      >
        <svg class="absolute w-0 h-0 pointer-events-none">
          <defs>
            <linearGradient id="rocketBodyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#1e293b" />
              <stop offset="35%" stop-color="#f8fafc" />
              <stop offset="70%" stop-color="#94a3b8" />
              <stop offset="100%" stop-color="#0f172a" />
            </linearGradient>

            <linearGradient id="fairingGradLeft" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#0f172a" />
              <stop offset="80%" stop-color="#e2e8f0" />
              <stop offset="100%" stop-color="#38bdf8" />
            </linearGradient>

            <linearGradient id="fairingGradRight" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#38bdf8" />
              <stop offset="20%" stop-color="#e2e8f0" />
              <stop offset="100%" stop-color="#0f172a" />
            </linearGradient>

            <linearGradient id="tankLoxGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#0284c7" />
              <stop offset="50%" stop-color="#06b6d4" />
              <stop offset="100%" stop-color="#0369a1" />
            </linearGradient>

            <linearGradient id="engineFlameGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#ffffff" />
              <stop offset="25%" stop-color="#38bdf8" />
              <stop offset="60%" stop-color="#f97316" />
              <stop offset="100%" stop-color="#ef4444" stop-opacity="0" />
            </linearGradient>

            <filter id="cadGlowCyan" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
        </svg>

        <!-- CAMADA 0 (Z: -60px): Torre de Lançamento & Grelha CAD -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(-60px); transform-style: preserve-3d;">
          <g opacity="0.3">
            <!-- Torre de serviço treliçada -->
            <line x1="${cx - 160}" y1="120" x2="${cx - 160}" y2="880" stroke="#0284c7" stroke-width="2.5" />
            <line x1="${cx - 240}" y1="120" x2="${cx - 240}" y2="880" stroke="#0284c7" stroke-width="2" />
            ${Array.from({ length: 14 }, (_, i) => `
              <line x1="${cx - 240}" y1="${160 + i * 50}" x2="${cx - 160}" y2="${160 + i * 50}" stroke="#0369a1" stroke-width="1.5" />
              <line x1="${cx - 240}" y1="${160 + i * 50}" x2="${cx - 160}" y2="${210 + i * 50}" stroke="#0284c7" stroke-width="1" />
            `).join('')}
            <!-- Braços umbilicais da torre -->
            <line id="cad-arm-1" x1="${cx - 160}" y1="280" x2="${cx - 45}" y2="280" stroke="#38bdf8" stroke-width="2" stroke-dasharray="4 4" />
            <line id="cad-arm-2" x1="${cx - 160}" y1="520" x2="${cx - 65}" y2="520" stroke="#38bdf8" stroke-width="2" stroke-dasharray="4 4" />
            <!-- Círculos de telemetria orbital de fundo -->
            <circle cx="${cx}" cy="${cy}" r="450" stroke="#1e293b" stroke-width="1.5" stroke-dasharray="6 6" fill="none" />
            <circle cx="${cx}" cy="${cy}" r="320" stroke="#0f172a" stroke-width="1" fill="none" />
          </g>
        </svg>

        <!-- CAMADA 1 (Z: -10px): Esqueleto Estrutural & Tubulações Internas -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(-10px); transform-style: preserve-3d;">
          <g id="rocket-chassis" style="transform-origin: ${cx}px ${cy}px;">
            <rect x="${cx - 50}" y="320" width="100" height="380" fill="#090d16" stroke="#334155" stroke-width="2" rx="6" />
            <!-- Tubulações de combustível de alta pressão -->
            <line x1="${cx - 25}" y1="340" x2="${cx - 25}" y2="680" stroke="#0ea5e9" stroke-width="3" />
            <line x1="${cx + 25}" y1="340" x2="${cx + 25}" y2="680" stroke="#f59e0b" stroke-width="3" />
            <!-- Nervuras estruturais do foguete -->
            ${Array.from({ length: 9 }, (_, i) => `
              <line x1="${cx - 45}" y1="${360 + i * 36}" x2="${cx + 45}" y2="${360 + i * 36}" stroke="#1e293b" stroke-width="1.5" />
            `).join('')}
          </g>
        </svg>

        <!-- CAMADA 2 (Z: +40px): Tanques Internos de Oxigênio (LOX) e Querosene -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(40px); transform-style: preserve-3d;">
          <g id="rocket-fuel-tanks" style="transform-origin: ${cx}px 480px;">
            <!-- Tanque Superior (Oxigênio Líquido / LOX) -->
            <g id="tank-lox">
              <rect x="${cx - 40}" y="350" width="80" height="140" rx="16" fill="url(#tankLoxGrad)" stroke="#38bdf8" stroke-width="2" opacity="0.9" />
              <text x="${cx}" y="425" fill="#ffffff" font-size="10.5" font-family="monospace" font-weight="bold" text-anchor="middle">TANQUE LOX</text>
            </g>
            <!-- Tanque Inferior (Combustível RP-1) -->
            <g id="tank-rp1">
              <rect x="${cx - 40}" y="510" width="80" height="150" rx="16" fill="#1e1b4b" stroke="#818cf8" stroke-width="2" opacity="0.9" />
              <text x="${cx}" y="590" fill="#c7d2fe" font-size="10.5" font-family="monospace" font-weight="bold" text-anchor="middle">COMBUSTÍVEL RP-1</text>
            </g>
          </g>
        </svg>

        <!-- CAMADA 3 (Z: +90px): Motor de Propulsão / Bocais de Exaustão (Desce no Z/Y) -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(90px); transform-style: preserve-3d;">
          <g id="rocket-engine-cluster" style="transform-origin: ${cx}px 720px;">
            <!-- Estrutura do Motor -->
            <path d="M ${cx - 55} 700 L ${cx + 55} 700 L ${cx + 65} 730 L ${cx - 65} 730 Z" fill="#334155" stroke="#64748b" stroke-width="2" />
            <!-- Sino do Motor Principal (Campânula de exaustão) -->
            <path d="M ${cx - 24} 730 L ${cx + 24} 730 L ${cx + 42} 795 L ${cx - 42} 795 Z" fill="#0f172a" stroke="#e2e8f0" stroke-width="2" />
            <!-- Bocais secundários laterais -->
            <path d="M ${cx - 60} 730 L ${cx - 30} 730 L ${cx - 22} 775 L ${cx - 68} 775 Z" fill="#0f172a" stroke="#94a3b8" stroke-width="1.5" />
            <path d="M ${cx + 30} 730 L ${cx + 60} 730 L ${cx + 68} 775 L ${cx + 22} 775 Z" fill="#0f172a" stroke="#94a3b8" stroke-width="1.5" />
            <!-- Pluma de Plasma / Fogo de Propulsão -->
            <polygon id="engine-plume" points="${cx},880 ${cx - 36},795 ${cx + 36},795" fill="url(#engineFlameGrad)" opacity="0" />
            <!-- Turbobomba central -->
            <circle cx="${cx}" cy="718" r="12" fill="#0284c7" stroke="#ffffff" stroke-width="2" />
          </g>
        </svg>

        <!-- CAMADA 4 (Z: +150px): Carenagens Aerodinâmicas Laterais (Fairings separam para esquerda e direita) -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(150px); transform-style: preserve-3d;">
          <!-- Carenagem Esquerda -->
          <g id="fairing-left" style="transform-origin: ${cx - 55}px 450px;">
            <path
              d="M ${cx - 1} 190 C ${cx - 40} 220, ${cx - 55} 270, ${cx - 55} 330 L ${cx - 55} 700 L ${cx - 1} 700 Z"
              fill="url(#fairingGradLeft)"
              stroke="#38bdf8"
              stroke-width="2"
              opacity="0.9"
            />
            <!-- Barbatana Estabilizadora Esquerda -->
            <polygon points="${cx - 55},650 ${cx - 120},720 ${cx - 55},700" fill="#0284c7" stroke="#38bdf8" stroke-width="2" />
          </g>
          <!-- Carenagem Direita -->
          <g id="fairing-right" style="transform-origin: ${cx + 55}px 450px;">
            <path
              d="M ${cx + 1} 190 C ${cx + 40} 220, ${cx + 55} 270, ${cx + 55} 330 L ${cx + 55} 700 L ${cx + 1} 700 Z"
              fill="url(#fairingGradRight)"
              stroke="#38bdf8"
              stroke-width="2"
              opacity="0.9"
            />
            <!-- Barbatana Estabilizadora Direita -->
            <polygon points="${cx + 55},650 ${cx + 120},720 ${cx + 55},700" fill="#0284c7" stroke="#38bdf8" stroke-width="2" />
          </g>
        </svg>

        <!-- CAMADA 5 (Z: +210px): Módulo de Comando / Cápsula Orbital & Painéis Solares -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(210px); transform-style: preserve-3d;">
          <g id="capsule-module" style="transform-origin: ${cx}px 250px;">
            <!-- Painéis Solares Dobráveis -->
            <rect id="solar-left" x="${cx - 145}" y="240" width="95" height="32" fill="#0369a1" stroke="#38bdf8" stroke-width="1.5" rx="3" />
            <rect id="solar-right" x="${cx + 50}" y="240" width="95" height="32" fill="#0369a1" stroke="#38bdf8" stroke-width="1.5" rx="3" />
            <!-- Cápsula Cônica -->
            <polygon points="${cx},160 ${cx - 38},270 ${cx + 38},270" fill="url(#rocketBodyGrad)" stroke="#06b6d4" stroke-width="2.5" />
            <!-- Janela / Escotilha com brilho ciano -->
            <circle cx="${cx}" cy="225" r="9" fill="#06b6d4" stroke="#ffffff" stroke-width="2" filter="url(#cadGlowCyan)" />
            <!-- Escudo Térmico Base -->
            <ellipse cx="${cx}" cy="272" rx="38" ry="8" fill="#451a03" stroke="#f59e0b" stroke-width="1.5" />
          </g>
        </svg>

        <!-- CAMADA 6 (Z: +270px): Anotações Técnicas CAD & Linhas de Telemetria (Explosão Visual) -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(270px); transform-style: preserve-3d;">
          <!-- Tag 1: Cápsula Orbital -->
          <g id="tag-capsule" opacity="0">
            <line x1="${cx + 42}" y1="210" x2="${cx + 220}" y2="180" stroke="#06b6d4" stroke-width="1.5" stroke-dasharray="3 3" />
            <circle cx="${cx + 42}" cy="210" r="3" fill="#06b6d4" />
            <rect x="${cx + 220}" y="165" width="165" height="30" rx="4" fill="#000000" stroke="#06b6d4" stroke-width="1" />
            <text x="${cx + 230}" y="185" fill="#38bdf8" font-size="10.5" font-family="monospace" font-weight="bold">MÓDULO DE COMANDO</text>
          </g>

          <!-- Tag 2: Carenagens Aerodinâmicas -->
          <g id="tag-fairings" opacity="0">
            <line x1="${cx - 120}" y1="460" x2="${cx - 260}" y2="420" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="3 3" />
            <circle cx="${cx - 120}" cy="460" r="3" fill="#38bdf8" />
            <rect x="${cx - 410}" y="405" width="150" height="30" rx="4" fill="#000000" stroke="#38bdf8" stroke-width="1" />
            <text x="${cx - 400}" y="425" fill="#7dd3fc" font-size="10.5" font-family="monospace" font-weight="bold">CARENAGEM COMPOSTA</text>
          </g>

          <!-- Tag 3: Tanques Criogênicos -->
          <g id="tag-tanks" opacity="0">
            <line x1="${cx + 42}" y1="480" x2="${cx + 220}" y2="480" stroke="#818cf8" stroke-width="1.5" stroke-dasharray="3 3" />
            <circle cx="${cx + 42}" cy="480" r="3" fill="#818cf8" />
            <rect x="${cx + 220}" y="465" width="165" height="30" rx="4" fill="#000000" stroke="#818cf8" stroke-width="1" />
            <text x="${cx + 230}" y="485" fill="#c7d2fe" font-size="10" font-family="monospace" font-weight="bold">PROPULSÃO CRIOGÊNICA</text>
          </g>

          <!-- Tag 4: Conjunto do Motor -->
          <g id="tag-engine" opacity="0">
            <line x1="${cx - 42}" y1="760" x2="${cx - 260}" y2="760" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="3 3" />
            <circle cx="${cx - 42}" cy="760" r="3" fill="#f59e0b" />
            <rect x="${cx - 410}" y="745" width="150" height="30" rx="4" fill="#000000" stroke="#f59e0b" stroke-width="1" />
            <text x="${cx - 400}" y="765" fill="#fcd34d" font-size="10" font-family="monospace" font-weight="bold">MOTOR PRINCIPAL F-1</text>
          </g>
        </svg>
      </div>

      <!-- HUD Flutuante de Engenharia Espacial -->
      <div class="absolute top-6 left-6 pointer-events-none z-30 flex flex-col space-y-1.5 font-mono text-[11px] text-cyan-400/90 bg-black/80 backdrop-blur-lg p-3.5 rounded-xl border border-cyan-500/30 shadow-2xl">
        <div class="flex items-center space-x-2 text-cyan-300 font-bold text-xs uppercase tracking-wider">
          <span class="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#38bdf8]"></span>
          <span>AeroCAD 3D • Foguete em Vista Explodida</span>
        </div>
        <div class="text-gray-300">Subsistema: Veículo Orbital Pesado v4</div>
        <div class="text-gray-400">Pinça: Desmonta peças em eixos X, Y e Z</div>
        <div class="text-gray-400">Posição da Mão: Inspeciona componentes em 3D</div>
        <div class="text-amber-300 pt-1 border-t border-white/10 font-bold flex items-center justify-between">
          <span>Desmontagem: <span id="rocket-hud-progress">0.0%</span></span>
          <span class="text-[10px] text-cyan-300 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-500/30">7 Módulos</span>
        </div>
        <div class="text-gray-400 text-[10px] flex items-center space-x-3 pt-0.5">
          <span>Inclinação: <span id="rocket-hud-pitch" class="text-white">0°</span></span>
          <span>Giro: <span id="rocket-hud-yaw" class="text-white">0°</span></span>
          <span>Torção: <span id="rocket-hud-roll" class="text-white">0°</span></span>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = markup;

  const holoStage = container.querySelector('#rocket-holo-stage') as HTMLElement;
  const fairingLeft = container.querySelector('#fairing-left') as SVGElement;
  const fairingRight = container.querySelector('#fairing-right') as SVGElement;
  const capsuleModule = container.querySelector('#capsule-module') as SVGElement;
  const solarLeft = container.querySelector('#solar-left') as SVGElement;
  const solarRight = container.querySelector('#solar-right') as SVGElement;
  const fuelTanks = container.querySelector('#rocket-fuel-tanks') as SVGElement;
  const engineCluster = container.querySelector('#rocket-engine-cluster') as SVGElement;
  const enginePlume = container.querySelector('#engine-plume') as SVGElement;
  const chassis = container.querySelector('#rocket-chassis') as SVGElement;
  const tagCapsule = container.querySelector('#tag-capsule') as SVGElement;
  const tagFairings = container.querySelector('#tag-fairings') as SVGElement;
  const tagTanks = container.querySelector('#tag-tanks') as SVGElement;
  const tagEngine = container.querySelector('#tag-engine') as SVGElement;

  const hudProgress = container.querySelector('#rocket-hud-progress') as HTMLElement;
  const hudPitch = container.querySelector('#rocket-hud-pitch') as HTMLElement;
  const hudYaw = container.querySelector('#rocket-hud-yaw') as HTMLElement;
  const hudRoll = container.querySelector('#rocket-hud-roll') as HTMLElement;

  const DURATION = 1000;
  const tl = createTimeline({ duration: DURATION, autoplay: false });

  // 1. Carenagens se abrem para os lados em X e giram ligeiramente
  if (fairingLeft) {
    tl.add(fairingLeft, {
      translateX: [0, -180],
      rotate: [0, -15],
      opacity: [0.95, 0.75],
      duration: DURATION,
      ease: 'outCubic',
    }, 0);
  }
  if (fairingRight) {
    tl.add(fairingRight, {
      translateX: [0, 180],
      rotate: [0, 15],
      opacity: [0.95, 0.75],
      duration: DURATION,
      ease: 'outCubic',
    }, 0);
  }

  // 2. Cápsula de comando sobe no eixo Y e se projeta em Z
  if (capsuleModule) {
    tl.add(capsuleModule, {
      translateY: [0, -140],
      scale: [1, 1.15],
      duration: DURATION,
      ease: 'outBack',
    }, 50);
  }

  // Painéis solares abrem para os lados da cápsula
  if (solarLeft) {
    tl.add(solarLeft, {
      scaleX: [0, 1],
      opacity: [0, 1],
      duration: DURATION * 0.7,
      ease: 'outBack',
    }, 200);
  }
  if (solarRight) {
    tl.add(solarRight, {
      scaleX: [0, 1],
      opacity: [0, 1],
      duration: DURATION * 0.7,
      ease: 'outBack',
    }, 200);
  }

  // 3. Tanques de combustível flutuam para frente no Z
  if (fuelTanks) {
    tl.add(fuelTanks, {
      scale: [1, 1.2],
      opacity: [0.8, 1],
      duration: DURATION,
      ease: 'outCubic',
    }, 80);
  }

  // 4. Motores descem no eixo Y
  if (engineCluster) {
    tl.add(engineCluster, {
      translateY: [0, 130],
      duration: DURATION,
      ease: 'outCubic',
    }, 60);
  }

  // Pluma de fogo acende no final
  if (enginePlume) {
    tl.add(enginePlume, {
      opacity: [0, 0.9],
      scaleY: [0.2, 1.4],
      duration: DURATION * 0.5,
      ease: 'outQuad',
    }, 400);
  }

  // 5. Chassis interno ganha transparência e destaque técnico
  if (chassis) {
    tl.add(chassis, {
      opacity: [1, 0.6],
      duration: DURATION,
      ease: 'linear',
    }, 0);
  }

  // 6. Tags técnicas CAD aparecem com stagger
  [tagCapsule, tagFairings, tagTanks, tagEngine].forEach((tag, idx) => {
    if (tag) {
      tl.add(tag, {
        opacity: [0, 1],
        scale: [0.8, 1],
        duration: DURATION * 0.5,
        ease: 'outExpo',
      }, 350 + idx * 80);
    }
  });

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
