// src/utils/harp/harpAudio.ts
//
// Motor de som da Harpa de Luz (Web Audio API, sem dependências).
// Cada toque sintetiza uma corda dedilhada pelo algoritmo Karplus-Strong:
// um ruído curto circula numa linha de atraso com o tamanho de um período da nota
// e um filtro passa-baixas vai "amaciando" o som, como uma corda real perdendo energia.
// Os buffers são renderizados uma vez e reaproveitados (cache), então dedilhar
// várias cordas de uma vez não pesa.

export type TimbreId = 'harpa' | 'koto' | 'cristal' | 'synth';

interface TimbreDef {
  id: TimbreId;
  label: string;
  kind: 'ks' | 'bell';
  t60: number;        // segundos até o som cair 60 dB (nas notas graves; agudas decaem mais rápido)
  brightness: number; // 0..1: brilho do ataque
  loopS: number;      // 0.5..0.95: quanto o filtro do laço preserva os agudos
  gain: number;
}

export const TIMBRES: TimbreDef[] = [
  { id: 'harpa', label: 'Harpa', kind: 'ks', t60: 4.2, brightness: 0.55, loopS: 0.5, gain: 0.9 },
  { id: 'koto', label: 'Koto', kind: 'ks', t60: 2.6, brightness: 0.95, loopS: 0.62, gain: 0.75 },
  { id: 'cristal', label: 'Cristal', kind: 'bell', t60: 3.4, brightness: 0.7, loopS: 0.5, gain: 0.5 },
  { id: 'synth', label: 'Synth Pluck', kind: 'ks', t60: 1.6, brightness: 1.0, loopS: 0.8, gain: 0.6 },
];

export interface PluckOptions {
  velocity?: number;  // 0..1
  position?: number;  // 0..1 ponto da corda onde foi tocada (perto da ponta = mais brilhante)
  pan?: number;       // -1 (esquerda) .. 1 (direita)
}

const MAX_CACHE = 240;

