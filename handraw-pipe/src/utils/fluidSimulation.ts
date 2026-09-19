// src/utils/fluidSimulation.ts
//
// Port em TypeScript do WebGL Fluid Simulation de Pavel Dobryakov
// https://github.com/PavelDoGreat/WebGL-Fluid-Simulation  (MIT License)
//
// Copyright (c) 2017 Pavel Dobryakov
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// Adaptações para o MannaVision:
//  - Encapsulado em classe (sem estado global, sem dat.gui, sem analytics)
//  - Entrada por "pointers" nomeados (setPointer/releasePointer) para que as
//    pontas dos dedos rastreadas pelo MediaPipe substituam mouse/toque
//  - destroy() libera todos os recursos WebGL (necessário no React StrictMode)

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface FluidConfig {
  SIM_RESOLUTION: number;
  DYE_RESOLUTION: number;
  DENSITY_DISSIPATION: number;
  VELOCITY_DISSIPATION: number;
  PRESSURE: number;
  PRESSURE_ITERATIONS: number;
  CURL: number;
  SPLAT_RADIUS: number;
  SPLAT_FORCE: number;
  SHADING: boolean;
  COLORFUL: boolean;
  COLOR_UPDATE_SPEED: number;
  PAUSED: boolean;
  BACK_COLOR: RGB; // 0..255
  BLOOM: boolean;
  BLOOM_ITERATIONS: number;
  BLOOM_RESOLUTION: number;
  BLOOM_INTENSITY: number;
  BLOOM_THRESHOLD: number;
  BLOOM_SOFT_KNEE: number;
  SUNRAYS: boolean;
  SUNRAYS_RESOLUTION: number;
  SUNRAYS_WEIGHT: number;
}

export const DEFAULT_FLUID_CONFIG: FluidConfig = {
  SIM_RESOLUTION: 128,
  DYE_RESOLUTION: 1024,
  DENSITY_DISSIPATION: 1,
  VELOCITY_DISSIPATION: 0.2,
  PRESSURE: 0.8,
  PRESSURE_ITERATIONS: 20,
  CURL: 30,
  SPLAT_RADIUS: 0.25,
  SPLAT_FORCE: 6000,
  SHADING: true,
  COLORFUL: true,
  COLOR_UPDATE_SPEED: 10,
  PAUSED: false,
  BACK_COLOR: { r: 0, g: 0, b: 0 },
  BLOOM: true,
  BLOOM_ITERATIONS: 8,
  BLOOM_RESOLUTION: 256,
  BLOOM_INTENSITY: 0.8,
  BLOOM_THRESHOLD: 0.6,
  BLOOM_SOFT_KNEE: 0.7,
  SUNRAYS: true,
  SUNRAYS_RESOLUTION: 196,
  SUNRAYS_WEIGHT: 1.0,
};

export interface FluidPointerOptions {
  color?: RGB; // 0..1 (já escalado); se omitido e COLORFUL, cicla automaticamente
  radiusScale?: number; // multiplicador do SPLAT_RADIUS para este pointer
  forceScale?: number; // multiplicador do SPLAT_FORCE para este pointer
}

interface Pointer {
  id: string;
  texcoordX: number;
  texcoordY: number;
  prevTexcoordX: number;
  prevTexcoordY: number;
  deltaX: number;
  deltaY: number;
  moved: boolean;
  color: RGB;
  radiusScale: number;
  forceScale: number;
}

type GL = WebGL2RenderingContext | WebGLRenderingContext;

interface TexFormat {
  internalFormat: number;
  format: number;
}

interface GLExt {
  formatRGBA: TexFormat;
  formatRG: TexFormat;
  formatR: TexFormat;
  halfFloatTexType: number;
  supportLinearFiltering: boolean;
}

interface FBO {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  attach(id: number): number;
}

interface DoubleFBO {
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  read: FBO;
  write: FBO;
  swap(): void;
}

interface TextureRef {
  texture: WebGLTexture;
  width: number;
  height: number;
  attach(id: number): number;
}

type Uniforms = Record<string, WebGLUniformLocation | null>;

// ---------------------------------------------------------------------------
// Utilitários de cor
// ---------------------------------------------------------------------------

export function HSVtoRGB(h: number, s: number, v: number): RGB {
  let r = 0;
  let g = 0;
  let b = 0;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return { r, g, b };
}

/** Cor de tinta com a mesma intensidade usada pelo projeto original (HSV * 0.15) */
export function generateColor(hue?: number): RGB {
  const c = HSVtoRGB(hue ?? Math.random(), 1.0, 1.0);
  c.r *= 0.15;
  c.g *= 0.15;
  c.b *= 0.15;
  return c;
}

function normalizeColor(input: RGB): RGB {
  return { r: input.r / 255, g: input.g / 255, b: input.b / 255 };
}

function wrap(value: number, min: number, max: number): number {
  const range = max - min;
  if (range === 0) return min;
  return ((value - min) % range) + min;
}

