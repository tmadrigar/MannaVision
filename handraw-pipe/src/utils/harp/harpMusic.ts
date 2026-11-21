// src/utils/harp/harpMusic.ts
//
// Teoria musical da Harpa de Luz: comprimento da corda -> nota.
// Física de corda: a frequência é inversamente proporcional ao comprimento
// (metade do comprimento = uma oitava acima). A nota bruta é então ajustada
// para a escala escolhida, para que qualquer corda soe bem com as outras.

export type ScaleId = 'pentatonic' | 'major' | 'minor' | 'hirajoshi' | 'chromatic';

export interface ScaleDef {
  id: ScaleId;
  label: string;
  steps: number[];
}

export const SCALES: ScaleDef[] = [
  { id: 'pentatonic', label: 'Pentatônica', steps: [0, 2, 4, 7, 9] },
  { id: 'major', label: 'Maior', steps: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'minor', label: 'Menor', steps: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'hirajoshi', label: 'Hirajoshi (japonesa)', steps: [0, 2, 3, 7, 8] },
  { id: 'chromatic', label: 'Cromática (livre)', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
];

export const NOTE_NAMES = ['Dó', 'Dó♯', 'Ré', 'Ré♯', 'Mi', 'Fá', 'Fá♯', 'Sol', 'Sol♯', 'Lá', 'Lá♯', 'Si'];

// Comprimento em "alturas de tela" (1.0 = altura inteira da imagem da câmera)
export const L_REF = 0.6;    // corda de 60% da altura...
export const MIDI_REF = 57;  // ...toca Lá3 (220 Hz)
export const MIDI_MIN = 40;  // Mi2
export const MIDI_MAX = 88;  // Mi6

export function getScale(id: ScaleId): ScaleDef {
  return SCALES.find((s) => s.id === id) || SCALES[0];
}

/** Nota contínua (não quantizada) para um comprimento de corda. */
export function lengthToMidiRaw(length: number): number {
  const L = Math.max(0.005, length);
  const m = MIDI_REF + 12 * Math.log2(L_REF / L);
  return Math.max(MIDI_MIN, Math.min(MIDI_MAX, m));
}

/** Comprimento que produz exatamente a nota MIDI dada. */
export function midiToLength(midi: number): number {
  return L_REF * Math.pow(2, (MIDI_REF - midi) / 12);
}

/** Ajusta uma nota contínua para a nota mais próxima dentro da escala. */
export function snapToScale(midi: number, root: number, scale: ScaleDef): number {
  const center = Math.round(midi);
  let best = center;
  let bestDist = Infinity;
  for (let d = -7; d <= 7; d++) {
    const m = center + d;
    const pc = (((m - root) % 12) + 12) % 12;
    if (!scale.steps.includes(pc)) continue;
    const dist = Math.abs(m - midi);
    if (dist < bestDist) {
      bestDist = dist;
      best = m;
    }
  }
  return Math.max(MIDI_MIN, Math.min(MIDI_MAX, best));
}

export function lengthToMidi(length: number, root: number, scale: ScaleDef): number {
  return snapToScale(lengthToMidiRaw(length), root, scale);
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function noteName(midi: number): string {
  const m = Math.round(midi);
  return `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

/** Matiz (0-360) por classe de nota: cada nota tem sua cor fixa no círculo cromático. */
export function noteHue(midi: number): number {
  const pc = ((Math.round(midi) % 12) + 12) % 12;
  // Ciclo de quintas no círculo de cores: notas vizinhas na harmonia ficam com cores próximas
  return ((pc * 7) % 12) * 30;
}

/** Notas da escala a partir de uma nota inicial, subindo `count` graus. */
export function scaleRun(startMidi: number, root: number, scale: ScaleDef, count: number): number[] {
  const out: number[] = [];
  let m = startMidi;
  while (out.length < count && m <= MIDI_MAX) {
    const pc = (((m - root) % 12) + 12) % 12;
    if (scale.steps.includes(pc)) out.push(m);
    m++;
  }
  return out;
}