export class HarpAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private dry: GainNode;
  private wet: GainNode;
  private compressor: DynamicsCompressorNode;
  private recordDest: MediaStreamAudioDestinationNode | null = null;
  private cache = new Map<string, AudioBuffer>();
  private timbre: TimbreDef = TIMBRES[0];
  private voices: { src: AudioBufferSourceNode; gain: GainNode; start: number }[] = [];

  constructor() {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: 'interactive' });

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -14;
    this.compressor.knee.value = 10;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;

    this.dry = this.ctx.createGain();
    this.dry.gain.value = 1;
    this.wet = this.ctx.createGain();
    this.wet.gain.value = 0.35;

    const reverb = this.ctx.createConvolver();
    reverb.buffer = this.makeImpulse(2.8, 2.6);

    this.dry.connect(this.master);
    this.wet.connect(reverb);
    reverb.connect(this.master);
    this.master.connect(this.compressor);
    this.compressor.connect(this.ctx.destination);
  }

  get state(): AudioContextState {
    return this.ctx.state;
  }

  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch (e) {
        console.warn('Não foi possível ativar o áudio:', e);
      }
    }
  }

  setTimbre(id: TimbreId) {
    this.timbre = TIMBRES.find((t) => t.id === id) || TIMBRES[0];
  }

  setVolume(v: number) {
    this.master.gain.setTargetAtTime(Math.max(0, Math.min(1.5, v)), this.ctx.currentTime, 0.03);
  }

  setReverb(v: number) {
    this.wet.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), this.ctx.currentTime, 0.05);
  }

  /** Stream de áudio para gravação (MediaRecorder). */
  getRecordStream(): MediaStream {
    if (!this.recordDest) {
      this.recordDest = this.ctx.createMediaStreamDestination();
      this.compressor.connect(this.recordDest);
    }
    return this.recordDest.stream;
  }

  pluck(midi: number, opts: PluckOptions = {}) {
    if (this.ctx.state !== 'running') return;
    const velocity = Math.max(0.05, Math.min(1, opts.velocity ?? 0.7));
    const position = Math.max(0, Math.min(1, opts.position ?? 0.5));
    const pan = Math.max(-1, Math.min(1, opts.pan ?? 0));

    const buffer = this.getBuffer(midi, velocity, position);
    const now = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = this.timbre.gain * (0.25 + 0.75 * velocity);
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = pan * 0.7;

    src.connect(gain);
    gain.connect(panner);
    panner.connect(this.dry);
    panner.connect(this.wet);
    src.start(now);

    const voice = { src, gain, start: now };
    this.voices.push(voice);
    src.onended = () => {
      const i = this.voices.indexOf(voice);
      if (i >= 0) this.voices.splice(i, 1);
      try { panner.disconnect(); gain.disconnect(); } catch { /* já desconectado */ }
    };

    // Limita a polifonia: as vozes mais antigas são abafadas rapidamente
    while (this.voices.length > 28) {
      const old = this.voices.shift();
      if (!old) break;
      old.gain.gain.setTargetAtTime(0, now, 0.03);
      try { old.src.stop(now + 0.15); } catch { /* ok */ }
    }
  }

  clearCache() {
    this.cache.clear();
  }

  async dispose() {
    this.voices.forEach((v) => { try { v.src.stop(); } catch { /* ok */ } });
    this.voices = [];
    this.cache.clear();
    try { await this.ctx.close(); } catch { /* ok */ }
  }

  // ---------------------------------------------------------------------------

  private getBuffer(midi: number, velocity: number, position: number): AudioBuffer {
    const vq = Math.round(velocity * 4) / 4;
    const pq = Math.round(Math.min(position, 1 - position) * 8) / 8;
    const key = `${this.timbre.id}|${Math.round(midi)}|${vq}|${pq}`;
    const hit = this.cache.get(key);
    if (hit) return hit;

    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const data = this.timbre.kind === 'bell'
      ? renderBell(this.ctx.sampleRate, freq, this.timbre, vq)
      : renderKarplusStrong(this.ctx.sampleRate, freq, this.timbre, vq, Math.max(0.06, pq));
    const buffer = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
    buffer.copyToChannel(data, 0);

    if (this.cache.size >= MAX_CACHE) {
      const first = this.cache.keys().next().value;
      if (first !== undefined) this.cache.delete(first);
    }
    this.cache.set(key, buffer);
    return buffer;
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // Ruído levemente filtrado com decaimento exponencial: cauda suave de sala
        lp += 0.35 * ((Math.random() * 2 - 1) - lp);
        d[i] = lp * Math.pow(1 - t, decay) * (i < sr * 0.01 ? i / (sr * 0.01) : 1);
      }
    }
    return buf;
  }
}

/**
 * Karplus-Strong estendido:
 * - excitação de ruído filtrada pelo brilho/força do toque;
 * - filtro em pente pela posição do toque (tocar perto da ponta = mais harmônicos);
 * - atraso fracionário por filtro passa-tudo, para a afinação ficar exata também nos agudos.
 */
