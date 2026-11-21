// src/utils/harp/harpController.ts
//
// Cérebro da Harpa de Luz: transforma mãos rastreadas (ou o mouse) em ações musicais.
//
//  • Pinça nas duas mãos ........ estica uma corda entre as duas pinças; soltar fixa a corda
//  • Pinça numa mão e arrastar .. estica uma corda a partir do ponto onde a pinça fechou
//  • Dedo atravessando a corda .. toca a corda (velocidade do dedo = força do toque)
//  • Mão aberta varrendo ........ toca várias cordas em sequência (arpejo)
//  • Punho fechado sobre a corda  apaga a corda depois de ~0,7 s
//
// Todas as coordenadas estão no espaço "mundo" de harpStrings.ts (1.0 = altura da imagem).

import {
  HarpString, Spark, Vec2, dist, sideAndParam, pointSegmentDistance,
  exciteString, spawnSparks, spawnDissolve, updateSparks, DISSOLVE_MS,
} from './harpStrings';
import { ScaleDef, lengthToMidi, midiToLength, noteHue, scaleRun, getScale } from './harpMusic';

export type PluckFingers = 'index' | 'all';
export type HarpGesture = 'none' | 'play' | 'draft' | 'erase';

export interface HarpCallbacks {
  onPluck: (s: HarpString, position: number, velocity: number) => void;
  onCreate: (s: HarpString) => void;
  onDraftNote: (midi: number, draft: HarpDraft) => void;
  onRemove: (s: HarpString) => void;
}

export interface HarpDraft {
  mode: 'one' | 'two' | 'mouse';
  keys: string[];
  a: Vec2;
  b: Vec2;
  midi: number;
}

export interface EraseIndicator {
  palm: Vec2;
  progress: number; // 0..1
  stringId: number | null;
}

interface HandState {
  key: string;
  pts: Vec2[];
  palm: Vec2;
  pinched: boolean;
  lastPinchedAt: number;
  lastSeen: number;
  fist: boolean;
  locked: boolean; // aguarda soltar a pinça antes de começar outra corda
  prevTips: Map<number, { p: Vec2; t: number }>;
  eraseTarget: number | null;
  eraseSince: number;
}

// Pinça normalizada (distância polegar-indicador / tamanho da palma) com histerese
const PINCH_ENTER = 0.3;
const PINCH_EXIT = 0.45;
const PINCH_GRACE_MS = 110;  // tolera 2–3 quadros perdidos sem "soltar" a corda
const HAND_LOST_MS = 160;
const MIN_LENGTH = 0.05;
const MAX_STRINGS = 40;
const SIDE_DEADBAND = 0.006; // evita que o tremor do rastreamento dispare toques
const PLUCK_COOLDOWN_MS = 75;
const ERASE_DIST = 0.07;
const ERASE_HOLD_MS = 700;
const PALM_IDS = [0, 5, 9, 13, 17];

export class HarpController {
  strings: HarpString[] = [];
  sparks: Spark[] = [];
  draft: HarpDraft | null = null;
  erase: EraseIndicator[] = [];
  gesture: HarpGesture = 'none';

  root = 0; // Dó
  scale: ScaleDef = getScale('pentatonic');
  pluckFingers: PluckFingers = 'all';

  private hands = new Map<string, HandState>();
  private sideMem = new Map<string, number>();
  private mousePrev: { p: Vec2; t: number } | null = null;
  private nextId = 1;
  private cb: HarpCallbacks;

  constructor(cb: HarpCallbacks) {
    this.cb = cb;
  }

