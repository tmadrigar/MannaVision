// src/utils/timeExperiences.ts
import {
  createChronosAnimeExperience,
  createExplodedRocketExperience,
  createBlueprintExperience,
  createCosmicScaleExperience,
  createSwissWatchExperience,
  createJarvisHudExperience,
  AnimeExperienceInstance,
} from './vectorExperiences';

export type ExperienceType = 'frame_sequence' | 'procedural' | 'video' | 'anime';

export interface TimeExperience {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  category: 'natureza' | 'espaco' | 'ciencia' | 'personalizado';
  icon: string;
  type: ExperienceType;
  videoUrl?: string;
  frames?: string[];
  frameCount?: number;
  startLabel: string;
  endLabel: string;
  audioUrl?: string;
  renderProcedural?: (ctx: CanvasRenderingContext2D, progress: number, width: number, height: number) => void;
  createAnimeInstance?: (container: HTMLElement) => AnimeExperienceInstance;
}

/**
 * Manifesto oficial de experiências temporais
 */
export const TIME_EXPERIENCES: TimeExperience[] = [
  {
    id: 'chronos_anime',
    title: 'Cronógrafo Quântico',
    subtitle: 'Anime.js v4 Vetorial 3D',
    description: 'Timeline vetorial em SVG com 7 camadas de parallax. Controle rotações, pétalas e abertura de íris mecânica em tempo real.',
    category: 'ciencia',
    icon: '⚡',
    type: 'anime',
    createAnimeInstance: createChronosAnimeExperience,
    startLabel: 'Casulo / Fechado',
    endLabel: 'Plenitude / Aberto',
  },
  {
    id: 'exploded_rocket',
    title: 'Foguete Explodido 3D',
    subtitle: 'CAD Aeroespacial Desmontável',
    description: 'Vista explodida de engenharia. Abra os dedos para desmontar o foguete em carenagens, tanques criogênicos, módulos e motores no espaço.',
    category: 'espaco',
    icon: '🚀',
    type: 'anime',
    createAnimeInstance: createExplodedRocketExperience,
    startLabel: 'Montado / Selado',
    endLabel: 'Vista Explodida 3D',
  },
  {
    id: 'blueprint_laser',
    title: 'Blueprint Laser 3D',
    subtitle: 'Catedral & Circuito Neural',
    description: 'Impressão arquitetônica no ar via strokeDashoffset. Seus dedos traçam colunas, arcos góticos, rosácea e circuitos neurais em 3D.',
    category: 'ciencia',
    icon: '🏛️',
    type: 'anime',
    createAnimeInstance: createBlueprintExperience,
    startLabel: 'Solo / Grade Vazia',
    endLabel: 'Catedral Completa',
  },
  {
    id: 'cosmic_scale',
    title: 'Escala Cósmica 3D',
    subtitle: 'Do Átomo à Galáxia',
    description: 'Jornada contínua de 31 ordens de magnitude. Abra a pinça para viajar do núcleo atômico ao DNA, célula viva, Terra e galáxia espiral.',
    category: 'ciencia',
    icon: '🧬',
    type: 'anime',
    createAnimeInstance: createCosmicScaleExperience,
    startLabel: 'Átomo (10⁻¹⁰ m)',
    endLabel: 'Galáxia (10²¹ m)',
  },
  {
    id: 'swiss_watch',
    title: 'Relógio Tourbillon 3D',
    subtitle: 'Haute Horlogerie Suíça',
    description: 'Trem de engrenagens mecânicas interligadas, balanço oscilante e ponteiros de aço azulado flutuando entre pontes esqueleto e rubis.',
    category: 'ciencia',
    icon: '⌚',
    type: 'anime',
    createAnimeInstance: createSwissWatchExperience,
    startLabel: 'Hora 00:00 (Repouso)',
    endLabel: 'Avanço 06 Horas',
  },
  {
    id: 'jarvis_hud',
    title: 'Interface JARVIS 3D',
    subtitle: 'Cyberpunk Tactical HUD',
    description: 'Terminal holográfico militar com anéis concêntricos de azimute, waveforms de energia, mira tática e orbe arc reactor.',
    category: 'ciencia',
    icon: '🤖',
    type: 'anime',
    createAnimeInstance: createJarvisHudExperience,
    startLabel: 'Standby / Núcleo',
    endLabel: 'Engajamento Total',
  },
  {
    id: 'fantasy_flower',
    title: 'Flor Fantasia',
    subtitle: 'Timelapse Macro',
    description: 'Brotar e desabrochar contínuo de uma flor mágica em timelapse cinematográfico.',
    category: 'natureza',
    icon: '🌺',
    type: 'frame_sequence',
    frames: Array.from({ length: 141 }, (_, i) => `/experiences/fantasy_flower/frame_${String(i).padStart(3, '0')}.jpg`),
    frameCount: 141,
    startLabel: 'Semente / Broto',
    endLabel: 'Flor Desabrochada',
  },
  {
    id: 'rocket',
    title: 'Lançamento Espacial',
    subtitle: 'Astronáutica & Foguete',
    description: 'Controle a aceleração, ignição e lançamento do foguete rumo ao espaço com a pinça das mãos.',
    category: 'espaco',
    icon: '🚀',
    type: 'frame_sequence',
    frames: Array.from({ length: 141 }, (_, i) => `/experiences/rocket/frame_${String(i).padStart(3, '0')}.jpg`),
    frameCount: 141,
    startLabel: 'Plataforma / Ignição',
    endLabel: 'Órbita Terrestre',
  },
  {
    id: 'system_solar',
    title: 'Sistema Solar',
    subtitle: 'Alinhamento Planetário',
    description: 'Controle o alinhamento dos planetas e a revelação do Sol com os gestos da sua mão.',
    category: 'espaco',
    icon: '🪐',
    type: 'frame_sequence',
    frames: Array.from({ length: 141 }, (_, i) => `/experiences/system_solar/frame_${String(i).padStart(3, '0')}.jpg`),
    frameCount: 141,
    startLabel: 'Terra em Órbita',
    endLabel: 'Alinhamento & Sol',
  },
  {
    id: 'sound_guitar',
    title: 'Som & Guitarra',
    subtitle: 'Gravador Analógico & Volume',
    description: 'Controle o volume da guitarra e o gravador analógico de 0% a 100% com os gestos da sua mão.',
    category: 'ciencia',
    icon: '🎸',
    type: 'frame_sequence',
    frames: Array.from({ length: 141 }, (_, i) => `/experiences/sound_guitar/frame_${String(i).padStart(3, '0')}.jpg`),
    frameCount: 141,
    audioUrl: '/audio/guitar_loop.mp3',
    startLabel: 'Silêncio (0% Vol)',
    endLabel: 'Volume Máx (100%)',
  },
  {
    id: 'infinite_zoom',
    title: 'Zoom Infinito',
    subtitle: 'Escala Cósmica',
    description: 'Do sorriso de Louise até a escala máxima do Universo observável (10 bilhões de anos-luz).',
    category: 'ciencia',
    icon: '🔍',
    type: 'frame_sequence',
    frames: Array.from({ length: 150 }, (_, i) => `/experiences/infinite_zoom/frame_${String(i).padStart(3, '0')}.jpg`),
    frameCount: 150,
    startLabel: 'Sorriso (10 cm)',
    endLabel: 'Universo (10 Bi Anos-luz)',
  },
];

