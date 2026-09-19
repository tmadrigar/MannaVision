// src/utils/timeExperiences.ts

export type ExperienceType = 'frame_sequence' | 'procedural' | 'video';

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
}

/**
 * Manifesto oficial de experiências temporais
 */
export const TIME_EXPERIENCES: TimeExperience[] = [
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