  /** Mãos rastreadas neste quadro (pontos já em coordenadas de mundo). */
  processHands(list: { key: string; pts: Vec2[] }[], now: number) {
    // 1. Atualiza o estado de cada mão vista
    for (const { key, pts } of list) {
      let st = this.hands.get(key);
      if (!st) {
        st = {
          key, pts, palm: pts[0], pinched: false, lastPinchedAt: -1e9, lastSeen: now, fist: false,
          locked: false, prevTips: new Map(), eraseTarget: null, eraseSince: now,
        };
        this.hands.set(key, st);
      }
      st.pts = pts;
      st.lastSeen = now;
      let px = 0;
      let py = 0;
      for (const i of PALM_IDS) { px += pts[i].x; py += pts[i].y; }
      st.palm = { x: px / PALM_IDS.length, y: py / PALM_IDS.length };

      const scale = Math.max(0.01, dist(pts[0], pts[9]));
      const pinchNorm = dist(pts[4], pts[8]) / scale;
      st.fist = isFist(pts);
      if (st.fist) st.pinched = false;
      else if (!st.pinched && pinchNorm < PINCH_ENTER) st.pinched = true;
      else if (st.pinched && pinchNorm > PINCH_EXIT) st.pinched = false;
      if (st.pinched) st.lastPinchedAt = now;
    }

    // 2. Esquece mãos que sumiram
    for (const [key, st] of this.hands) {
      if (now - st.lastSeen > HAND_LOST_MS) {
        this.hands.delete(key);
        this.forgetSides(key);
      }
    }

    // 3. Construção de cordas pela pinça
    const held = [...this.hands.values()]
      .filter((h) => !h.fist && now - h.lastPinchedAt < PINCH_GRACE_MS)
      .sort((a, b) => (a.key < b.key ? -1 : 1));

    if (this.draft?.mode !== 'mouse') {
      if (held.length >= 2) {
        const [h1, h2] = held;
        if (!this.draft || this.draft.mode !== 'two') {
          this.draft = { mode: 'two', keys: [h1.key, h2.key], a: pinchPoint(h1), b: pinchPoint(h2), midi: -1 };
        }
        // Durante a carência de soltura a ponta fica congelada (os dedos abrindo deslocariam a ponta)
        if (h1.pinched) this.draft.a = pinchPoint(h1);
        if (h2.pinched) this.draft.b = pinchPoint(h2);
        this.updateDraftNote();
      } else if (held.length === 1) {
        const h = held[0];
        if (this.draft?.mode === 'two') {
          this.commitDraft(now);
          h.locked = true;
        } else if (this.draft?.mode === 'one' && this.draft.keys[0] === h.key) {
          if (h.pinched) this.draft.b = pinchPoint(h);
          this.updateDraftNote();
        } else if (!h.locked) {
          const p = pinchPoint(h);
          this.draft = { mode: 'one', keys: [h.key], a: p, b: { ...p }, midi: -1 };
        }
      } else if (this.draft) {
        this.commitDraft(now);
      }
    }
    for (const h of this.hands.values()) {
      if (!held.includes(h)) h.locked = false;
    }

    // 4. Toques e apagar
    this.erase = [];
    let anyPlaying = false;
    let anyErasing = false;
    for (const h of this.hands.values()) {
      if (h.lastSeen !== now) continue; // só processa mãos vistas neste quadro
      const isHeld = held.includes(h);
      if (isHeld || h.fist) {
        this.forgetSides(h.key);
        h.prevTips.clear();
      } else {
        anyPlaying = true;
        const tips = this.pluckFingers === 'index' ? [8] : [8, 12, 16, 20];
        for (const tip of tips) {
          const p = h.pts[tip];
          const prev = h.prevTips.get(tip);
          const speed = prev ? dist(p, prev.p) / Math.max(0.008, (now - prev.t) / 1000) : 0;
          this.checkTip(`${h.key}:${tip}`, p, speed, now);
          h.prevTips.set(tip, { p, t: now });
        }
      }

      if (h.fist) {
        anyErasing = true;
        let best: HarpString | null = null;
        let bestD = ERASE_DIST;
        for (const s of this.strings) {
          if (s.removingAt) continue;
          const d = pointSegmentDistance(h.palm, s.a, s.b);
          if (d < bestD) { bestD = d; best = s; }
        }
        const id = best ? best.id : null;
        if (id !== h.eraseTarget) {
          h.eraseTarget = id;
          h.eraseSince = now;
        }
        const progress = id === null ? 0 : Math.min(1, (now - h.eraseSince) / ERASE_HOLD_MS);
        if (best && progress >= 1) {
          this.removeString(best, now);
          h.eraseTarget = null;
        }
        this.erase.push({ palm: h.palm, progress, stringId: id });
      } else {
        h.eraseTarget = null;
      }
    }

    this.gesture = this.draft ? 'draft' : anyErasing ? 'erase' : anyPlaying ? 'play' : 'none';
  }

  // --- MOUSE (para usar sem câmera) -------------------------------------------

  mouseDown(p: Vec2) {
    this.draft = { mode: 'mouse', keys: ['mouse'], a: p, b: { ...p }, midi: -1 };
    this.forgetSides('mouse');
  }

  mouseMove(p: Vec2, now: number) {
    if (this.draft?.mode === 'mouse') {
      this.draft.b = p;
      this.updateDraftNote();
      this.mousePrev = null;
      return;
    }
    const prev = this.mousePrev;
    const speed = prev ? dist(p, prev.p) / Math.max(0.008, (now - prev.t) / 1000) : 0;
    this.checkTip('mouse:0', p, speed * 0.6, now);
    this.mousePrev = { p, t: now };
  }

  mouseUp(now: number) {
    if (this.draft?.mode === 'mouse') this.commitDraft(now);
  }

  mouseLeave() {
    this.mousePrev = null;
    this.forgetSides('mouse');
    if (this.draft?.mode === 'mouse') this.draft = null;
  }

  /** Remove a corda mais próxima do ponto (clique direito). */
  removeNear(p: Vec2, now: number): boolean {
    let best: HarpString | null = null;
    let bestD = 0.04;
    for (const s of this.strings) {
      if (s.removingAt) continue;
      const d = pointSegmentDistance(p, s.a, s.b);
      if (d < bestD) { bestD = d; best = s; }
    }
    if (best) this.removeString(best, now);
    return !!best;
  }

  // --- AÇÕES ---------------------------------------------------------------------

  update(dt: number, now: number) {
    updateSparks(this.sparks, dt);
    if (this.strings.some((s) => s.removingAt && now - s.removingAt > DISSOLVE_MS)) {
      this.strings = this.strings.filter((s) => !(s.removingAt && now - s.removingAt > DISSOLVE_MS));
    }
  }

