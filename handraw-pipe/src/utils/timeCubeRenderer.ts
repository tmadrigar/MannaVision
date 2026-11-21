// src/utils/timeCubeRenderer.ts
//
// Renderizador do "Cubo do Tempo": um vídeo é empilhado frame a frame numa textura 3D
// (X, Y, T) e visualizado por raymarching em WebGL2, na linha do Video Summagator
// (Nguyen, Niu & Liu, CHI 2012). Regiões estáticas ficam translúcidas; o que se move
// vira "fitas" opacas atravessando o tempo. Um plano de corte marca o "presente":
// o passado fica atrás dele (esmaecendo além do rastro) e o futuro na frente, fantasma.
//
// Convenção de eixos do cubo (espaço do cubo, centrado na origem):
//   x → largura da imagem, y → altura, z → tempo (z = -meio: 1º frame, z = +meio: último).
//   A câmera padrão fica em +z olhando para -z, então a face frontal é o fim do vídeo.

export type Mat3 = Float32Array; // 9 valores, column-major (como o WebGL espera)

export interface TimeCubeParams {
  /** Orientação da câmera (view → cubo). Posição = rotation * (0, 0, camDist). */
  rotation: Mat3;
  camDist: number;
  /** Posição do plano do presente na linha do tempo (0 = 1º frame, 1 = último). */
  timeCursor: number;
  /** Fração de fatias já carregadas na textura (0..1); o resto é ignorado. */
  loaded: number;
  /** Densidade global do volume ("Volume" no HUD). */
  density: number;
  /** Quanto o movimento entre frames vizinhos aumenta a opacidade. */
  motionGain: number;
  /** Opacidade base das regiões estáticas (ponderada pela luminância). */
  staticAlpha: number;
  /** Comprimento do rastro atrás do presente em que o passado fica nítido (0..1 da linha do tempo). */
  trail: number;
  /** Opacidade residual do passado além do rastro (0..1). */
  pastFade: number;
  /** Opacidade do futuro à frente do presente (0..1). */
  futureFade: number;
  /** Opacidade do plano do presente (1 = frame nítido e opaco). */
  cursorOpacity: number;
  /** Profundidade do eixo do tempo relativa à altura da imagem. */
  depthScale: number;
  /** Passos do raymarching (qualidade × custo). */
  steps: number;
  /** Cor de destaque (arestas, contorno do presente, tingimento do futuro), 0..1. */
  tint: [number, number, number];
  showEdges: boolean;
  background: [number, number, number];
}

export const DEFAULT_TIME_CUBE_PARAMS: Omit<TimeCubeParams, 'rotation'> = {
  camDist: 3.4,
  timeCursor: 0,
  loaded: 0,
  density: 0.8,
  motionGain: 1.4,
  staticAlpha: 0.12,
  trail: 0.15,
  pastFade: 0.2,
  futureFade: 0.3,
  cursorOpacity: 1.0,
  depthScale: 1.0,
  steps: 128,
  tint: [0.55, 0.36, 0.96],
  showEdges: true,
  background: [0.02, 0.02, 0.03],
};

// ---------------------------------------------------------------------------
// Utilitários de matriz 3x3 (column-major)
// ---------------------------------------------------------------------------

export function mat3Identity(): Mat3 {
  return new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
}

export function mat3Multiply(a: Mat3, b: Mat3): Mat3 {
  const out = new Float32Array(9);
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) {
      out[col * 3 + row] =
        a[0 * 3 + row] * b[col * 3 + 0] +
        a[1 * 3 + row] * b[col * 3 + 1] +
        a[2 * 3 + row] * b[col * 3 + 2];
    }
  }
  return out;
}

export function mat3Transpose(m: Mat3): Mat3 {
  return new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
}

/** Rotação de `angle` radianos em torno de um eixo unitário (Rodrigues). */
export function mat3FromAxisAngle(axis: [number, number, number], angle: number): Mat3 {
  const [x, y, z] = axis;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  return new Float32Array([
    t * x * x + c, t * x * y + s * z, t * x * z - s * y,
    t * x * y - s * z, t * y * y + c, t * y * z + s * x,
    t * x * z + s * y, t * y * z - s * x, t * z * z + c,
  ]);
}