function hashCode(s: string): number {
  if (s.length === 0) return 0;
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function scaleByPixelRatio(input: number): number {
  const pixelRatio = window.devicePixelRatio || 1;
  return Math.floor(input * pixelRatio);
}

// ---------------------------------------------------------------------------
// Shaders (GLSL ES 1.0 — compatível com WebGL1 e WebGL2)
// ---------------------------------------------------------------------------

const BASE_VERTEX_SHADER = `
    precision highp float;

    attribute vec2 aPosition;
    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform vec2 texelSize;

    void main () {
        vUv = aPosition * 0.5 + 0.5;
        vL = vUv - vec2(texelSize.x, 0.0);
        vR = vUv + vec2(texelSize.x, 0.0);
        vT = vUv + vec2(0.0, texelSize.y);
        vB = vUv - vec2(0.0, texelSize.y);
        gl_Position = vec4(aPosition, 0.0, 1.0);
    }
`;

const BLUR_VERTEX_SHADER = `
    precision highp float;

    attribute vec2 aPosition;
    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    uniform vec2 texelSize;

    void main () {
        vUv = aPosition * 0.5 + 0.5;
        float offset = 1.33333333;
        vL = vUv - texelSize * offset;
        vR = vUv + texelSize * offset;
        gl_Position = vec4(aPosition, 0.0, 1.0);
    }
`;

const BLUR_SHADER = `
    precision mediump float;
    precision mediump sampler2D;

    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    uniform sampler2D uTexture;

    void main () {
        vec4 sum = texture2D(uTexture, vUv) * 0.29411764;
        sum += texture2D(uTexture, vL) * 0.35294117;
        sum += texture2D(uTexture, vR) * 0.35294117;
        gl_FragColor = sum;
    }
`;

const COPY_SHADER = `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    uniform sampler2D uTexture;

    void main () {
        gl_FragColor = texture2D(uTexture, vUv);
    }
`;

const CLEAR_SHADER = `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    uniform sampler2D uTexture;
    uniform float value;

    void main () {
        gl_FragColor = value * texture2D(uTexture, vUv);
    }
`;

const COLOR_SHADER = `
    precision mediump float;

    uniform vec4 color;

    void main () {
        gl_FragColor = color;
    }
`;

const DISPLAY_SHADER_SOURCE = `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uTexture;
    uniform sampler2D uBloom;
    uniform sampler2D uSunrays;
    uniform sampler2D uDithering;
    uniform vec2 ditherScale;
    uniform vec2 texelSize;

    vec3 linearToGamma (vec3 color) {
        color = max(color, vec3(0));
        return max(1.055 * pow(color, vec3(0.416666667)) - 0.055, vec3(0));
    }

    void main () {
        vec3 c = texture2D(uTexture, vUv).rgb;

    #ifdef SHADING
        vec3 lc = texture2D(uTexture, vL).rgb;
        vec3 rc = texture2D(uTexture, vR).rgb;
        vec3 tc = texture2D(uTexture, vT).rgb;
        vec3 bc = texture2D(uTexture, vB).rgb;

        float dx = length(rc) - length(lc);
        float dy = length(tc) - length(bc);

        vec3 n = normalize(vec3(dx, dy, length(texelSize)));
        vec3 l = vec3(0.0, 0.0, 1.0);

        float diffuse = clamp(dot(n, l) + 0.7, 0.7, 1.0);
        c *= diffuse;
    #endif

    #ifdef BLOOM
        vec3 bloom = texture2D(uBloom, vUv).rgb;
    #endif

    #ifdef SUNRAYS
        float sunrays = texture2D(uSunrays, vUv).r;
        c *= sunrays;
    #ifdef BLOOM
        bloom *= sunrays;
    #endif
    #endif

    #ifdef BLOOM
        float noise = texture2D(uDithering, vUv * ditherScale).r;
        noise = noise * 2.0 - 1.0;
        bloom += noise / 255.0;
        bloom = linearToGamma(bloom);
        c += bloom;
    #endif

        float a = max(c.r, max(c.g, c.b));
        gl_FragColor = vec4(c, a);
    }
`;

const BLOOM_PREFILTER_SHADER = `
    precision mediump float;
    precision mediump sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform vec3 curve;
    uniform float threshold;

    void main () {
        vec3 c = texture2D(uTexture, vUv).rgb;
        float br = max(c.r, max(c.g, c.b));
        float rq = clamp(br - curve.x, 0.0, curve.y);
        rq = curve.z * rq * rq;
        c *= max(rq, br - threshold) / max(br, 0.0001);
        gl_FragColor = vec4(c, 0.0);
    }
`;

const BLOOM_BLUR_SHADER = `
    precision mediump float;
    precision mediump sampler2D;

    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uTexture;

    void main () {
        vec4 sum = vec4(0.0);
        sum += texture2D(uTexture, vL);
        sum += texture2D(uTexture, vR);
        sum += texture2D(uTexture, vT);
        sum += texture2D(uTexture, vB);
        sum *= 0.25;
        gl_FragColor = sum;
    }
`;

const BLOOM_FINAL_SHADER = `
    precision mediump float;
    precision mediump sampler2D;

    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uTexture;
    uniform float intensity;

    void main () {
        vec4 sum = vec4(0.0);
        sum += texture2D(uTexture, vL);
        sum += texture2D(uTexture, vR);
        sum += texture2D(uTexture, vT);
        sum += texture2D(uTexture, vB);
        sum *= 0.25;
        gl_FragColor = sum * intensity;
    }
`;

const SUNRAYS_MASK_SHADER = `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTexture;

    void main () {
        vec4 c = texture2D(uTexture, vUv);
        float br = max(c.r, max(c.g, c.b));
        c.a = 1.0 - min(max(br * 20.0, 0.0), 0.8);
        gl_FragColor = c;
    }
`;

const SUNRAYS_SHADER = `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform float weight;

    #define ITERATIONS 16

    void main () {
        float Density = 0.3;
        float Decay = 0.95;
        float Exposure = 0.7;

        vec2 coord = vUv;
        vec2 dir = vUv - 0.5;

        dir *= 1.0 / float(ITERATIONS) * Density;
        float illuminationDecay = 1.0;

        float color = texture2D(uTexture, vUv).a;

        for (int i = 0; i < ITERATIONS; i++)
        {
            coord -= dir;
            float col = texture2D(uTexture, coord).a;
            color += col * illuminationDecay * weight;
            illuminationDecay *= Decay;
        }

        gl_FragColor = vec4(color * Exposure, 0.0, 0.0, 1.0);
    }
`;

const SPLAT_SHADER = `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTarget;
    uniform float aspectRatio;
    uniform vec3 color;
    uniform vec2 point;
    uniform float radius;

    void main () {
        vec2 p = vUv - point.xy;
        p.x *= aspectRatio;
        vec3 splat = exp(-dot(p, p) / radius) * color;
        vec3 base = texture2D(uTarget, vUv).xyz;
        gl_FragColor = vec4(base + splat, 1.0);
    }
`;

const ADVECTION_SHADER = `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform vec2 texelSize;
    uniform vec2 dyeTexelSize;
    uniform float dt;
    uniform float dissipation;

    vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
        vec2 st = uv / tsize - 0.5;

        vec2 iuv = floor(st);
        vec2 fuv = fract(st);

        vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
        vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
        vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
        vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);

        return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
    }

    void main () {
    #ifdef MANUAL_FILTERING
        vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
        vec4 result = bilerp(uSource, coord, dyeTexelSize);
    #else
        vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
        vec4 result = texture2D(uSource, coord);
    #endif
        float decay = 1.0 + dissipation * dt;
        gl_FragColor = result / decay;
    }
`;

const DIVERGENCE_SHADER = `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uVelocity;

    void main () {
        float L = texture2D(uVelocity, vL).x;
        float R = texture2D(uVelocity, vR).x;
        float T = texture2D(uVelocity, vT).y;
        float B = texture2D(uVelocity, vB).y;

        vec2 C = texture2D(uVelocity, vUv).xy;
        if (vL.x < 0.0) { L = -C.x; }
        if (vR.x > 1.0) { R = -C.x; }
        if (vT.y > 1.0) { T = -C.y; }
        if (vB.y < 0.0) { B = -C.y; }

        float div = 0.5 * (R - L + T - B);
        gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
    }
`;

const CURL_SHADER = `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uVelocity;

    void main () {
        float L = texture2D(uVelocity, vL).y;
        float R = texture2D(uVelocity, vR).y;
        float T = texture2D(uVelocity, vT).x;
        float B = texture2D(uVelocity, vB).x;
        float vorticity = R - L - T + B;
        gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
    }
`;

const VORTICITY_SHADER = `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uVelocity;
    uniform sampler2D uCurl;
    uniform float curl;
    uniform float dt;

    void main () {
        float L = texture2D(uCurl, vL).x;
        float R = texture2D(uCurl, vR).x;
        float T = texture2D(uCurl, vT).x;
        float B = texture2D(uCurl, vB).x;
        float C = texture2D(uCurl, vUv).x;

        vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
        force /= length(force) + 0.0001;
        force *= curl * C;
        force.y *= -1.0;

        vec2 velocity = texture2D(uVelocity, vUv).xy;
        velocity += force * dt;
        velocity = min(max(velocity, -1000.0), 1000.0);
        gl_FragColor = vec4(velocity, 0.0, 1.0);
    }
`;

const PRESSURE_SHADER = `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uDivergence;

    void main () {
        float L = texture2D(uPressure, vL).x;
        float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x;
        float B = texture2D(uPressure, vB).x;
        float C = texture2D(uPressure, vUv).x;
        float divergence = texture2D(uDivergence, vUv).x;
        float pressure = (L + R + B + T - divergence) * 0.25;
        gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
    }
`;

const GRADIENT_SUBTRACT_SHADER = `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uVelocity;

    void main () {
        float L = texture2D(uPressure, vL).x;
        float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x;
        float B = texture2D(uPressure, vB).x;
        vec2 velocity = texture2D(uVelocity, vUv).xy;
        velocity.xy -= vec2(R - L, T - B);
        gl_FragColor = vec4(velocity, 0.0, 1.0);
    }
`;

// ---------------------------------------------------------------------------
// Programas
// ---------------------------------------------------------------------------

class Program {
  public uniforms: Uniforms = {};
  public program: WebGLProgram;

  constructor(private gl: GL, vertexShader: WebGLShader, fragmentShader: WebGLShader) {
    this.program = createProgram(gl, vertexShader, fragmentShader);
    this.uniforms = getUniforms(gl, this.program);
  }

  bind() {
    this.gl.useProgram(this.program);
  }

  dispose() {
    this.gl.deleteProgram(this.program);
  }
}

/** Programa com variantes por #define (usado pelo shader de display) */
class Material {
  private programs: Record<number, WebGLProgram> = {};
  private activeProgram: WebGLProgram | null = null;
  public uniforms: Uniforms = {};

  constructor(private gl: GL, private vertexShader: WebGLShader, private fragmentShaderSource: string) {}

  setKeywords(keywords: string[]) {
    let hash = 0;
    for (let i = 0; i < keywords.length; i++) hash += hashCode(keywords[i]);

    let program = this.programs[hash];
    if (program == null) {
      const fragmentShader = compileShader(this.gl, this.gl.FRAGMENT_SHADER, this.fragmentShaderSource, keywords);
      program = createProgram(this.gl, this.vertexShader, fragmentShader);
      this.gl.deleteShader(fragmentShader);
      this.programs[hash] = program;
    }

    if (program === this.activeProgram) return;

    this.uniforms = getUniforms(this.gl, program);
    this.activeProgram = program;
  }

  bind() {
    this.gl.useProgram(this.activeProgram);
  }

  dispose() {
    Object.values(this.programs).forEach((p) => this.gl.deleteProgram(p));
    this.programs = {};
    this.activeProgram = null;
  }
}

function createProgram(gl: GL, vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error('Não foi possível criar o programa WebGL');
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  // Garante que aPosition seja o atributo 0 (o blit assume isso)
  gl.bindAttribLocation(program, 0, 'aPosition');
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.trace(gl.getProgramInfoLog(program));
  }
  return program;
}

