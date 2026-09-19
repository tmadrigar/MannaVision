// src/utils/vectorExperiences/swissWatchExperience.ts
import { createTimeline } from 'animejs';
import { AnimeExperienceInstance } from './types';

/**
 * Cria dentes de engrenagem circular paramétrica
 */
function createGearPath(cx: number, cy: number, r: number, teeth: number, holeR: number = 25): string {
  let path = '';
  const step = (Math.PI * 2) / teeth;
  const toothH = 14;

  for (let i = 0; i < teeth; i++) {
    const a1 = i * step;
    const a2 = a1 + step * 0.3;
    const a3 = a1 + step * 0.7;
    const a4 = a1 + step;

    const x1 = cx + Math.cos(a1) * (r - toothH);
    const y1 = cy + Math.sin(a1) * (r - toothH);
    const x2 = cx + Math.cos(a2) * r;
    const y2 = cy + Math.sin(a2) * r;
    const x3 = cx + Math.cos(a3) * r;
    const y3 = cy + Math.sin(a3) * r;
    const x4 = cx + Math.cos(a4) * (r - toothH);
    const y4 = cy + Math.sin(a4) * (r - toothH);

    if (i === 0) path += `M ${x1} ${y1} `;
    path += `L ${x2} ${y2} L ${x3} ${y3} L ${x4} ${y4} `;
  }
  path += 'Z ';
  // Furo central
  path += `M ${cx + holeR} ${cy} A ${holeR} ${holeR} 0 1 0 ${cx - holeR} ${cy} A ${holeR} ${holeR} 0 1 0 ${cx + holeR} ${cy} Z`;
  return path;
}

/**
 * Experiência: Relógio Suíço Tourbillon (Alta Relojoaria Mecânica 3D)
 * Engrenagens com dentes matematicamente interligados giram com rotações proporcionais.
 * A pinça avança o tempo e afasta as pontes de safira e rubi no espaço 3D.
 */