/**
 * Aplica ao cubo uma rotação expressa nos eixos da VISÃO (o que o usuário vê):
 * yaw em torno do eixo vertical da tela, pitch do horizontal, roll do eixo de profundidade.
 * Se a câmera é R (view → cubo), girar o cubo por Q na visão equivale a R' = R · Qᵀ.
 */
export function rotateInView(rotation: Mat3, yaw: number, pitch: number, roll: number): Mat3 {
  let r = rotation;
  if (yaw !== 0) r = mat3Multiply(r, mat3Transpose(mat3FromAxisAngle([0, 1, 0], yaw)));
  if (pitch !== 0) r = mat3Multiply(r, mat3Transpose(mat3FromAxisAngle([1, 0, 0], pitch)));
  if (roll !== 0) r = mat3Multiply(r, mat3Transpose(mat3FromAxisAngle([0, 0, 1], roll)));
  return r;
}

/** Interpolação suave entre orientações (renormalizada por Gram-Schmidt; suficiente para pequenos passos). */
export function mat3Lerp(a: Mat3, b: Mat3, t: number): Mat3 {
  const m = new Float32Array(9);
  for (let i = 0; i < 9; i++) m[i] = a[i] + (b[i] - a[i]) * t;
  // Re-ortonormaliza as colunas
  const norm = (i: number) => {
    const l = Math.hypot(m[i], m[i + 1], m[i + 2]) || 1;
    m[i] /= l; m[i + 1] /= l; m[i + 2] /= l;
  };
  norm(0);
  // col1 -= dot(col1,col0)*col0
  const d01 = m[3] * m[0] + m[4] * m[1] + m[5] * m[2];
  m[3] -= d01 * m[0]; m[4] -= d01 * m[1]; m[5] -= d01 * m[2];
  norm(3);
  // col2 = col0 × col1
  m[6] = m[1] * m[5] - m[2] * m[4];
  m[7] = m[2] * m[3] - m[0] * m[5];
  m[8] = m[0] * m[4] - m[1] * m[3];
  return m;
}

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const VERT_SRC = `#version 300 es
precision highp float;
const vec2 POS[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() {
  gl_Position = vec4(POS[gl_VertexID], 0.0, 1.0);
}
`;