function getUniforms(gl: GL, program: WebGLProgram): Uniforms {
  const uniforms: Uniforms = {};
  const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < uniformCount; i++) {
    const info = gl.getActiveUniform(program, i);
    if (!info) continue;
    uniforms[info.name] = gl.getUniformLocation(program, info.name);
  }
  return uniforms;
}

function compileShader(gl: GL, type: number, source: string, keywords?: string[] | null): WebGLShader {
  source = addKeywords(source, keywords);

  const shader = gl.createShader(type);
  if (!shader) throw new Error('Não foi possível criar o shader WebGL');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.trace(gl.getShaderInfoLog(shader));
  }
  return shader;
}

function addKeywords(source: string, keywords?: string[] | null): string {
  if (keywords == null) return source;
  let keywordsString = '';
  keywords.forEach((keyword) => {
    keywordsString += '#define ' + keyword + '\n';
  });
  return keywordsString + source;
}

// ---------------------------------------------------------------------------
// Contexto e formatos de textura
// ---------------------------------------------------------------------------

function getWebGLContext(canvas: HTMLCanvasElement): { gl: GL; ext: GLExt } {
  const params: WebGLContextAttributes = {
    alpha: true,
    depth: false,
    stencil: false,
    antialias: false,
    preserveDrawingBuffer: false,
  };

  let gl: GL | null = canvas.getContext('webgl2', params) as WebGL2RenderingContext | null;
  const isWebGL2 = !!gl;
  if (!isWebGL2) {
    gl =
      (canvas.getContext('webgl', params) as WebGLRenderingContext | null) ||
      (canvas.getContext('experimental-webgl', params) as WebGLRenderingContext | null);
  }
  if (!gl) throw new Error('WebGL não é suportado neste navegador.');

  let halfFloat: OES_texture_half_float | null = null;
  let supportLinearFiltering: unknown = null;
  if (isWebGL2) {
    gl.getExtension('EXT_color_buffer_float');
    supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
  } else {
    halfFloat = gl.getExtension('OES_texture_half_float');
    supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
  }

  gl.clearColor(0.0, 0.0, 0.0, 1.0);

  const halfFloatTexType = isWebGL2
    ? (gl as WebGL2RenderingContext).HALF_FLOAT
    : (halfFloat as OES_texture_half_float).HALF_FLOAT_OES;

  let formatRGBA: TexFormat | null;
  let formatRG: TexFormat | null;
  let formatR: TexFormat | null;

  if (isWebGL2) {
    const gl2 = gl as WebGL2RenderingContext;
    formatRGBA = getSupportedFormat(gl2, gl2.RGBA16F, gl2.RGBA, halfFloatTexType);
    formatRG = getSupportedFormat(gl2, gl2.RG16F, gl2.RG, halfFloatTexType);
    formatR = getSupportedFormat(gl2, gl2.R16F, gl2.RED, halfFloatTexType);
  } else {
    formatRGBA = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
    formatRG = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
    formatR = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
  }

  if (!formatRGBA || !formatRG || !formatR) {
    throw new Error('A GPU não suporta texturas de ponto flutuante necessárias para a simulação.');
  }

  return {
    gl,
    ext: {
      formatRGBA,
      formatRG,
      formatR,
      halfFloatTexType,
      supportLinearFiltering: !!supportLinearFiltering,
    },
  };
}