  /** Toca a corda programaticamente (ex.: teclado). */
  pluck(s: HarpString, position: number, velocity: number, now: number) {
    exciteString(s, now, velocity, position);
    spawnSparks(this.sparks, s, position, velocity);
    this.cb.onPluck(s, position, velocity);
  }

  setTuning(root: number, scale: ScaleDef) {
    this.root = root;
    this.scale = scale;
    for (const s of this.strings) {
      s.midi = lengthToMidi(s.length, root, scale);
      s.hue = noteHue(s.midi);
    }
  }

  activeStrings(): HarpString[] {
    return this.strings.filter((s) => !s.removingAt);
  }

  undo(now: number) {
    const live = this.activeStrings();
    const last = live[live.length - 1];
    if (last) this.removeString(last, now);
  }

  clear(now: number) {
    for (const s of this.activeStrings()) this.removeString(s, now);
  }

  /** Monta uma harpa pronta: 8 cordas verticais subindo pela escala. */
  addPresetHarp(aspect: number, now: number) {
    const startMidi = 60 + this.root - (this.root > 4 ? 12 : 0);
    const notes = scaleRun(startMidi, this.root, this.scale, 8);
    const bottom = 0.8;
    const x0 = aspect * 0.28;
    const x1 = aspect * 0.72;
    notes.forEach((m, i) => {
      const L = midiToLength(m);
      const x = x0 + ((x1 - x0) * i) / Math.max(1, notes.length - 1);
      this.addString({ x, y: bottom - L }, { x, y: bottom }, now + i * 40);
    });
  }

  // --- INTERNOS -------------------------------------------------------------------

  private checkTip(key: string, p: Vec2, speed: number, now: number) {
    for (const s of this.strings) {
      if (s.removingAt) continue;
      const memKey = `${key}:${s.id}`;
      const { d, t } = sideAndParam(p, s.a, s.b);
      if (t < -0.03 || t > 1.03) {
        this.sideMem.delete(memKey);
        continue;
      }
      const side = d > SIDE_DEADBAND ? 1 : d < -SIDE_DEADBAND ? -1 : 0;
      if (side === 0) continue;
      const prevSide = this.sideMem.get(memKey);
      this.sideMem.set(memKey, side);
      if (prevSide !== undefined && prevSide !== side && now - s.lastPluckMs > PLUCK_COOLDOWN_MS) {
        const velocity = Math.max(0.15, Math.min(1, speed / 2.2));
        this.pluck(s, Math.max(0.02, Math.min(0.98, t)), velocity, now);
      }
    }
  }

  private forgetSides(prefix: string) {
    const pre = `${prefix}:`;
    for (const k of this.sideMem.keys()) {
      if (k.startsWith(pre)) this.sideMem.delete(k);
    }
  }

  private updateDraftNote() {
    const d = this.draft;
    if (!d) return;
    const len = dist(d.a, d.b);
    if (len < MIN_LENGTH) return;
    const midi = lengthToMidi(len, this.root, this.scale);
    if (midi !== d.midi) {
      d.midi = midi;
      this.cb.onDraftNote(midi, d);
    }
  }

  private commitDraft(now: number) {
    const d = this.draft;
    this.draft = null;
    if (!d || dist(d.a, d.b) < MIN_LENGTH) return;
    const s = this.addString(d.a, d.b, now);
    // Ao nascer a corda vibra uma vez
    this.pluck(s, 0.5, 0.65, now);
  }

  private addString(a: Vec2, b: Vec2, now: number): HarpString {
    const length = dist(a, b);
    const midi = lengthToMidi(length, this.root, this.scale);
    const s: HarpString = {
      id: this.nextId++,
      a: { ...a },
      b: { ...b },
      length,
      midi,
      hue: noteHue(midi),
      createdAt: now,
      pluckAt: 0,
      pluckPos: 0.5,
      amp: 0,
      lastPluckMs: 0,
    };
    this.strings.push(s);
    const live = this.activeStrings();
    if (live.length > MAX_STRINGS) this.removeString(live[0], now);
    this.cb.onCreate(s);
    return s;
  }

  private removeString(s: HarpString, now: number) {
    if (s.removingAt) return;
    s.removingAt = now;
    spawnDissolve(this.sparks, s);
    for (const k of this.sideMem.keys()) {
      if (k.endsWith(`:${s.id}`)) this.sideMem.delete(k);
    }
    this.cb.onRemove(s);
  }
}

function pinchPoint(h: HandState): Vec2 {
  return { x: (h.pts[4].x + h.pts[8].x) / 2, y: (h.pts[4].y + h.pts[8].y) / 2 };
}

/** Punho fechado: indicador, médio, anelar e mínimo dobrados (ponta mais perto do pulso que a junta do meio). */
function isFist(pts: Vec2[]): boolean {
  const wrist = pts[0];
  const fingers: [number, number][] = [[8, 6], [12, 10], [16, 14], [20, 18]];
  return fingers.every(([tip, pip]) => dist(pts[tip], wrist) < dist(pts[pip], wrist));
}
