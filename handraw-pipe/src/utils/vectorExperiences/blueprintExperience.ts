// src/utils/vectorExperiences/blueprintExperience.ts
import { createTimeline } from 'animejs';
import { AnimeExperienceInstance } from './types';

/**
 * Experiência: Blueprint Laser Holográfico (Catedral Cyber & Circuito Neural)
 * Linhas arquitetônicas e condutores quânticos são traçados no ar com strokeDashoffset
 * conforme a pinça dos dedos se abre, erguendo a estrutura em 3D.
 */
export function createBlueprintExperience(container: HTMLElement): AnimeExperienceInstance {
  container.innerHTML = '';

  const width = 1000;
  const height = 1000;
  const cx = width / 2;
  const cy = height / 2;

  // Gerar linhas da Rosácea Gótica Central (vitral com 16 divisões)
  const rosePetalsCount = 16;
  const roseSvg = Array.from({ length: rosePetalsCount }, (_, i) => {
    const angle = (i * 360) / rosePetalsCount;
    return `
      <g transform="rotate(${angle} ${cx} 340)">
        <path
          class="bp-rose-line"
          d="M ${cx} 340 C ${cx - 30} 300, ${cx - 20} 240, ${cx} 220 C ${cx + 20} 240, ${cx + 30} 300, ${cx} 340 Z"
          fill="none"
          stroke="#38bdf8"
          stroke-width="1.8"
          stroke-dasharray="300"
          stroke-dashoffset="300"
        />
        <circle cx="${cx}" cy="220" r="3" fill="#facc15" />
      </g>
    `;
  }).join('');

  // Gerar colunas e arcos verticais
  const columnsCount = 8;
  const columnsSvg = Array.from({ length: columnsCount }, (_, i) => {
    const offsetX = (i - (columnsCount - 1) / 2) * 85;
    const colX = cx + offsetX;
    return `
      <g class="bp-column-group">
        <!-- Coluna Vertical -->
        <line
          class="bp-col-line"
          x1="${colX}"
          y1="820"
          x2="${colX}"
          y2="380"
          stroke="#0284c7"
          stroke-width="2"
          stroke-dasharray="450"
          stroke-dashoffset="450"
        />
        <!-- Nervura transversal -->
        <line
          class="bp-brace-line"
          x1="${colX}"
          y1="600"
          x2="${cx}"
          y2="480"
          stroke="#0ea5e9"
          stroke-width="1"
          stroke-dasharray="200"
          stroke-dashoffset="200"
          opacity="0.6"
        />
      </g>
    `;
  }).join('');

  const markup = `
    <div class="relative w-full h-full flex items-center justify-center select-none overflow-hidden bg-[#020617]" style="perspective: 1300px; perspective-origin: 50% 50%;">
      
      <!-- PALCO HOLOGRÁFICO 3D -->
      <div
        id="bp-holo-stage"
        class="relative flex items-center justify-center w-[85vmin] h-[85vmin] pointer-events-none"
        style="transform-style: preserve-3d; will-change: transform; transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg);"
      >
        <!-- CAMADA 0 (Z: -60px): Malha Quadriculada de Blueprint Arquitetônico -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(-60px); transform-style: preserve-3d;">
          <g opacity="0.3">
            ${Array.from({ length: 21 }, (_, i) => `
              <line x1="${i * 50}" y1="0" x2="${i * 50}" y2="1000" stroke="#0369a1" stroke-width="${i % 5 === 0 ? 1.5 : 0.5}" />
              <line x1="0" y1="${i * 50}" x2="1000" y2="${i * 50}" stroke="#0369a1" stroke-width="${i % 5 === 0 ? 1.5 : 0.5}" />
            `).join('')}
            <circle cx="${cx}" cy="${cy}" r="450" stroke="#0284c7" stroke-width="1.5" stroke-dasharray="8 8" fill="none" />
          </g>
        </svg>

        <!-- CAMADA 1 (Z: -10px): Fundação da Catedral & Linhas de Nível -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(-10px); transform-style: preserve-3d;">
          <g id="bp-foundation">
            <!-- Linha de base do solo -->
            <line id="bp-ground-line" x1="120" y1="820" x2="880" y2="820" stroke="#38bdf8" stroke-width="3" stroke-dasharray="760" stroke-dashoffset="760" />
            <line x1="180" y1="840" x2="820" y2="840" stroke="#0284c7" stroke-width="1.5" stroke-dasharray="640" stroke-dashoffset="640" />
            <!-- Degraus em perspectiva -->
            <polygon points="260,820 740,820 700,860 300,860" fill="none" stroke="#0ea5e9" stroke-width="1.5" opacity="0.4" />
          </g>
        </svg>

        <!-- CAMADA 2 (Z: +40px): Colunatas & Paredes Estruturais -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(40px); transform-style: preserve-3d;">
          ${columnsSvg}
        </svg>

        <!-- CAMADA 3 (Z: +100px): Arcos Ogivais Góticos & Abóbada -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(100px); transform-style: preserve-3d;">
          <g id="bp-arches">
            <!-- Grande Arco Ogival Principal -->
            <path
              id="bp-main-arch"
              d="M ${cx - 280} 820 L ${cx - 280} 460 C ${cx - 280} 240, ${cx - 100} 140, ${cx} 110 C ${cx + 100} 140, ${cx + 280} 240, ${cx + 280} 460 L ${cx + 280} 820"
              fill="none"
              stroke="#38bdf8"
              stroke-width="3"
              stroke-dasharray="1900"
              stroke-dashoffset="1900"
            />
            <!-- Arco Interno Concêntrico -->
            <path
              id="bp-inner-arch"
              d="M ${cx - 190} 820 L ${cx - 190} 480 C ${cx - 190} 320, ${cx - 70} 220, ${cx} 190 C ${cx + 70} 220, ${cx + 190} 320, ${cx + 190} 480 L ${cx + 190} 820"
              fill="none"
              stroke="#818cf8"
              stroke-width="2"
              stroke-dasharray="1400"
              stroke-dashoffset="1400"
            />
            <!-- Pórtico Central de Entrada -->
            <path
              id="bp-portal"
              d="M ${cx - 85} 820 L ${cx - 85} 640 C ${cx - 85} 560, ${cx} 510, ${cx} 510 C ${cx} 510, ${cx + 85} 560, ${cx + 85} 640 L ${cx + 85} 820"
              fill="none"
              stroke="#f59e0b"
              stroke-width="2"
              stroke-dasharray="700"
              stroke-dashoffset="700"
            />
          </g>
        </svg>

        <!-- CAMADA 4 (Z: +160px): Rosácea Central Holográfica (Vitral Laser) -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(160px); transform-style: preserve-3d;">
          <g id="bp-rose-window" style="transform-origin: ${cx}px 340px;">
            <!-- Anel externo da rosácea -->
            <circle
              id="bp-rose-circle"
              cx="${cx}"
              cy="340"
              r="120"
              fill="none"
              stroke="#38bdf8"
              stroke-width="2.5"
              stroke-dasharray="760"
              stroke-dashoffset="760"
            />
            <circle
              cx="${cx}"
              cy="340"
              r="60"
              fill="none"
              stroke="#f59e0b"
              stroke-width="1.8"
              stroke-dasharray="380"
              stroke-dashoffset="380"
            />
            ${roseSvg}
          </g>
        </svg>

        <!-- CAMADA 5 (Z: +220px): Circuito Neural & Trilhas Quânticas de Energia -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(220px); transform-style: preserve-3d;">
          <g id="bp-neural-circuits">
            <path
              id="circuit-1"
              d="M 120 780 L 220 780 L 290 710 L 290 520 L 380 430 L 440 430 L 440 370"
              fill="none"
              stroke="#10b981"
              stroke-width="2"
              stroke-dasharray="700"
              stroke-dashoffset="700"
            />
            <path
              id="circuit-2"
              d="M 880 780 L 780 780 L 710 710 L 710 520 L 620 430 L 560 430 L 560 370"
              fill="none"
              stroke="#10b981"
              stroke-width="2"
              stroke-dasharray="700"
              stroke-dashoffset="700"
            />
            <!-- Nós de terminação pulsantes -->
            <circle cx="120" cy="780" r="4" fill="#34d399" />
            <circle cx="880" cy="780" r="4" fill="#34d399" />
            <circle cx="${cx}" cy="340" r="8" fill="#38bdf8" />
          </g>
        </svg>

        <!-- CAMADA 6 (Z: +270px): Pináculo Laser, Cotas de Medição e Telemetria -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(270px); transform-style: preserve-3d;">
          <!-- Pináculo Superior -->
          <line id="bp-spire" x1="${cx}" y1="110" x2="${cx}" y2="30" stroke="#facc15" stroke-width="3" stroke-dasharray="100" stroke-dashoffset="100" />
          <polygon points="${cx},20 ${cx - 6},35 ${cx + 6},35" fill="#facc15" />

          <!-- Linhas de Cotas Técnicas (Dimensões) -->
          <g id="bp-dimensions" opacity="0">
            <!-- Cota de Altura -->
            <line x1="${cx + 310}" y1="820" x2="${cx + 310}" y2="110" stroke="#64748b" stroke-width="1.5" stroke-dasharray="4 4" />
            <line x1="${cx + 300}" y1="110" x2="${cx + 320}" y2="110" stroke="#38bdf8" stroke-width="1.5" />
            <line x1="${cx + 300}" y1="820" x2="${cx + 320}" y2="820" stroke="#38bdf8" stroke-width="1.5" />
            <text x="${cx + 330}" y="470" fill="#38bdf8" font-size="12" font-family="monospace" font-weight="bold">ALTURA: 71,0m</text>

            <!-- Cota de Largura da Nave -->
            <line x1="${cx - 280}" y1="880" x2="${cx + 280}" y2="880" stroke="#64748b" stroke-width="1.5" stroke-dasharray="4 4" />
            <line x1="${cx - 280}" y1="870" x2="${cx - 280}" y2="890" stroke="#38bdf8" stroke-width="1.5" />
            <line x1="${cx + 280}" y1="870" x2="${cx + 280}" y2="890" stroke="#38bdf8" stroke-width="1.5" />
            <text x="${cx}" y="910" fill="#38bdf8" font-size="12" font-family="monospace" font-weight="bold" text-anchor="middle">VÃO LIVRE: 56,0m</text>
          </g>
        </svg>
      </div>

      <!-- HUD Flutuante de Blueprint Laser -->
      <div class="absolute top-6 left-6 pointer-events-none z-30 flex flex-col space-y-1.5 font-mono text-[11px] text-cyan-400/90 bg-black/80 backdrop-blur-lg p-3.5 rounded-xl border border-cyan-500/30 shadow-2xl">
        <div class="flex items-center space-x-2 text-cyan-300 font-bold text-xs uppercase tracking-wider">
          <span class="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#38bdf8]"></span>
          <span>Blueprint Laser 3D • Catedral Neural</span>
        </div>
        <div class="text-gray-300">Modo: Impressão Arquitetônica Vetorial</div>
        <div class="text-gray-400">Pinça: Traça linhas e ergue a estrutura no ar</div>
        <div class="text-gray-400">Posição da Mão: Navega na perspectiva 3D da catedral</div>
        <div class="text-amber-300 pt-1 border-t border-white/10 font-bold flex items-center justify-between">
          <span>Traçado: <span id="bp-hud-progress">0.0%</span></span>
          <span class="text-[10px] text-emerald-300 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30">Malha Vetorial</span>
        </div>
        <div class="text-gray-400 text-[10px] flex items-center space-x-3 pt-0.5">
          <span>Inclinação: <span id="bp-hud-pitch" class="text-white">0°</span></span>
          <span>Giro: <span id="bp-hud-yaw" class="text-white">0°</span></span>
          <span>Torção: <span id="bp-hud-roll" class="text-white">0°</span></span>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = markup;

  const holoStage = container.querySelector('#bp-holo-stage') as HTMLElement;
  const groundLine = container.querySelector('#bp-ground-line') as SVGElement;
  const columnLines = container.querySelectorAll('.bp-col-line');
  const braceLines = container.querySelectorAll('.bp-brace-line');
  const mainArch = container.querySelector('#bp-main-arch') as SVGElement;
  const innerArch = container.querySelector('#bp-inner-arch') as SVGElement;
  const portal = container.querySelector('#bp-portal') as SVGElement;
  const roseCircle = container.querySelector('#bp-rose-circle') as SVGElement;
  const roseLines = container.querySelectorAll('.bp-rose-line');
  const roseWindowGroup = container.querySelector('#bp-rose-window') as SVGElement;
  const circuit1 = container.querySelector('#circuit-1') as SVGElement;
  const circuit2 = container.querySelector('#circuit-2') as SVGElement;
  const spire = container.querySelector('#bp-spire') as SVGElement;
  const dimensions = container.querySelector('#bp-dimensions') as SVGElement;

  const hudProgress = container.querySelector('#bp-hud-progress') as HTMLElement;
  const hudPitch = container.querySelector('#bp-hud-pitch') as HTMLElement;
  const hudYaw = container.querySelector('#bp-hud-yaw') as HTMLElement;
  const hudRoll = container.querySelector('#bp-hud-roll') as HTMLElement;

  const DURATION = 1000;
  const tl = createTimeline({ duration: DURATION, autoplay: false });

  // 1. Linha do solo traçada primeiro
  if (groundLine) {
    tl.add(groundLine, {
      strokeDashoffset: [760, 0],
      duration: DURATION * 0.25,
      ease: 'inOutQuad',
    }, 0);
  }

  // 2. Colunas sobem verticalmente
  columnLines.forEach((col, idx) => {
    tl.add(col, {
      strokeDashoffset: [450, 0],
      duration: DURATION * 0.45,
      ease: 'outQuad',
    }, 100 + idx * 25);
  });

  // Nervuras de contraventamento
  braceLines.forEach((brace, idx) => {
    tl.add(brace, {
      strokeDashoffset: [200, 0],
      duration: DURATION * 0.35,
      ease: 'outQuad',
    }, 250 + idx * 20);
  });

  // 3. Arcos góticos se desenham a partir do solo até o cume
  if (mainArch) {
    tl.add(mainArch, {
      strokeDashoffset: [1900, 0],
      duration: DURATION * 0.6,
      ease: 'inOutCubic',
    }, 200);
  }

  if (innerArch) {
    tl.add(innerArch, {
      strokeDashoffset: [1400, 0],
      duration: DURATION * 0.55,
      ease: 'inOutCubic',
    }, 300);
  }

  if (portal) {
    tl.add(portal, {
      strokeDashoffset: [700, 0],
      duration: DURATION * 0.4,
      ease: 'outCubic',
    }, 350);
  }

  // 4. Rosácea circular e pétalas geométricas traçadas
  if (roseCircle) {
    tl.add(roseCircle, {
      strokeDashoffset: [760, 0],
      duration: DURATION * 0.45,
      ease: 'inOutQuad',
    }, 400);
  }

  roseLines.forEach((rLine, idx) => {
    tl.add(rLine, {
      strokeDashoffset: [300, 0],
      duration: DURATION * 0.4,
      ease: 'outBack',
    }, 450 + idx * 10);
  });

  if (roseWindowGroup) {
    tl.add(roseWindowGroup, {
      rotate: [0, 90],
      duration: DURATION * 0.6,
      ease: 'outCubic',
    }, 450);
  }

  // 5. Circuitos neurais verdes fluem
  if (circuit1) {
    tl.add(circuit1, {
      strokeDashoffset: [700, 0],
      duration: DURATION * 0.45,
      ease: 'linear',
    }, 550);
  }
  if (circuit2) {
    tl.add(circuit2, {
      strokeDashoffset: [700, 0],
      duration: DURATION * 0.45,
      ease: 'linear',
    }, 550);
  }

  // 6. Pináculo dourado e cotas
  if (spire) {
    tl.add(spire, {
      strokeDashoffset: [100, 0],
      duration: DURATION * 0.25,
      ease: 'outBack',
    }, 750);
  }

  if (dimensions) {
    tl.add(dimensions, {
      opacity: [0, 1],
      duration: DURATION * 0.25,
      ease: 'linear',
    }, 800);
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