function getSupportedFormat(gl: GL, internalFormat: number, format: number, type: number): TexFormat | null {
  if (!supportRenderTextureFormat(gl, internalFormat, format, type)) {
    const gl2 = gl as WebGL2RenderingContext;
    switch (internalFormat) {
      case gl2.R16F:
        return getSupportedFormat(gl, gl2.RG16F, gl2.RG, type);
      case gl2.RG16F:
        return getSupportedFormat(gl, gl2.RGBA16F, gl2.RGBA, type);
      default:
        return null;
    }
  }
  return { internalFormat, format };
}

function supportRenderTextureFormat(gl: GL, internalFormat: number, format: number, type: number): boolean {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fbo);
  gl.deleteTexture(texture);
  return status === gl.FRAMEBUFFER_COMPLETE;
}

// ---------------------------------------------------------------------------
// Simulação
// ---------------------------------------------------------------------------

export interface FluidSimulationOptions {
  config?: Partial<FluidConfig>;
  /** URL da textura de dithering (usada pelo bloom). Opcional. */
  ditheringTextureUrl?: string;
}

export class FluidSimulation {
  public config: FluidConfig;

  private canvas: HTMLCanvasElement;
  private gl: GL;
  private ext: GLExt;

  private pointers: Map<string, Pointer> = new Map();
  private splatStack: number[] = [];

  private baseVertexShader: WebGLShader;
  private blurVertexShader: WebGLShader;
  private fragmentShaders: WebGLShader[] = [];

  private blurProgram: Program;
  private copyProgram: Program;
  private clearProgram: Program;
  private colorProgram: Program;
  private bloomPrefilterProgram: Program;
  private bloomBlurProgram: Program;
  private bloomFinalProgram: Program;
  private sunraysMaskProgram: Program;
  private sunraysProgram: Program;
  private splatProgram: Program;
  private advectionProgram: Program;
  private divergenceProgram: Program;
  private curlProgram: Program;
  private vorticityProgram: Program;
  private pressureProgram: Program;
  private gradienSubtractProgram: Program;
  private displayMaterial: Material;

  private quadVertexBuffer: WebGLBuffer | null = null;
  private quadIndexBuffer: WebGLBuffer | null = null;

  private dye!: DoubleFBO;
  private velocity!: DoubleFBO;
  private divergence!: FBO;
  private curl!: FBO;
  private pressure!: DoubleFBO;
  private bloom!: FBO;
  private bloomFramebuffers: FBO[] = [];
  private sunrays!: FBO;
  private sunraysTemp!: FBO;
  private ditheringTexture: TextureRef;