function renderKarplusStrong(sr: number, freq: number, t: TimbreDef, velocity: number, pluckPos: number): Float32Array {
  const S = t.loopS;
  const period = sr / freq;
  const filterDelay = 1 - S;
  const N = Math.max(2, Math.floor(period - filterDelay - 0.1));
  const frac = period - filterDelay - N; // 0.1 .. 1.1
  const C = (1 - frac) / (1 + frac);

  // Decaimento: notas agudas soam menos (como numa harpa real)
  const t60 = t.t60 * Math.max(0.35, Math.min(1.2, Math.pow(220 / freq, 0.35)));
  const g = Math.pow(0.001, 1 / (freq * t60));

  // Excitação
  const exc = new Float32Array(N);
  const a = 0.12 + 0.88 * t.brightness * (0.45 + 0.55 * velocity);
  let y = 0;
  let mean = 0;
  for (let i = 0; i < N; i++) {
    y += a * ((Math.random() * 2 - 1) - y);
    exc[i] = y;
    mean += y;
  }
  mean /= N;
  const M = Math.max(1, Math.round(N * pluckPos));
  const line = new Float32Array(N);
  let peak = 1e-6;
  for (let i = 0; i < N; i++) {
    const v = (exc[i] - mean) - (i >= M ? (exc[i - M] - mean) : 0);
    line[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  for (let i = 0; i < N; i++) line[i] /= peak;

  const duration = Math.min(6, t60 * 1.05 + 0.1);
  const len = Math.floor(sr * duration);
  const out = new Float32Array(len);

  let idx = 0;
  let prev = 0;
  let apIn = 0;
  let apOut = 0;
  let dcIn = 0;
  let dcOut = 0;
  for (let n = 0; n < len; n++) {
    const cur = line[idx];
    const lp = g * (S * cur + (1 - S) * prev);
    prev = cur;
    const ap = C * lp + apIn - C * apOut;
    apIn = lp;
    apOut = ap;
    line[idx] = ap;
    idx = idx + 1 === N ? 0 : idx + 1;

    // Remove componente DC
    const dc = cur - dcIn + 0.995 * dcOut;
    dcIn = cur;
    dcOut = dc;
    out[n] = dc;
  }

  // Ataque de 1 ms (evita clique) e saída suave nos últimos 60 ms
  const atk = Math.floor(sr * 0.001);
  for (let i = 0; i < atk && i < len; i++) out[i] *= i / atk;
  const rel = Math.floor(sr * 0.06);
  for (let i = 0; i < rel && i < len; i++) out[len - 1 - i] *= i / rel;
  normalize(out, 0.9);
  return out;
}

/** Timbre "Cristal": parciais senoidais levemente desafinadas, como taça ou sino de vidro. */
function renderBell(sr: number, freq: number, t: TimbreDef, velocity: number): Float32Array {
  const partials = [
    { r: 1, a: 1, d: 1 },
    { r: 2.0, a: 0.45, d: 0.62 },
    { r: 3.01, a: 0.22 * (0.5 + velocity), d: 0.4 },
    { r: 4.17, a: 0.12 * (0.5 + velocity), d: 0.27 },
    { r: 5.43, a: 0.07 * t.brightness, d: 0.18 },
  ];
  const t60 = t.t60 * Math.max(0.4, Math.min(1.2, Math.pow(220 / freq, 0.3)));
  const duration = Math.min(6, t60 + 0.1);
  const len = Math.floor(sr * duration);
  const out = new Float32Array(len);
  for (const p of partials) {
    const f = freq * p.r;
    if (f > sr * 0.45) continue;
    const w = (2 * Math.PI * f) / sr;
    // Oscilador por rotação + envelope multiplicativo (bem mais barato que sin/exp por amostra)
    const decay = Math.exp(-Math.log(1000) / (t60 * p.d * sr)); // 60 dB em t60·d segundos
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    let re = 1;
    let im = 0;
    let env = p.a;
    for (let n = 0; n < len; n++) {
      out[n] += env * im;
      const nre = re * cw - im * sw;
      im = re * sw + im * cw;
      re = nre;
      env *= decay;
    }
  }
  const atk = Math.floor(sr * 0.002);
  for (let i = 0; i < atk && i < len; i++) out[i] *= i / atk;
  const rel = Math.floor(sr * 0.06);
  for (let i = 0; i < rel && i < len; i++) out[len - 1 - i] *= i / rel;
  normalize(out, 0.8);
  return out;
}

function normalize(buf: Float32Array, target: number) {
  let peak = 1e-6;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
  const k = target / peak;
  for (let i = 0; i < buf.length; i++) buf[i] *= k;
}