const FRAG_SRC = `#version 300 es
precision highp float;
precision highp sampler3D;

uniform sampler3D uVolume;
uniform vec2  uResolution;
uniform mat3  uRot;          // view -> cubo
uniform float uCamDist;
uniform vec3  uBoxHalf;      // meias-extensões do cubo
uniform float uSliceCount;   // profundidade da textura (nº de frames)
uniform float uLoaded;       // fração de fatias carregadas
uniform float uTimeCursor;
uniform float uDensity;
uniform float uMotionGain;
uniform float uStaticAlpha;
uniform float uTrail;
uniform float uPastFade;
uniform float uFutureFade;
uniform float uCursorOpacity;
uniform int   uSteps;
uniform vec3  uTint;
uniform float uShowEdges;
uniform vec3  uBackground;

out vec4 fragColor;

const float FOCAL = 1.45;

// Interseção raio/caixa alinhada (slab). Retorna (tNear, tFar).
vec2 intersectBox(vec3 ro, vec3 rd, vec3 halfExt) {
  vec3 inv = 1.0 / rd;
  vec3 t0 = (-halfExt - ro) * inv;
  vec3 t1 = ( halfExt - ro) * inv;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  return vec2(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));
}

// Ponto do cubo -> coordenada da textura 3D. Imagem tem linha 0 no topo, por isso 1-y.
vec3 toUVW(vec3 p) {
  vec3 uvw = p / (2.0 * uBoxHalf) + 0.5;
  return vec3(uvw.x, 1.0 - uvw.y, uvw.z);
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// Peso temporal de uma amostra em relação ao presente.
float timeWeight(float tz) {
  float dt = tz - uTimeCursor;
  if (dt > 0.0) return uFutureFade;
  float back = -dt;
  float inTrail = 1.0 - smoothstep(uTrail * 0.6, max(uTrail, 0.001), back);
  return mix(uPastFade, 1.0, inTrail);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  vec3 ro = uRot * vec3(0.0, 0.0, uCamDist);
  vec3 rd = normalize(uRot * normalize(vec3(uv, -FOCAL)));

  // Fundo com leve vinheta
  float vig = 1.0 - 0.35 * dot(uv, uv);
  vec3 bg = uBackground * vig;

  vec2 tb = intersectBox(ro, rd, uBoxHalf);
  if (tb.x > tb.y || tb.y < 0.0) {
    fragColor = vec4(bg, 1.0);
    return;
  }
  float tNear = max(tb.x, 0.0);
  float tFar = tb.y;

  // Plano do presente: z = zCursor no espaço do cubo (levemente para dentro das faces,
  // para o 1º e o último frame ainda serem cruzados pelo raio)
  float tc = clamp(uTimeCursor, 0.004, 0.996);
  float zCursor = (tc - 0.5) * 2.0 * uBoxHalf.z;
  float tPlane = (abs(rd.z) > 1e-5) ? (zCursor - ro.z) / rd.z : -1.0;
  bool planeAhead = tPlane > tNear && tPlane < tFar && uTimeCursor <= uLoaded + 1e-4;

  float stepLen = (tFar - tNear) / float(uSteps);
  float dz = 1.0 / max(uSliceCount, 1.0);

  vec3 acc = vec3(0.0);
  float alpha = 0.0;
  bool planeDone = !planeAhead;

  for (int i = 0; i < 512; i++) {
    if (i >= uSteps) break;
    float t = tNear + (float(i) + 0.5) * stepLen;

    // Compor o plano do presente exatamente onde o raio o cruza
    if (!planeDone && tPlane <= t) {
      vec3 pp = ro + rd * tPlane;
      vec3 uvwP = toUVW(pp);
      vec3 frame = texture(uVolume, uvwP).rgb;
      // Contorno do frame na cor do tema
      vec2 edgeDist = 1.0 - abs(pp.xy) / uBoxHalf.xy;
      float border = 1.0 - smoothstep(0.0, 0.012, min(edgeDist.x, edgeDist.y));
      vec3 colP = mix(frame, uTint, border * 0.85);
      float aP = max(uCursorOpacity, border);
      acc += (1.0 - alpha) * aP * colP;
      alpha += (1.0 - alpha) * aP;
      planeDone = true;
      if (alpha > 0.985) break;
    }

    vec3 p = ro + rd * t;
    vec3 uvw = toUVW(p);
    float tz = uvw.z;
    if (tz > uLoaded) continue;

    vec4 c = texture(uVolume, uvw);
    vec3 prev = texture(uVolume, uvw - vec3(0.0, 0.0, dz)).rgb;
    float motion = length(c.rgb - prev);
    float lum = luma(c.rgb);

    float dens = uDensity * (uStaticAlpha * lum * 3.0 + uMotionGain * motion * 28.0);
    float w = timeWeight(tz);
    dens *= w;

    float a = 1.0 - exp(-dens * stepLen);

    // Futuro ligeiramente tingido pela cor do tema (holograma)
    vec3 col = c.rgb;
    if (tz > uTimeCursor) col = mix(col, uTint * (0.35 + 0.65 * lum), 0.35);

    acc += (1.0 - alpha) * a * col;
    alpha += (1.0 - alpha) * a;
    if (alpha > 0.985) break;
  }

  // Plano ficou depois do último passo (borda numérica): compõe agora
  if (!planeDone && alpha < 0.985) {
    vec3 pp = ro + rd * tPlane;
    vec3 frame = texture(uVolume, toUVW(pp)).rgb;
    acc += (1.0 - alpha) * uCursorOpacity * frame;
    alpha += (1.0 - alpha) * uCursorOpacity;
  }

  vec3 color = acc + bg * (1.0 - alpha);

  // Arestas do cubo e traço do plano do presente nas faces laterais
  if (uShowEdges > 0.5 && tb.x > 0.0) {
    vec3 pe = ro + rd * tb.x;
    vec3 d = abs(pe) / uBoxHalf;
    float e = 0.0;
    int nearCount = int(d.x > 0.985) + int(d.y > 0.985) + int(d.z > 0.985);
    if (nearCount >= 2) e = 0.5;
    // Linha do presente nas faces laterais (entrada por face x ou y)
    float tzEntry = pe.z / (2.0 * uBoxHalf.z) + 0.5;
    bool sideFace = d.x > 0.985 || d.y > 0.985;
    if (sideFace && abs(tzEntry - uTimeCursor) < 0.006) e = max(e, 0.9);
    color = mix(color, uTint, e);
  }

  fragColor = vec4(color, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Renderizador
// ---------------------------------------------------------------------------

export interface VolumeInfo {
  width: number;
  height: number;
  depth: number;
  aspect: number;
}

export class TimeCubeRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private volumeTex: WebGLTexture | null = null;
  private volume: VolumeInfo | null = null;
  private vao: WebGLVertexArrayObject | null;
  public readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    }) as WebGL2RenderingContext | null;
    if (!gl) {
      throw new Error('WebGL2 não disponível neste navegador. O Cubo do Tempo precisa de texturas 3D (WebGL2).');
    }
    if (gl.isContextLost()) {
      throw new Error('O contexto WebGL2 foi perdido. Recarregue a página.');
    }
    this.gl = gl;
    this.program = this.createProgram(VERT_SRC, FRAG_SRC);
    this.vao = gl.createVertexArray();

    const names = [
      'uVolume', 'uResolution', 'uRot', 'uCamDist', 'uBoxHalf', 'uSliceCount', 'uLoaded',
      'uTimeCursor', 'uDensity', 'uMotionGain', 'uStaticAlpha', 'uTrail', 'uPastFade',
      'uFutureFade', 'uCursorOpacity', 'uSteps', 'uTint', 'uShowEdges', 'uBackground',
    ];
    for (const n of names) this.uniforms[n] = gl.getUniformLocation(this.program, n);
  }

  private compile(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const sh = gl.createShader(type);
    if (!sh) throw new Error('Falha ao criar shader');
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error(`Erro de compilação do shader: ${log}`);
    }
    return sh;
  }

  private createProgram(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const prog = gl.createProgram();
    if (!prog) throw new Error('Falha ao criar programa WebGL');
    const v = this.compile(gl.VERTEX_SHADER, vs);
    const f = this.compile(gl.FRAGMENT_SHADER, fs);
    gl.attachShader(prog, v);
    gl.attachShader(prog, f);
    gl.linkProgram(prog);
    gl.deleteShader(v);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error(`Erro de link do programa: ${log}`);
    }
    return prog;
  }

  /** Aloca a textura 3D (zerada) para `depth` frames de `width`×`height`. */
  public allocateVolume(width: number, height: number, depth: number): VolumeInfo {
    const gl = this.gl;
    const maxSize = gl.getParameter(gl.MAX_3D_TEXTURE_SIZE) as number;
    const w = Math.min(width, maxSize);
    const h = Math.min(height, maxSize);
    const d = Math.min(depth, maxSize);

    if (this.volumeTex) gl.deleteTexture(this.volumeTex);
    const tex = gl.createTexture();
    if (!tex) throw new Error('Falha ao criar textura 3D');
    gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.texStorage3D(gl.TEXTURE_3D, 1, gl.RGBA8, w, h, d);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_3D, null);

    this.volumeTex = tex;
    this.volume = { width: w, height: h, depth: d, aspect: w / h };
    return this.volume;
  }

  /** Envia um frame (canvas/vídeo/imagem já no tamanho da fatia) para a camada `index`. */
  public uploadSlice(index: number, source: TexImageSource): void {
    const gl = this.gl;
    if (!this.volumeTex || !this.volume) return;
    if (index < 0 || index >= this.volume.depth) return;
    gl.bindTexture(gl.TEXTURE_3D, this.volumeTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texSubImage3D(
      gl.TEXTURE_3D, 0, 0, 0, index,
      this.volume.width, this.volume.height, 1,
      gl.RGBA, gl.UNSIGNED_BYTE, source,
    );
    gl.bindTexture(gl.TEXTURE_3D, null);
  }

  public getVolumeInfo(): VolumeInfo | null {
    return this.volume;
  }

  /** Ajusta o tamanho interno do canvas (em pixels físicos). */
  public resize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  public render(p: TimeCubeParams): void {
    const gl = this.gl;
    const u = this.uniforms;
    const vol = this.volume;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this.volumeTex);
    gl.uniform1i(u.uVolume, 0);

    const aspect = vol ? vol.aspect : 16 / 9;
    gl.uniform2f(u.uResolution, this.canvas.width, this.canvas.height);
    gl.uniformMatrix3fv(u.uRot, false, p.rotation);
    gl.uniform1f(u.uCamDist, p.camDist);
    gl.uniform3f(u.uBoxHalf, aspect * 0.5, 0.5, p.depthScale * 0.5);
    gl.uniform1f(u.uSliceCount, vol ? vol.depth : 1);
    gl.uniform1f(u.uLoaded, vol ? p.loaded : 0);
    gl.uniform1f(u.uTimeCursor, p.timeCursor);
    gl.uniform1f(u.uDensity, p.density);
    gl.uniform1f(u.uMotionGain, p.motionGain);
    gl.uniform1f(u.uStaticAlpha, p.staticAlpha);
    gl.uniform1f(u.uTrail, p.trail);
    gl.uniform1f(u.uPastFade, p.pastFade);
    gl.uniform1f(u.uFutureFade, p.futureFade);
    gl.uniform1f(u.uCursorOpacity, p.cursorOpacity);
    gl.uniform1i(u.uSteps, Math.max(8, Math.min(512, Math.round(p.steps))));
    gl.uniform3f(u.uTint, p.tint[0], p.tint[1], p.tint[2]);
    gl.uniform1f(u.uShowEdges, p.showEdges ? 1 : 0);
    gl.uniform3f(u.uBackground, p.background[0], p.background[1], p.background[2]);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  public destroy(): void {
    const gl = this.gl;
    if (this.volumeTex) gl.deleteTexture(this.volumeTex);
    if (this.vao) gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
    this.volumeTex = null;
    this.volume = null;
    // Não perder o contexto aqui: o canvas devolve o MESMO contexto num próximo getContext
    // (ex.: efeito duplo do StrictMode) e ele ficaria inutilizável.
  }
}

// ---------------------------------------------------------------------------
// Extração de frames de um <video> para o volume
// ---------------------------------------------------------------------------

export interface ExtractOptions {
  /** Nº de fatias (frames amostrados uniformemente). */
  sliceCount: number;
  /** Maior lado da fatia em pixels (o outro segue a proporção do vídeo). */
  maxSide: number;
  onProgress?: (loaded: number, total: number) => void;
  /** Retorna true para abortar. */
  shouldAbort?: () => boolean;
}

/** Aguarda o evento `seeked` de um vídeo após alterar `currentTime`. */
function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    const onSeeked = () => { if (!done) { done = true; cleanup(); resolve(); } };
    const onError = () => { if (!done) { done = true; cleanup(); reject(new Error('Erro ao decodificar o vídeo')); } };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    // Um seek para o mesmo instante não dispara `seeked`: garante mudança mínima
    const target = Math.abs(video.currentTime - time) < 1e-4 ? time + 1e-3 : time;
    video.currentTime = target;
    // Rede de segurança contra seeks que nunca resolvem (ex.: última amostra além da duração)
    setTimeout(() => { if (!done) { done = true; cleanup(); resolve(); } }, 4000);
  });
}

/**
 * Amostra `sliceCount` frames uniformemente ao longo do vídeo e envia cada um como
 * uma camada da textura 3D. Renderização progressiva: chame `onProgress` para
 * atualizar `loaded` nos parâmetros de render.
 */
export async function extractVideoToVolume(
  renderer: TimeCubeRenderer,
  video: HTMLVideoElement,
  opts: ExtractOptions,
): Promise<VolumeInfo> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh || !isFinite(video.duration) || video.duration <= 0) {
    throw new Error('Vídeo sem dimensões ou duração válidas.');
  }
  const aspect = vw / vh;
  const texW = aspect >= 1 ? opts.maxSide : Math.round(opts.maxSide * aspect);
  const texH = aspect >= 1 ? Math.round(opts.maxSide / aspect) : opts.maxSide;
  const info = renderer.allocateVolume(texW, texH, opts.sliceCount);

  const off = document.createElement('canvas');
  off.width = info.width;
  off.height = info.height;
  const ctx = off.getContext('2d', { willReadFrequently: false });
  if (!ctx) throw new Error('Canvas 2D indisponível');

  const duration = video.duration;
  // Evita o último instante exato (alguns decoders não entregam frame em t = duration)
  const usable = Math.max(0.05, duration - 0.06);
  video.pause();

  for (let i = 0; i < info.depth; i++) {
    if (opts.shouldAbort?.()) throw new Error('Extração cancelada');
    const t = (i / Math.max(1, info.depth - 1)) * usable;
    await seekTo(video, t);
    if (opts.shouldAbort?.()) throw new Error('Extração cancelada');
    ctx.drawImage(video, 0, 0, info.width, info.height);
    renderer.uploadSlice(i, off);
    opts.onProgress?.(i + 1, info.depth);
  }
  return info;
}