export function createSwissWatchExperience(container: HTMLElement): AnimeExperienceInstance {
  container.innerHTML = '';

  const width = 1000;
  const height = 1000;
  const cx = width / 2;
  const cy = height / 2;

  // Numerais Romanos
  const romanNumerals = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  const numeralsSvg = romanNumerals.map((num, i) => {
    const angle = ((i * 30 - 90) * Math.PI) / 180;
    const x = cx + Math.cos(angle) * 390;
    const y = cy + Math.sin(angle) * 390 + 7;
    return `<text x="${x}" y="${y}" fill="#f59e0b" font-size="22" font-family="serif" font-weight="bold" text-anchor="middle">${num}</text>`;
  }).join('');

  // Caminhos de engrenagens
  const gearMain = createGearPath(cx, cy, 210, 36, 60);
  const gearSmall = createGearPath(cx + 175, cy - 140, 110, 18, 30);
  const gearThird = createGearPath(cx - 160, cy - 130, 130, 24, 35);
  const tourbillonWheel = createGearPath(cx, cy + 180, 95, 16, 25);

  const markup = `
    <div class="relative w-full h-full flex items-center justify-center select-none overflow-hidden bg-radial from-[#131109] via-[#090703] to-black" style="perspective: 1300px; perspective-origin: 50% 50%;">
      
      <!-- PALCO HOLOGRÁFICO 3D -->
      <div
        id="watch-holo-stage"
        class="relative flex items-center justify-center w-[85vmin] h-[85vmin] pointer-events-none"
        style="transform-style: preserve-3d; will-change: transform; transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg);"
      >
        <svg class="absolute w-0 h-0 pointer-events-none">
          <defs>
            <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#fef08a" />
              <stop offset="40%" stop-color="#d97706" />
              <stop offset="70%" stop-color="#b45309" />
              <stop offset="100%" stop-color="#f59e0b" />
            </linearGradient>

            <linearGradient id="steelGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#f8fafc" />
              <stop offset="50%" stop-color="#94a3b8" />
              <stop offset="100%" stop-color="#334155" />
            </linearGradient>

            <linearGradient id="blueSteelGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#38bdf8" />
              <stop offset="50%" stop-color="#0284c7" />
              <stop offset="100%" stop-color="#1e3a8a" />
            </linearGradient>

            <radialGradient id="rubyGrad" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stop-color="#f87171" />
              <stop offset="50%" stop-color="#dc2626" />
              <stop offset="100%" stop-color="#450a0a" />
            </radialGradient>
          </defs>
        </svg>

        <!-- CAMADA 0 (Z: -60px): Placa-base com Acabamento Côtes de Genève -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(-60px); transform-style: preserve-3d;">
          <!-- Caixa Circular de Ouro -->
          <circle cx="${cx}" cy="${cy}" r="455" fill="#0f0c05" stroke="url(#goldGrad)" stroke-width="12" />
          <circle cx="${cx}" cy="${cy}" r="445" fill="none" stroke="#292524" stroke-width="2" />
          <!-- Listras horizontais de usinagem suíça -->
          <g opacity="0.25">
            ${Array.from({ length: 30 }, (_, i) => `
              <line x1="${cx - 430}" y1="${120 + i * 26}" x2="${cx + 430}" y2="${120 + i * 26}" stroke="#d97706" stroke-width="8" stroke-dasharray="16 8" />
            `).join('')}
          </g>
        </svg>

        <!-- CAMADA 1 (Z: -10px): Trem de Engrenagens de Bronze (Rotacionam juntas) -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(-10px); transform-style: preserve-3d;">
          <!-- Engrenagem Central de Ouro (36 Dentes) -->
          <path id="watch-gear-main" d="${gearMain}" fill="url(#goldGrad)" stroke="#78350f" stroke-width="1.5" style="transform-origin: ${cx}px ${cy}px;" />
          
          <!-- Engrenagem Secundária Direita (18 Dentes) -->
          <path id="watch-gear-small" d="${gearSmall}" fill="url(#steelGrad)" stroke="#1e293b" stroke-width="1.5" style="transform-origin: ${cx + 175}px ${cy - 140}px;" />

          <!-- Engrenagem Terceira Esquerda (24 Dentes) -->
          <path id="watch-gear-third" d="${gearThird}" fill="url(#goldGrad)" stroke="#78350f" stroke-width="1.5" style="transform-origin: ${cx - 160}px ${cy - 130}px;" />
        </svg>

        <!-- CAMADA 2 (Z: +50px): Caixa do Tourbillon & Balanço Oscilante -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(50px); transform-style: preserve-3d;">
          <g id="watch-tourbillon-cage" style="transform-origin: ${cx}px ${cy + 180}px;">
            <!-- Gaiola giratória com abertura esqueleto -->
            <circle cx="${cx}" cy="${cy + 180}" r="115" fill="none" stroke="#f59e0b" stroke-width="3" stroke-dasharray="24 12" />
            <path id="watch-tourbillon-wheel" d="${tourbillonWheel}" fill="url(#goldGrad)" stroke="#78350f" stroke-width="1.5" />
            <!-- Mola Espiral do Balanço (Hairspring) -->
            <path
              id="watch-hairspring"
              d="M ${cx} ${cy + 180} m 0 0 c 5 0, 10 5, 10 10 c 0 10, -15 15, -20 15 c -15 0, -25 -15, -25 -25 c 0 -20, 25 -35, 40 -35 c 25 0, 45 25, 45 45 c 0 30, -35 55, -60 55"
              fill="none"
              stroke="#38bdf8"
              stroke-width="2"
            />
          </g>
        </svg>

        <!-- CAMADA 3 (Z: +110px): Pontes Esqueleto com Rubis Sintéticos de Mancal -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(110px); transform-style: preserve-3d;">
          <g id="watch-bridges" style="transform-origin: ${cx}px ${cy}px;">
            <!-- Ponte Curva de Aço Polido -->
            <path d="M ${cx - 180} ${cy - 80} C ${cx - 60} ${cy - 180}, ${cx + 120} ${cy - 180}, ${cx + 200} ${cy - 80} L ${cx + 160} ${cy - 30} C ${cx + 90} ${cy - 120}, ${cx - 40} ${cy - 120}, ${cx - 140} ${cy - 30} Z" fill="url(#steelGrad)" stroke="#475569" stroke-width="2" opacity="0.85" />
            <!-- Rubis de Precisão cravados nos eixos -->
            <circle cx="${cx}" cy="${cy}" r="14" fill="url(#rubyGrad)" stroke="#fef08a" stroke-width="2.5" />
            <circle cx="${cx + 175}" cy="${cy - 140}" r="11" fill="url(#rubyGrad)" stroke="#fef08a" stroke-width="2" />
            <circle cx="${cx - 160}" cy="${cy - 130}" r="11" fill="url(#rubyGrad)" stroke="#fef08a" stroke-width="2" />
            <circle cx="${cx}" cy="${cy + 180}" r="12" fill="url(#rubyGrad)" stroke="#fef08a" stroke-width="2" />
          </g>
        </svg>

        <!-- CAMADA 4 (Z: +180px): Ponteiros de Aço Azulado (Breguet Hands) -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(180px); transform-style: preserve-3d;">
          <!-- Ponteiro das Horas (Azul Royal) -->
          <g id="watch-hand-hours" style="transform-origin: ${cx}px ${cy}px;">
            <path d="M ${cx - 5} ${cy} L ${cx - 3} ${cy - 210} C ${cx - 16} ${cy - 230}, ${cx + 16} ${cy - 230}, ${cx + 3} ${cy - 210} L ${cx + 5} ${cy} Z" fill="url(#blueSteelGrad)" stroke="#38bdf8" stroke-width="1.5" />
            <circle cx="${cx}" cy="${cy - 225}" r="8" fill="#090703" stroke="#38bdf8" stroke-width="2" />
          </g>
          <!-- Ponteiro dos Minutos -->
          <g id="watch-hand-minutes" style="transform-origin: ${cx}px ${cy}px;">
            <path d="M ${cx - 4} ${cy} L ${cx - 2} ${cy - 330} C ${cx - 14} ${cy - 350}, ${cx + 14} ${cy - 350}, ${cx + 2} ${cy - 330} L ${cx + 4} ${cy} Z" fill="url(#blueSteelGrad)" stroke="#38bdf8" stroke-width="1.5" />
            <circle cx="${cx}" cy="${cy - 345}" r="7" fill="#090703" stroke="#38bdf8" stroke-width="2" />
          </g>
          <!-- Pino Central de Fixação -->
          <circle cx="${cx}" cy="${cy}" r="9" fill="#facc15" stroke="#451a03" stroke-width="2" />
        </svg>

        <!-- CAMADA 5 (Z: +250px): Mostrador com Numerais Romanos & Escala de Segundos -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 ${width} ${height}" style="transform: translateZ(250px); transform-style: preserve-3d;">
          <!-- Anel de Horas Flutuante -->
          <circle cx="${cx}" cy="${cy}" r="410" fill="none" stroke="url(#goldGrad)" stroke-width="2" />
          <circle cx="${cx}" cy="${cy}" r="365" fill="none" stroke="#78350f" stroke-width="1.5" />
          <!-- Marcações de Minutos (60 riscas) -->
          ${Array.from({ length: 60 }, (_, i) => {
            const angle = (i * 6 * Math.PI) / 180;
            const r1 = i % 5 === 0 ? 405 : 410;
            const r2 = 418;
            const x1 = cx + Math.cos(angle) * r1;
            const y1 = cy + Math.sin(angle) * r1;
            const x2 = cx + Math.cos(angle) * r2;
            const y2 = cy + Math.sin(angle) * r2;
            return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#facc15" stroke-width="${i % 5 === 0 ? 2 : 1}" />`;
          }).join('')}
          ${numeralsSvg}
        </svg>
      </div>

      <!-- HUD Flutuante de Alta Relojoaria -->
      <div class="absolute top-6 left-6 pointer-events-none z-30 flex flex-col space-y-1.5 font-mono text-[11px] text-amber-300/90 bg-black/80 backdrop-blur-lg p-3.5 rounded-xl border border-amber-500/30 shadow-2xl">
        <div class="flex items-center space-x-2 text-amber-300 font-bold text-xs uppercase tracking-wider">
          <span class="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_#f59e0b]"></span>
          <span>Alta Relojoaria • Tourbillon 3D</span>
        </div>
        <div class="text-gray-300">Calibre: Cronômetro Suíço v4</div>
        <div class="text-gray-400">Pinça: Move ponteiros e engrenagens conectadas</div>
        <div class="text-gray-400">Posição da Mão: Inspeciona as pontes e rubis em 3D</div>
        <div class="text-amber-300 pt-1 border-t border-white/10 font-bold flex items-center justify-between">
          <span>Avanço Horário: <span id="watch-hud-progress">0.0%</span></span>
          <span class="text-[10px] text-amber-300 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-500/30">28.800 Alt/h</span>
        </div>
        <div class="text-gray-400 text-[10px] flex items-center space-x-3 pt-0.5">
          <span>Inclinação: <span id="watch-hud-pitch" class="text-white">0°</span></span>
          <span>Giro: <span id="watch-hud-yaw" class="text-white">0°</span></span>
          <span>Torção: <span id="watch-hud-roll" class="text-white">0°</span></span>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = markup;

  const holoStage = container.querySelector('#watch-holo-stage') as HTMLElement;
  const gearMainEl = container.querySelector('#watch-gear-main') as SVGElement;
  const gearSmallEl = container.querySelector('#watch-gear-small') as SVGElement;
  const gearThirdEl = container.querySelector('#watch-gear-third') as SVGElement;
  const tourbillonCage = container.querySelector('#watch-tourbillon-cage') as SVGElement;
  const tourbillonWheelEl = container.querySelector('#watch-tourbillon-wheel') as SVGElement;
  const hairspring = container.querySelector('#watch-hairspring') as SVGElement;
  const bridges = container.querySelector('#watch-bridges') as SVGElement;
  const handMinutes = container.querySelector('#watch-hand-minutes') as SVGElement;
  const handHours = container.querySelector('#watch-hand-hours') as SVGElement;

  const hudProgress = container.querySelector('#watch-hud-progress') as HTMLElement;
  const hudPitch = container.querySelector('#watch-hud-pitch') as HTMLElement;
  const hudYaw = container.querySelector('#watch-hud-yaw') as HTMLElement;
  const hudRoll = container.querySelector('#watch-hud-roll') as HTMLElement;

  const DURATION = 1000;
  const tl = createTimeline({ duration: DURATION, autoplay: false });

  // 1. Engrenagem principal (36 dentes): gira 180°
  if (gearMainEl) {
    tl.add(gearMainEl, { rotate: [0, 180], duration: DURATION, ease: 'linear' }, 0);
  }

  // 2. Engrenagem secundária (18 dentes): gira no sentido oposto com o dobro da velocidade (-360°)
  if (gearSmallEl) {
    tl.add(gearSmallEl, { rotate: [0, -360], duration: DURATION, ease: 'linear' }, 0);
  }

  // 3. Engrenagem terceira (24 dentes): gira no sentido oposto proporcional (-270°)
  if (gearThirdEl) {
    tl.add(gearThirdEl, { rotate: [0, -270], duration: DURATION, ease: 'linear' }, 0);
  }

  // 4. Gaiola do Tourbillon gira continuamente
  if (tourbillonCage) {
    tl.add(tourbillonCage, { rotate: [0, 360], duration: DURATION, ease: 'linear' }, 0);
  }
  if (tourbillonWheelEl) {
    tl.add(tourbillonWheelEl, { rotate: [0, -720], duration: DURATION, ease: 'linear' }, 0);
  }
  if (hairspring) {
    tl.add(hairspring, { scale: [0.9, 1.15], duration: DURATION * 0.1, ease: 'inOutSine', loop: 10 }, 0);
  }

  // 5. Pontes esqueleto se afastam ligeiramente em escala
  if (bridges) {
    tl.add(bridges, { scale: [1, 1.08], duration: DURATION, ease: 'outCubic' }, 0);
  }

  // 6. Ponteiro de minutos dá 6 voltas completas (2160° = 6 horas)
  if (handMinutes) {
    tl.add(handMinutes, { rotate: [0, 2160], duration: DURATION, ease: 'linear' }, 0);
  }

  // 7. Ponteiro de horas avança 180° (6 horas)
  if (handHours) {
    tl.add(handHours, { rotate: [0, 180], duration: DURATION, ease: 'linear' }, 0);
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