  private lastUpdateTime = Date.now();
  private colorUpdateTimer = 0.0;
  private animFrameId: number | null = null;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement, options: FluidSimulationOptions = {}) {
    this.canvas = canvas;
    this.config = { ...DEFAULT_FLUID_CONFIG, ...(options.config || {}) };

    this.resizeCanvas();

    const { gl, ext } = getWebGLContext(canvas);
    this.gl = gl;
    this.ext = ext;

    if (!ext.supportLinearFiltering) {
      this.config.DYE_RESOLUTION = Math.min(this.config.DYE_RESOLUTION, 512);
      this.config.SHADING = false;
      this.config.BLOOM = false;
      this.config.SUNRAYS = false;
    }

    // --- Shaders ---
    this.baseVertexShader = compileShader(gl, gl.VERTEX_SHADER, BASE_VERTEX_SHADER);
    this.blurVertexShader = compileShader(gl, gl.VERTEX_SHADER, BLUR_VERTEX_SHADER);

    const frag = (src: string, keywords?: string[] | null) => {
      const s = compileShader(gl, gl.FRAGMENT_SHADER, src, keywords);
      this.fragmentShaders.push(s);
      return s;
    };

    this.blurProgram = new Program(gl, this.blurVertexShader, frag(BLUR_SHADER));
    this.copyProgram = new Program(gl, this.baseVertexShader, frag(COPY_SHADER));
    this.clearProgram = new Program(gl, this.baseVertexShader, frag(CLEAR_SHADER));
    this.colorProgram = new Program(gl, this.baseVertexShader, frag(COLOR_SHADER));
    this.bloomPrefilterProgram = new Program(gl, this.baseVertexShader, frag(BLOOM_PREFILTER_SHADER));
    this.bloomBlurProgram = new Program(gl, this.baseVertexShader, frag(BLOOM_BLUR_SHADER));
    this.bloomFinalProgram = new Program(gl, this.baseVertexShader, frag(BLOOM_FINAL_SHADER));
    this.sunraysMaskProgram = new Program(gl, this.baseVertexShader, frag(SUNRAYS_MASK_SHADER));
    this.sunraysProgram = new Program(gl, this.baseVertexShader, frag(SUNRAYS_SHADER));
    this.splatProgram = new Program(gl, this.baseVertexShader, frag(SPLAT_SHADER));
    this.advectionProgram = new Program(
      gl,
      this.baseVertexShader,
      frag(ADVECTION_SHADER, ext.supportLinearFiltering ? null : ['MANUAL_FILTERING'])
    );
    this.divergenceProgram = new Program(gl, this.baseVertexShader, frag(DIVERGENCE_SHADER));
    this.curlProgram = new Program(gl, this.baseVertexShader, frag(CURL_SHADER));
    this.vorticityProgram = new Program(gl, this.baseVertexShader, frag(VORTICITY_SHADER));
    this.pressureProgram = new Program(gl, this.baseVertexShader, frag(PRESSURE_SHADER));
    this.gradienSubtractProgram = new Program(gl, this.baseVertexShader, frag(GRADIENT_SUBTRACT_SHADER));
    this.displayMaterial = new Material(gl, this.baseVertexShader, DISPLAY_SHADER_SOURCE);

    // --- Quad de tela cheia usado por todos os passes ---
    this.quadVertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    this.quadIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    this.ditheringTexture = this.createTextureAsync(options.ditheringTextureUrl);

    this.updateKeywords();
    this.initFramebuffers();
  }

  // ------------------------------------------------------------------
  // API pública
  // ------------------------------------------------------------------

  /** Inicia o loop de animação (requestAnimationFrame) */
  start() {
    if (this.animFrameId !== null || this.destroyed) return;
    this.lastUpdateTime = Date.now();
    const loop = () => {
      if (this.destroyed) return;
      this.update();
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  /** Pausa o loop de animação (a simulação fica congelada) */
  stop() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  /**
   * Atualiza (ou cria) um pointer identificado por `id`.
   * x, y em coordenadas de textura (0..1), com Y crescendo para CIMA.
   * Na primeira chamada de um id o pointer é "pressionado" (sem delta);
   * nas seguintes, o delta é calculado e o splat aplicado no próximo frame.
   */
  setPointer(id: string, x: number, y: number, options: FluidPointerOptions = {}) {
    let p = this.pointers.get(id);
    if (!p) {
      p = {
        id,
        texcoordX: x,
        texcoordY: y,
        prevTexcoordX: x,
        prevTexcoordY: y,
        deltaX: 0,
        deltaY: 0,
        moved: false,
        color: options.color ?? generateColor(),
        radiusScale: options.radiusScale ?? 1,
        forceScale: options.forceScale ?? 1,
      };
      this.pointers.set(id, p);
      return;
    }

    p.prevTexcoordX = p.texcoordX;
    p.prevTexcoordY = p.texcoordY;
    p.texcoordX = x;
    p.texcoordY = y;
    p.deltaX = this.correctDeltaX(p.texcoordX - p.prevTexcoordX);
    p.deltaY = this.correctDeltaY(p.texcoordY - p.prevTexcoordY);
    p.moved = Math.abs(p.deltaX) > 0 || Math.abs(p.deltaY) > 0;
    if (options.color) p.color = options.color;
    if (options.radiusScale !== undefined) p.radiusScale = options.radiusScale;
    if (options.forceScale !== undefined) p.forceScale = options.forceScale;
  }

  /** Remove um pointer (equivalente a soltar o dedo) */
  releasePointer(id: string) {
    this.pointers.delete(id);
  }

  /** Remove todos os pointers */
  releaseAllPointers() {
    this.pointers.clear();
  }

  getPointerIds(): string[] {
    return Array.from(this.pointers.keys());
  }

  /** Injeta velocidade e tinta num ponto (x, y em 0..1, Y para cima) */
  splat(x: number, y: number, dx: number, dy: number, color: RGB, radiusScale = 1) {
    const gl = this.gl;
    this.splatProgram.bind();
    gl.uniform1i(this.splatProgram.uniforms.uTarget, this.velocity.read.attach(0));
    gl.uniform1f(this.splatProgram.uniforms.aspectRatio, this.canvas.width / this.canvas.height);
    gl.uniform2f(this.splatProgram.uniforms.point, x, y);
    gl.uniform3f(this.splatProgram.uniforms.color, dx, dy, 0.0);
    gl.uniform1f(
      this.splatProgram.uniforms.radius,
      this.correctRadius((this.config.SPLAT_RADIUS * radiusScale) / 100.0)
    );
    this.blit(this.velocity.write);
    this.velocity.swap();

    gl.uniform1i(this.splatProgram.uniforms.uTarget, this.dye.read.attach(0));
    gl.uniform3f(this.splatProgram.uniforms.color, color.r, color.g, color.b);
    this.blit(this.dye.write);
    this.dye.swap();
  }

  /** Agenda uma explosão de N splats aleatórios para o próximo frame */
  burst(amount?: number) {
    this.splatStack.push(amount ?? Math.floor(Math.random() * 20) + 5);
  }

  /** Limpa toda a tinta e velocidade */
  clear() {
    const gl = this.gl;
    gl.disable(gl.BLEND);
    this.clearProgram.bind();
    gl.uniform1f(this.clearProgram.uniforms.value, 0.0);

    gl.uniform1i(this.clearProgram.uniforms.uTexture, this.dye.read.attach(0));
    this.blit(this.dye.write);
    this.dye.swap();

    gl.uniform1i(this.clearProgram.uniforms.uTexture, this.velocity.read.attach(0));
    this.blit(this.velocity.write);
    this.velocity.swap();

    gl.uniform1i(this.clearProgram.uniforms.uTexture, this.pressure.read.attach(0));
    this.blit(this.pressure.write);
    this.pressure.swap();
  }

  /**
   * Aplica alterações de configuração, recriando framebuffers ou
   * recompilando o shader de display quando necessário.
   */
  applyConfig(partial: Partial<FluidConfig>) {
    const prev = this.config;
    this.config = { ...prev, ...partial };

    const needsFramebuffers =
      prev.SIM_RESOLUTION !== this.config.SIM_RESOLUTION ||
      prev.DYE_RESOLUTION !== this.config.DYE_RESOLUTION ||
      prev.BLOOM_RESOLUTION !== this.config.BLOOM_RESOLUTION ||
      prev.BLOOM_ITERATIONS !== this.config.BLOOM_ITERATIONS ||
      prev.SUNRAYS_RESOLUTION !== this.config.SUNRAYS_RESOLUTION;

    const needsKeywords =
      prev.SHADING !== this.config.SHADING ||
      prev.BLOOM !== this.config.BLOOM ||
      prev.SUNRAYS !== this.config.SUNRAYS;

    if (needsKeywords) this.updateKeywords();
    if (needsFramebuffers) this.initFramebuffers();
  }

  /** Executa um frame completo: entrada → simulação → render */
  update() {
    const dt = this.calcDeltaTime();
    if (this.resizeCanvas()) this.initFramebuffers();
    this.updateColors(dt);
    this.applyInputs();
    if (!this.config.PAUSED) this.step(dt);
    this.render();
  }

  /** Libera todos os recursos WebGL. A instância não pode mais ser usada. */
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();

    const gl = this.gl;
    const delFBO = (f?: FBO) => {
      if (!f) return;
      gl.deleteFramebuffer(f.fbo);
      gl.deleteTexture(f.texture);
    };
    const delDouble = (d?: DoubleFBO) => {
      if (!d) return;
      delFBO(d.read);
      delFBO(d.write);
    };

    delDouble(this.dye);
    delDouble(this.velocity);
    delDouble(this.pressure);
    delFBO(this.divergence);
    delFBO(this.curl);
    delFBO(this.bloom);
    this.bloomFramebuffers.forEach(delFBO);
    this.bloomFramebuffers = [];
    delFBO(this.sunrays);
    delFBO(this.sunraysTemp);
    gl.deleteTexture(this.ditheringTexture.texture);

    [
      this.blurProgram, this.copyProgram, this.clearProgram, this.colorProgram,
      this.bloomPrefilterProgram, this.bloomBlurProgram, this.bloomFinalProgram,
      this.sunraysMaskProgram, this.sunraysProgram, this.splatProgram,
      this.advectionProgram, this.divergenceProgram, this.curlProgram,
      this.vorticityProgram, this.pressureProgram, this.gradienSubtractProgram,
    ].forEach((p) => p.dispose());
    this.displayMaterial.dispose();

    this.fragmentShaders.forEach((s) => gl.deleteShader(s));
    this.fragmentShaders = [];
    gl.deleteShader(this.baseVertexShader);
    gl.deleteShader(this.blurVertexShader);

    if (this.quadVertexBuffer) gl.deleteBuffer(this.quadVertexBuffer);
    if (this.quadIndexBuffer) gl.deleteBuffer(this.quadIndexBuffer);

    this.pointers.clear();
    this.splatStack = [];

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  // ------------------------------------------------------------------
  // Internos
  // ------------------------------------------------------------------

  private calcDeltaTime(): number {
    const now = Date.now();
    let dt = (now - this.lastUpdateTime) / 1000;
    dt = Math.min(dt, 0.016666);
    this.lastUpdateTime = now;
    return dt;
  }

  private resizeCanvas(): boolean {
    const width = scaleByPixelRatio(this.canvas.clientWidth);
    const height = scaleByPixelRatio(this.canvas.clientHeight);
    if (width <= 0 || height <= 0) return false;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      return true;
    }
    return false;
  }

  private updateColors(dt: number) {
    if (!this.config.COLORFUL) return;

    this.colorUpdateTimer += dt * this.config.COLOR_UPDATE_SPEED;
    if (this.colorUpdateTimer >= 1) {
      this.colorUpdateTimer = wrap(this.colorUpdateTimer, 0, 1);
      this.pointers.forEach((p) => {
        p.color = generateColor();
      });
    }
  }

  private applyInputs() {
    if (this.splatStack.length > 0) {
      const amount = this.splatStack.pop();
      if (amount !== undefined) this.multipleSplats(amount);
    }

    this.pointers.forEach((p) => {
      if (p.moved) {
        p.moved = false;
        this.splatPointer(p);
      }
    });
  }

  private splatPointer(pointer: Pointer) {
    const dx = pointer.deltaX * this.config.SPLAT_FORCE * pointer.forceScale;
    const dy = pointer.deltaY * this.config.SPLAT_FORCE * pointer.forceScale;
    this.splat(pointer.texcoordX, pointer.texcoordY, dx, dy, pointer.color, pointer.radiusScale);
  }

  private multipleSplats(amount: number) {
    for (let i = 0; i < amount; i++) {
      const color = generateColor();
      color.r *= 10.0;
      color.g *= 10.0;
      color.b *= 10.0;
      const x = Math.random();
      const y = Math.random();
      const dx = 1000 * (Math.random() - 0.5);
      const dy = 1000 * (Math.random() - 0.5);
      this.splat(x, y, dx, dy, color);
    }
  }

  private correctRadius(radius: number): number {
    const aspectRatio = this.canvas.width / this.canvas.height;
    if (aspectRatio > 1) radius *= aspectRatio;
    return radius;
  }

  private correctDeltaX(delta: number): number {
    const aspectRatio = this.canvas.width / this.canvas.height;
    if (aspectRatio < 1) delta *= aspectRatio;
    return delta;
  }

  private correctDeltaY(delta: number): number {
    const aspectRatio = this.canvas.width / this.canvas.height;
    if (aspectRatio > 1) delta /= aspectRatio;
    return delta;
  }

  private updateKeywords() {
    const displayKeywords: string[] = [];
    if (this.config.SHADING) displayKeywords.push('SHADING');
    if (this.config.BLOOM) displayKeywords.push('BLOOM');
    if (this.config.SUNRAYS) displayKeywords.push('SUNRAYS');
    this.displayMaterial.setKeywords(displayKeywords);
  }

  // --- Framebuffers ---

  private initFramebuffers() {
    const gl = this.gl;
    const ext = this.ext;
    const simRes = this.getResolution(this.config.SIM_RESOLUTION);
    const dyeRes = this.getResolution(this.config.DYE_RESOLUTION);

    const texType = ext.halfFloatTexType;
    const rgba = ext.formatRGBA;
    const rg = ext.formatRG;
    const r = ext.formatR;
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    gl.disable(gl.BLEND);

    if (this.dye == null)
      this.dye = this.createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
    else
      this.dye = this.resizeDoubleFBO(this.dye, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);

    if (this.velocity == null)
      this.velocity = this.createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
    else
      this.velocity = this.resizeDoubleFBO(this.velocity, simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);

    // Buffers auxiliares são recriados do zero (não precisam preservar conteúdo)
    this.deleteFBO(this.divergence);
    this.deleteFBO(this.curl);
    if (this.pressure) {
      this.deleteFBO(this.pressure.read);
      this.deleteFBO(this.pressure.write);
    }
    this.divergence = this.createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    this.curl = this.createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    this.pressure = this.createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);

    this.initBloomFramebuffers();
    this.initSunraysFramebuffers();
  }

  private initBloomFramebuffers() {
    const gl = this.gl;
    const ext = this.ext;
    const res = this.getResolution(this.config.BLOOM_RESOLUTION);

    const texType = ext.halfFloatTexType;
    const rgba = ext.formatRGBA;
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    this.deleteFBO(this.bloom);
    this.bloom = this.createFBO(res.width, res.height, rgba.internalFormat, rgba.format, texType, filtering);

    this.bloomFramebuffers.forEach((f) => this.deleteFBO(f));
    this.bloomFramebuffers.length = 0;
    for (let i = 0; i < this.config.BLOOM_ITERATIONS; i++) {
      const width = res.width >> (i + 1);
      const height = res.height >> (i + 1);
      if (width < 2 || height < 2) break;
      const fbo = this.createFBO(width, height, rgba.internalFormat, rgba.format, texType, filtering);
      this.bloomFramebuffers.push(fbo);
    }
  }

  private initSunraysFramebuffers() {
    const gl = this.gl;
    const ext = this.ext;
    const res = this.getResolution(this.config.SUNRAYS_RESOLUTION);

    const texType = ext.halfFloatTexType;
    const r = ext.formatR;
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    this.deleteFBO(this.sunrays);
    this.deleteFBO(this.sunraysTemp);
    this.sunrays = this.createFBO(res.width, res.height, r.internalFormat, r.format, texType, filtering);
    this.sunraysTemp = this.createFBO(res.width, res.height, r.internalFormat, r.format, texType, filtering);
  }

  private deleteFBO(f?: FBO) {
    if (!f) return;
    this.gl.deleteFramebuffer(f.fbo);
    this.gl.deleteTexture(f.texture);
  }

  private createFBO(w: number, h: number, internalFormat: number, format: number, type: number, param: number): FBO {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    const texture = gl.createTexture();
    if (!texture) throw new Error('Falha ao criar textura WebGL');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error('Falha ao criar framebuffer WebGL');
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    return {
      texture,
      fbo,
      width: w,
      height: h,
      texelSizeX: 1.0 / w,
      texelSizeY: 1.0 / h,
      attach(id: number) {
        gl.activeTexture(gl.TEXTURE0 + id);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        return id;
      },
    };
  }

  private createDoubleFBO(w: number, h: number, internalFormat: number, format: number, type: number, param: number): DoubleFBO {
    let fbo1 = this.createFBO(w, h, internalFormat, format, type, param);
    let fbo2 = this.createFBO(w, h, internalFormat, format, type, param);

    return {
      width: w,
      height: h,
      texelSizeX: fbo1.texelSizeX,
      texelSizeY: fbo1.texelSizeY,
      get read() {
        return fbo1;
      },
      set read(value: FBO) {
        fbo1 = value;
      },
      get write() {
        return fbo2;
      },
      set write(value: FBO) {
        fbo2 = value;
      },
      swap() {
        const temp = fbo1;
        fbo1 = fbo2;
        fbo2 = temp;
      },
    };
  }

  private resizeFBO(target: FBO, w: number, h: number, internalFormat: number, format: number, type: number, param: number): FBO {
    const newFBO = this.createFBO(w, h, internalFormat, format, type, param);
    this.copyProgram.bind();
    this.gl.uniform1i(this.copyProgram.uniforms.uTexture, target.attach(0));
    this.blit(newFBO);
    this.deleteFBO(target);
    return newFBO;
  }

  private resizeDoubleFBO(target: DoubleFBO, w: number, h: number, internalFormat: number, format: number, type: number, param: number): DoubleFBO {
    if (target.width === w && target.height === h) return target;
    target.read = this.resizeFBO(target.read, w, h, internalFormat, format, type, param);
    this.deleteFBO(target.write);
    target.write = this.createFBO(w, h, internalFormat, format, type, param);
    target.width = w;
    target.height = h;
    target.texelSizeX = 1.0 / w;
    target.texelSizeY = 1.0 / h;
    return target;
  }

  private createTextureAsync(url?: string): TextureRef {
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) throw new Error('Falha ao criar textura WebGL');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255]));

    const obj: TextureRef = {
      texture,
      width: 1,
      height: 1,
      attach(id: number) {
        gl.activeTexture(gl.TEXTURE0 + id);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        return id;
      },
    };

    if (url) {
      const image = new Image();
      image.onload = () => {
        if (this.destroyed) return;
        obj.width = image.width;
        obj.height = image.height;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
      };
      image.src = url;
    }

    return obj;
  }

  private getResolution(resolution: number): { width: number; height: number } {
    const gl = this.gl;
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio;

    const min = Math.round(resolution);
    const max = Math.round(resolution * aspectRatio);

    if (gl.drawingBufferWidth > gl.drawingBufferHeight) return { width: max, height: min };
    return { width: min, height: max };
  }

  private getTextureScale(texture: TextureRef, width: number, height: number) {
    return { x: width / texture.width, y: height / texture.height };
  }

  private blit(target: FBO | null, clear = false) {
    const gl = this.gl;
    if (target == null) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    }
    if (clear) {
      gl.clearColor(0.0, 0.0, 0.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  // --- Passo de simulação (Navier-Stokes na GPU) ---

  private step(dt: number) {
    const gl = this.gl;
    const cfg = this.config;
    const velocity = this.velocity;

    gl.disable(gl.BLEND);

    this.curlProgram.bind();
    gl.uniform2f(this.curlProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(this.curlProgram.uniforms.uVelocity, velocity.read.attach(0));
    this.blit(this.curl);

    this.vorticityProgram.bind();
    gl.uniform2f(this.vorticityProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(this.vorticityProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(this.vorticityProgram.uniforms.uCurl, this.curl.attach(1));
    gl.uniform1f(this.vorticityProgram.uniforms.curl, cfg.CURL);
    gl.uniform1f(this.vorticityProgram.uniforms.dt, dt);
    this.blit(velocity.write);
    velocity.swap();

    this.divergenceProgram.bind();
    gl.uniform2f(this.divergenceProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(this.divergenceProgram.uniforms.uVelocity, velocity.read.attach(0));
    this.blit(this.divergence);

    this.clearProgram.bind();
    gl.uniform1i(this.clearProgram.uniforms.uTexture, this.pressure.read.attach(0));
    gl.uniform1f(this.clearProgram.uniforms.value, cfg.PRESSURE);
    this.blit(this.pressure.write);
    this.pressure.swap();

    this.pressureProgram.bind();
    gl.uniform2f(this.pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(this.pressureProgram.uniforms.uDivergence, this.divergence.attach(0));
    for (let i = 0; i < cfg.PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(this.pressureProgram.uniforms.uPressure, this.pressure.read.attach(1));
      this.blit(this.pressure.write);
      this.pressure.swap();
    }

    this.gradienSubtractProgram.bind();
    gl.uniform2f(this.gradienSubtractProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(this.gradienSubtractProgram.uniforms.uPressure, this.pressure.read.attach(0));
    gl.uniform1i(this.gradienSubtractProgram.uniforms.uVelocity, velocity.read.attach(1));
    this.blit(velocity.write);
    velocity.swap();

    this.advectionProgram.bind();
    gl.uniform2f(this.advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    if (!this.ext.supportLinearFiltering)
      gl.uniform2f(this.advectionProgram.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
    const velocityId = velocity.read.attach(0);
    gl.uniform1i(this.advectionProgram.uniforms.uVelocity, velocityId);
    gl.uniform1i(this.advectionProgram.uniforms.uSource, velocityId);
    gl.uniform1f(this.advectionProgram.uniforms.dt, dt);
    gl.uniform1f(this.advectionProgram.uniforms.dissipation, cfg.VELOCITY_DISSIPATION);
    this.blit(velocity.write);
    velocity.swap();

    if (!this.ext.supportLinearFiltering)
      gl.uniform2f(this.advectionProgram.uniforms.dyeTexelSize, this.dye.texelSizeX, this.dye.texelSizeY);
    gl.uniform1i(this.advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(this.advectionProgram.uniforms.uSource, this.dye.read.attach(1));
    gl.uniform1f(this.advectionProgram.uniforms.dissipation, cfg.DENSITY_DISSIPATION);
    this.blit(this.dye.write);
    this.dye.swap();
  }

  // --- Render ---

  private render() {
    const gl = this.gl;
    if (this.config.BLOOM) this.applyBloom(this.dye.read, this.bloom);
    if (this.config.SUNRAYS) {
      this.applySunrays(this.dye.read, this.dye.write, this.sunrays);
      this.blur(this.sunrays, this.sunraysTemp, 1);
    }

    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);

    this.drawColor(null, normalizeColor(this.config.BACK_COLOR));
    this.drawDisplay(null);
  }

  private drawColor(target: FBO | null, color: RGB) {
    this.colorProgram.bind();
    this.gl.uniform4f(this.colorProgram.uniforms.color, color.r, color.g, color.b, 1);
    this.blit(target);
  }

  private drawDisplay(target: FBO | null) {
    const gl = this.gl;
    const width = target == null ? gl.drawingBufferWidth : target.width;
    const height = target == null ? gl.drawingBufferHeight : target.height;

    this.displayMaterial.bind();
    if (this.config.SHADING) gl.uniform2f(this.displayMaterial.uniforms.texelSize, 1.0 / width, 1.0 / height);
    gl.uniform1i(this.displayMaterial.uniforms.uTexture, this.dye.read.attach(0));
    if (this.config.BLOOM) {
      gl.uniform1i(this.displayMaterial.uniforms.uBloom, this.bloom.attach(1));
      gl.uniform1i(this.displayMaterial.uniforms.uDithering, this.ditheringTexture.attach(2));
      const scale = this.getTextureScale(this.ditheringTexture, width, height);
      gl.uniform2f(this.displayMaterial.uniforms.ditherScale, scale.x, scale.y);
    }
    if (this.config.SUNRAYS) gl.uniform1i(this.displayMaterial.uniforms.uSunrays, this.sunrays.attach(3));
    this.blit(target);
  }

  private applyBloom(source: FBO, destination: FBO) {
    const gl = this.gl;
    const cfg = this.config;
    if (this.bloomFramebuffers.length < 2) return;

    let last = destination;

    gl.disable(gl.BLEND);
    this.bloomPrefilterProgram.bind();
    const knee = cfg.BLOOM_THRESHOLD * cfg.BLOOM_SOFT_KNEE + 0.0001;
    const curve0 = cfg.BLOOM_THRESHOLD - knee;
    const curve1 = knee * 2;
    const curve2 = 0.25 / knee;
    gl.uniform3f(this.bloomPrefilterProgram.uniforms.curve, curve0, curve1, curve2);
    gl.uniform1f(this.bloomPrefilterProgram.uniforms.threshold, cfg.BLOOM_THRESHOLD);
    gl.uniform1i(this.bloomPrefilterProgram.uniforms.uTexture, source.attach(0));
    this.blit(last);

    this.bloomBlurProgram.bind();
    for (let i = 0; i < this.bloomFramebuffers.length; i++) {
      const dest = this.bloomFramebuffers[i];
      gl.uniform2f(this.bloomBlurProgram.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
      gl.uniform1i(this.bloomBlurProgram.uniforms.uTexture, last.attach(0));
      this.blit(dest);
      last = dest;
    }

    gl.blendFunc(gl.ONE, gl.ONE);
    gl.enable(gl.BLEND);

    for (let i = this.bloomFramebuffers.length - 2; i >= 0; i--) {
      const baseTex = this.bloomFramebuffers[i];
      gl.uniform2f(this.bloomBlurProgram.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
      gl.uniform1i(this.bloomBlurProgram.uniforms.uTexture, last.attach(0));
      gl.viewport(0, 0, baseTex.width, baseTex.height);
      this.blit(baseTex);
      last = baseTex;
    }

    gl.disable(gl.BLEND);
    this.bloomFinalProgram.bind();
    gl.uniform2f(this.bloomFinalProgram.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
    gl.uniform1i(this.bloomFinalProgram.uniforms.uTexture, last.attach(0));
    gl.uniform1f(this.bloomFinalProgram.uniforms.intensity, cfg.BLOOM_INTENSITY);
    this.blit(destination);
  }

  private applySunrays(source: FBO, mask: FBO, destination: FBO) {
    const gl = this.gl;
    gl.disable(gl.BLEND);
    this.sunraysMaskProgram.bind();
    gl.uniform1i(this.sunraysMaskProgram.uniforms.uTexture, source.attach(0));
    this.blit(mask);

    this.sunraysProgram.bind();
    gl.uniform1f(this.sunraysProgram.uniforms.weight, this.config.SUNRAYS_WEIGHT);
    gl.uniform1i(this.sunraysProgram.uniforms.uTexture, mask.attach(0));
    this.blit(destination);
  }

  private blur(target: FBO, temp: FBO, iterations: number) {
    const gl = this.gl;
    this.blurProgram.bind();
    for (let i = 0; i < iterations; i++) {
      gl.uniform2f(this.blurProgram.uniforms.texelSize, target.texelSizeX, 0.0);
      gl.uniform1i(this.blurProgram.uniforms.uTexture, target.attach(0));
      this.blit(temp);

      gl.uniform2f(this.blurProgram.uniforms.texelSize, 0.0, target.texelSizeY);
      gl.uniform1i(this.blurProgram.uniforms.uTexture, temp.attach(0));
      this.blit(target);
    }
  }
}
