// src/utils/xray/xrayScene.ts
//
// Motor 3D do Espelho Raio-X (three.js).
//
// Cabeça: as peças do BodyParts3D foram pré-alinhadas ao "canonical face model" do MediaPipe
// (cm, y para cima, z para a câmera). A matriz de transformação facial do Face Landmarker leva
// esse espaço para o espaço da câmera, que é renderizado com uma câmera perspectiva de 63° —
// a mesma convenção do módulo de geometria facial do MediaPipe. Assim o crânio fica preso ao rosto.
//
// Mãos: cada osso é encaixado entre dois pontos do Hand Landmarker numa cena ortográfica em pixels.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type LayerId = 'skull' | 'brain' | 'muscles' | 'eyes' | 'outline' | 'hands';
export type LookId = 'xray' | 'solid';
export type RevealId = 'beam' | 'whole' | 'left' | 'right' | 'top' | 'lower' | 'lens';

export interface AnatomyPart {
  key: string;
  layer: Exclude<LayerId, 'outline' | 'hands'>;
  group: 'head' | 'jaw' | 'eyeL' | 'eyeR';
  label: string | null;
  anchor: [number, number, number];
}

interface HandBoneMeta { key: string; type: 'palm' | 'seg'; a?: number; b?: number; width?: number }

interface AnatomyMeta {
  source: string;
  jawPivot: [number, number, number];
  eyeCenters: { eyeL: [number, number, number]; eyeR: [number, number, number] };
  parts: AnatomyPart[];
  hands: { L: HandBoneMeta[]; R: HandBoneMeta[] };
}

export interface XRaySettings {
  layers: Record<LayerId, boolean>;
  look: LookId;
  brightness: number;   // 0..2
  showThrough: number;  // 0..1 (quanto do rosto real aparece através do modelo)
  feather: number;      // 0..1
  reveal: RevealId;
  cut: number;          // 0..1
  lensSize: number;     // 0..1
  beamReach: number;    // 0..1 (de quão longe a mão já começa a revelar)
  fit: { size: number; width: number; height: number; depth: number; x: number; y: number; z: number };
}

export const DEFAULT_XRAY_SETTINGS: XRaySettings = {
  layers: { skull: true, brain: true, muscles: true, eyes: true, outline: true, hands: true },
  look: 'xray',
  brightness: 1,
  showThrough: 0.35,
  feather: 0.2,
  reveal: 'beam',
  cut: 0.5,
  lensSize: 0.45,
  beamReach: 0.5,
  fit: { size: 1, width: 1, height: 1, depth: 1, x: 0, y: 0, z: 0 },
};

export interface FaceInput {
  matrix: THREE.Matrix4;          // canônico -> câmera
  landmarks: { x: number; y: number; z: number }[];
  blend: Record<string, number>;
}

export interface HandInput {
  landmarks: { x: number; y: number; z: number }[];
  physicalRight: boolean;
}

export interface LabelPoint {
  text: string;
  x: number; // pixels do quadro da câmera (sem espelhar)
  y: number;
  layer: LayerId;
}

const FOV = 63;
const LAYER_COLORS: Record<string, THREE.Color> = {
  skull: new THREE.Color('#dfe9ff'),
  brain: new THREE.Color('#ff7fb6'),
  muscles: new THREE.Color('#ff5a4f'),
  eyes: new THREE.Color('#ffe9a8'),
  face: new THREE.Color('#ff4a3d'),
  hands: new THREE.Color('#e8f0ff'),
};
const LAYER_FILL: Record<string, number> = { skull: 0.05, brain: 0.18, muscles: 0.12, eyes: 0.1, face: 0.05, hands: 0.06 };

// --- SHADER ÚNICO PARA RAIO-X E SÓLIDO -------------------------------------------------------

const VERT = /* glsl */ `
  uniform mat4 uHeadInv;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vCanon;
  #ifdef USE_CANON_ATTR
  attribute vec3 canon;
  #endif
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec4 mv = viewMatrix * world;
    vNormal = normalize(normalMatrix * normal);
    vView = -mv.xyz;
    #ifdef USE_CANON_ATTR
    vCanon = canon;
    #else
    vCanon = (uHeadInv * world).xyz;
    #endif
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uFill;
  uniform float uBrightness;
  uniform float uOpacity;
  uniform float uSolid;
  uniform int uReveal;
  uniform float uCut;
  uniform float uFeather;
  uniform float uMirror;
  uniform vec3 uLens;      // x, y (px do alvo), raio px
  uniform float uGain;     // intensidade do raio da mão (0..1)
  uniform float uTime;
  uniform float uUseMask;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vCanon;

  float gEdge = 0.0;

  float revealMask() {
    if (uUseMask < 0.5 || uReveal == 0) return 1.0;
    float f = max(0.05, uFeather * 4.0);
    if (uReveal == 1 || uReveal == 2) {
      // lado da tela: com espelho, a esquerda da tela é o lado esquerdo do sujeito (+x)
      float side = (uReveal == 1 ? 1.0 : -1.0) * (uMirror > 0.5 ? 1.0 : -1.0);
      float cutX = (uCut - 0.5) * 16.0;
      return smoothstep(-f * 0.5, f * 0.5, side * vCanon.x - side * cutX);
    }
    if (uReveal == 3) {
      float cutY = mix(14.0, -12.0, uCut);
      return smoothstep(-f * 0.5, f * 0.5, vCanon.y - cutY);
    }
    if (uReveal == 4) {
      float cutY = mix(-12.0, 14.0, uCut);
      return smoothstep(-f * 0.5, f * 0.5, cutY - vCanon.y);
    }
    float d = distance(gl_FragCoord.xy, uLens.xy);
    if (uReveal == 6) {
      // raio da mão: mancha que cresce conforme a mão se aproxima, com uma frente de varredura brilhante
      float fe = max(4.0, uLens.z * max(0.3, uFeather));
      float front = uLens.z - fe * 0.5;
      gEdge = (1.0 - smoothstep(0.0, fe * 0.16, abs(d - front))) * uGain;
      float scan = 0.82 + 0.18 * sin(gl_FragCoord.y * 0.55 - uTime * 9.0);
      return (1.0 - smoothstep(uLens.z - fe, uLens.z, d)) * uGain * scan;
    }
    // lente que segue o dedo (espaço da tela)
    float fe = max(2.0, uLens.z * uFeather);
    return 1.0 - smoothstep(uLens.z - fe, uLens.z, d);
  }

  void main() {
    float mask = revealMask();
    if (mask <= 0.002) discard;
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vView);
    float ndv = abs(dot(n, v));
    if (uSolid > 0.5) {
      float lambert = 0.25 + 0.75 * ndv;
      float rim = pow(1.0 - ndv, 3.0) * 0.35;
      vec3 c = uColor * lambert * uBrightness + rim + vec3(0.45, 0.8, 1.0) * gEdge * 0.35;
      gl_FragColor = vec4(c, uOpacity * mask);
    } else {
      float fres = pow(1.0 - ndv, 2.2);
      float a = (uFill + fres * 0.95) * uOpacity * mask + gEdge * 0.12 * uOpacity;
      vec3 c = uColor * uBrightness * (0.6 + 0.6 * fres) + vec3(0.3, 0.65, 1.0) * gEdge * 0.45;
      gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));
    }
  }
`;

interface SharedUniforms {
  uHeadInv: { value: THREE.Matrix4 };
  uBrightness: { value: number };
  uOpacity: { value: number };
  uSolid: { value: number };
  uReveal: { value: number };
  uCut: { value: number };
  uFeather: { value: number };
  uMirror: { value: number };
  uLens: { value: THREE.Vector3 };
  uGain: { value: number };
  uTime: { value: number };
}

const REVEAL_CODE: Record<RevealId, number> = { whole: 0, left: 1, right: 2, top: 3, lower: 4, lens: 5, beam: 6 };

export class XRayScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 4 / 3, 1, 10000);
  private handScene = new THREE.Scene();
  private handCamera = new THREE.OrthographicCamera(0, 640, 0, -480, -5000, 5000);

  private headRoot = new THREE.Group();
  private fitGroup = new THREE.Group();
  private jaw = new THREE.Group();
  private eyeL = new THREE.Group();
  private eyeR = new THREE.Group();
  private layerMeshes: Record<string, THREE.Mesh[]> = {};
  private materials: THREE.ShaderMaterial[] = [];
  private faceMesh: THREE.Mesh | null = null;
  private faceCanon: Float32Array | null = null;
  private handRigs: { R: HandRig | null; L: HandRig | null } = { R: null, L: null };
  private handPool: { side: 'R' | 'L'; group: THREE.Group }[] = [];
  private shared: SharedUniforms;
  private meta: AnatomyMeta | null = null;
  /** Tamanho do quadro da câmera em pixels (definido por setSize). */
  width = 640;
  height = 480;
  private faceVisible = false;
  private settings: XRaySettings = DEFAULT_XRAY_SETTINGS;
  private jawOpen = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = false;
    this.shared = {
      uHeadInv: { value: new THREE.Matrix4() },
      uBrightness: { value: 1 },
      uOpacity: { value: 1 },
      uSolid: { value: 0 },
      uReveal: { value: 0 },
      uCut: { value: 0.5 },
      uFeather: { value: 0.2 },
      uMirror: { value: 1 },
      uLens: { value: new THREE.Vector3(-9999, -9999, 100) },
      uGain: { value: 1 },
      uTime: { value: 0 },
    };
    this.headRoot.matrixAutoUpdate = false;
    this.headRoot.add(this.fitGroup);
    this.fitGroup.add(this.jaw, this.eyeL, this.eyeR);
    this.scene.add(this.headRoot);
    this.handCamera.position.z = 1000;
  }

  /** Carrega as camadas (GLB) e a malha do rosto. */
  async load(onProgress?: (msg: string) => void) {
    const meta = (await (await fetch('/xray/anatomy.json')).json()) as AnatomyMeta;
    this.meta = meta;
    this.jaw.position.fromArray(meta.jawPivot);
    this.eyeL.position.fromArray(meta.eyeCenters.eyeL);
    this.eyeR.position.fromArray(meta.eyeCenters.eyeR);

    const loader = new GLTFLoader();
    const byKey = new Map(meta.parts.map((p) => [p.key, p]));
    for (const layer of ['skull', 'brain', 'eyes', 'muscles'] as const) {
      onProgress?.(`Carregando ${layer}…`);
      const gltf = await loader.loadAsync(`/xray/${layer}.glb`);
      const meshes: THREE.Mesh[] = [];
      gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
      for (const m of meshes) {
        const part = byKey.get(m.name) || byKey.get(m.parent?.name || '');
        const group = part?.group || 'head';
        m.geometry.computeVertexNormals();
        m.material = this.makeMaterial(layer, false);
        m.frustumCulled = false;
        m.removeFromParent();
        m.position.set(0, 0, 0);
        m.rotation.set(0, 0, 0);
        m.scale.set(1, 1, 1);
        const parent = group === 'jaw' ? this.jaw : group === 'eyeL' ? this.eyeL : group === 'eyeR' ? this.eyeR : this.fitGroup;
        parent.add(m);
        (this.layerMeshes[layer] ||= []).push(m);
      }
    }

    // Músculos da face: malha do rastreamento deformada ao vivo
    onProgress?.('Carregando malha do rosto…');
    const face = (await (await fetch('/xray/face_mesh.json')).json()) as { vertices: number[][]; faces: number[][] };
    const geo = new THREE.BufferGeometry();
    const n = face.vertices.length;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.faceCanon = new Float32Array(face.vertices.flat());
    geo.setAttribute('canon', new THREE.BufferAttribute(this.faceCanon, 3));
    geo.setIndex(face.faces.flat());
    this.faceMesh = new THREE.Mesh(geo, this.makeMaterial('face', true));
    this.faceMesh.frustumCulled = false;
    this.scene.add(this.faceMesh);
    (this.layerMeshes.muscles ||= []).push(this.faceMesh);

    // Mãos
    for (const side of ['R', 'L'] as const) {
      onProgress?.('Carregando ossos da mão…');
      const gltf = await loader.loadAsync(`/xray/hand${side}.glb`);
      const geos = new Map<string, THREE.BufferGeometry>();
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.computeVertexNormals();
          geos.set(m.name || m.parent?.name || '', m.geometry);
        }
      });
      this.handRigs[side] = { bones: meta.hands[side], geos };
    }
  }

  get anatomySource(): string {
    return this.meta?.source || '';
  }

  private makeMaterial(layer: string, canonAttr: boolean): THREE.ShaderMaterial {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        ...this.shared,
        uColor: { value: LAYER_COLORS[layer] || LAYER_COLORS.skull },
        uFill: { value: LAYER_FILL[layer] ?? 0.08 },
        uUseMask: { value: layer === 'hands' ? 0 : 1 },
      },
      defines: canonAttr ? { USE_CANON_ATTR: '' } : {},
      transparent: true,
      side: THREE.DoubleSide,
    });
    mat.userData.layer = layer;
    this.applyLook(mat);
    this.materials.push(mat);
    return mat;
  }

  private applyLook(mat: THREE.ShaderMaterial) {
    const solid = this.settings.look === 'solid';
    mat.blending = solid ? THREE.NormalBlending : THREE.AdditiveBlending;
    mat.depthWrite = solid;
    mat.depthTest = true;
    mat.side = solid ? THREE.FrontSide : THREE.DoubleSide;
    mat.needsUpdate = true;
  }

  setSize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.handCamera.left = 0;
    this.handCamera.right = width;
    this.handCamera.top = 0;
    this.handCamera.bottom = -height;
    this.handCamera.updateProjectionMatrix();
  }

  applySettings(s: XRaySettings, mirror: boolean) {
    const lookChanged = s.look !== this.settings.look;
    this.settings = s;
    this.shared.uBrightness.value = s.brightness;
    this.shared.uOpacity.value = 1 - 0.85 * s.showThrough;
    this.shared.uSolid.value = s.look === 'solid' ? 1 : 0;
    this.shared.uReveal.value = REVEAL_CODE[s.reveal];
    this.shared.uCut.value = s.cut;
    this.shared.uFeather.value = s.feather;
    this.shared.uMirror.value = mirror ? 1 : 0;
    if (lookChanged) this.materials.forEach((m) => this.applyLook(m));
    for (const layer of ['skull', 'brain', 'muscles', 'eyes'] as const) {
      for (const m of this.layerMeshes[layer] || []) m.visible = s.layers[layer];
    }
    const f = s.fit;
    this.fitGroup.position.set(f.x, f.y, f.z);
    this.fitGroup.scale.set(f.size * f.width, f.size * f.height, f.size * f.depth);
  }

  /** Lente do raio-X em coordenadas normalizadas da câmera (sem espelho). */
  setLens(p: { x: number; y: number } | null) {
    const r = (0.08 + 0.22 * this.settings.lensSize) * this.height;
    if (!p) this.shared.uLens.value.set(-99999, -99999, r);
    else this.shared.uLens.value.set(p.x * this.width, (1 - p.y) * this.height, r);
  }

  /**
   * Raio da mão: centro e raio da área revelada em pixels do quadro da câmera (sem espelho),
   * e a intensidade (0 = nada aparece, 1 = totalmente revelado).
   */
  setBeam(spot: { x: number; y: number; r: number } | null, gain: number) {
    this.shared.uGain.value = spot ? gain : 0;
    if (!spot) this.shared.uLens.value.set(-99999, -99999, 1);
    else this.shared.uLens.value.set(spot.x, this.height - spot.y, Math.max(1, spot.r));
    this.shared.uTime.value = performance.now() / 1000;
  }

  updateFace(face: FaceInput | null) {
    this.faceVisible = !!face;
    this.headRoot.visible = !!face;
    if (this.faceMesh) this.faceMesh.visible = !!face && this.settings.layers.muscles;
    if (!face) return;

    this.headRoot.matrix.copy(face.matrix);
    this.headRoot.matrixWorldNeedsUpdate = true;

    // Mandíbula acompanha a boca
    const jaw = face.blend.jawOpen ?? 0;
    this.jawOpen += (jaw - this.jawOpen) * 0.6;
    this.jaw.rotation.x = Math.min(1, this.jawOpen * 1.15) * 0.42;

    // Olhos acompanham o olhar
    const b = face.blend;
    const yawL = ((b.eyeLookOutLeft ?? 0) - (b.eyeLookInLeft ?? 0)) * 0.5;
    const yawR = ((b.eyeLookInRight ?? 0) - (b.eyeLookOutRight ?? 0)) * 0.5;
    const pitchL = -((b.eyeLookUpLeft ?? 0) - (b.eyeLookDownLeft ?? 0)) * 0.4;
    const pitchR = -((b.eyeLookUpRight ?? 0) - (b.eyeLookDownRight ?? 0)) * 0.4;
    this.eyeL.rotation.set(pitchL, yawL, 0);
    this.eyeR.rotation.set(pitchR, yawR, 0);
    this.headRoot.updateMatrixWorld(true);
    this.shared.uHeadInv.value.copy(this.headRoot.matrixWorld).invert();

    // Malha do rosto: profundidade do modelo rígido + posição exata dos pontos na imagem
    if (this.faceMesh && this.faceCanon && face.landmarks.length >= 468) {
      const pos = this.faceMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const tanY = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
      const tanX = tanY * this.camera.aspect;
      const v = new THREE.Vector3();
      for (let i = 0; i < 468; i++) {
        v.set(this.faceCanon[i * 3], this.faceCanon[i * 3 + 1], this.faceCanon[i * 3 + 2]);
        v.applyMatrix4(face.matrix);
        const d = -v.z;
        const l = face.landmarks[i];
        pos.setXYZ(i, (2 * l.x - 1) * d * tanX, (1 - 2 * l.y) * d * tanY, -d);
      }
      pos.needsUpdate = true;
      this.faceMesh.geometry.computeVertexNormals();
    }
  }

  updateHands(hands: HandInput[]) {
    // Esconde todas as mãos e reaproveita grupos
    for (const h of this.handPool) h.group.visible = false;
    if (!this.settings.layers.hands) return;
    const W = this.width;
    const H = this.height;
    hands.forEach((hand) => {
      const side: 'R' | 'L' = hand.physicalRight ? 'R' : 'L';
      const rig = this.handRigs[side];
      if (!rig) return;
      let slot = this.handPool.find((h) => h.side === side && !h.group.visible);
      if (!slot) {
        const group = buildHandGroup(rig, (layer) => this.makeMaterial(layer, false));
        this.handScene.add(group);
        slot = { side, group };
        this.handPool.push(slot);
      }
      slot.group.visible = true;
      const P = hand.landmarks.map((l) => new THREE.Vector3(l.x * W, -l.y * H, -l.z * W));
      poseHand(slot.group, rig, P);
    });
  }

  render() {
    const r = this.renderer;
    r.clear(true, true, true);
    if (this.faceVisible) r.render(this.scene, this.camera);
    r.clearDepth();
    r.render(this.handScene, this.handCamera);
  }

  /** Projeta os rótulos visíveis para pixels do quadro da câmera. */
  projectLabels(): LabelPoint[] {
    if (!this.faceVisible || !this.meta) return [];
    const out: LabelPoint[] = [];
    const v = new THREE.Vector3();
    const s = this.settings;
    for (const p of this.meta.parts) {
      if (!p.label || !s.layers[p.layer]) continue;
      const parent = p.group === 'jaw' ? this.jaw : p.group === 'eyeL' ? this.eyeL : p.group === 'eyeR' ? this.eyeR : this.fitGroup;
      v.fromArray(p.anchor);
      if (parent !== this.fitGroup) v.sub(parent.position);
      if (!this.anchorRevealed(p.anchor)) continue;
      v.applyMatrix4(parent.matrixWorld);
      v.project(this.camera);
      if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) continue;
      out.push({ text: p.label, x: (v.x * 0.5 + 0.5) * this.width, y: (0.5 - v.y * 0.5) * this.height, layer: p.layer });
    }
    return out;
  }

  /** Contorno do rosto (pixels do quadro) e centro/raio da cabeça para posicionar os rótulos. */
  headScreen(): { cx: number; cy: number; r: number } | null {
    if (!this.faceVisible) return null;
    const c = new THREE.Vector3(0, 1.5, -2).applyMatrix4(this.headRoot.matrixWorld).project(this.camera);
    const t = new THREE.Vector3(0, 12, -2).applyMatrix4(this.headRoot.matrixWorld).project(this.camera);
    const cx = (c.x * 0.5 + 0.5) * this.width;
    const cy = (0.5 - c.y * 0.5) * this.height;
    const ty = (0.5 - t.y * 0.5) * this.height;
    const tx = (t.x * 0.5 + 0.5) * this.width;
    return { cx, cy, r: Math.hypot(tx - cx, ty - cy) };
  }

  private anchorRevealed(a: [number, number, number]): boolean {
    const s = this.settings;
    const mirror = this.shared.uMirror.value > 0.5;
    switch (s.reveal) {
      case 'left':
      case 'right': {
        const side = (s.reveal === 'left' ? 1 : -1) * (mirror ? 1 : -1);
        return side * a[0] > side * (s.cut - 0.5) * 16;
      }
      case 'top': return a[1] > 14 + (-12 - 14) * s.cut;
      case 'lower': return a[1] < -12 + (14 + 12) * s.cut;
      default: return true;
    }
  }

  dispose() {
    this.renderer.dispose();
    this.materials.forEach((m) => m.dispose());
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
  }
}

// --- MÃOS ---------------------------------------------------------------------------------------

interface HandRig {
  bones: HandBoneMeta[];
  geos: Map<string, THREE.BufferGeometry>;
}

function buildHandGroup(rig: HandRig, makeMat: (layer: string) => THREE.ShaderMaterial): THREE.Group {
  const group = new THREE.Group();
  const mat = makeMat('hands');
  for (const b of rig.bones) {
    const geo = rig.geos.get(b.key);
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = b.key;
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  return group;
}

const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();

function frameMatrix(out: THREE.Matrix4, origin: THREE.Vector3, axis: THREE.Vector3, normal: THREE.Vector3, sAxis: number, sSide: number) {
  _y.copy(axis).normalize();
  _z.copy(normal).addScaledVector(_y, -normal.dot(_y));
  if (_z.lengthSq() < 1e-8) _z.set(0, 0, 1);
  _z.normalize();
  _x.crossVectors(_y, _z);
  out.makeBasis(_x.multiplyScalar(sSide), _y.multiplyScalar(sAxis), _z.multiplyScalar(sSide));
  out.setPosition(origin);
}

function poseHand(group: THREE.Group, rig: HandRig, P: THREE.Vector3[]) {
  const wrist = P[0];
  const palmAxis = new THREE.Vector3().subVectors(P[9], wrist);
  const palmLen = Math.max(1, palmAxis.length());
  const normal = new THREE.Vector3()
    .crossVectors(new THREE.Vector3().subVectors(P[5], wrist), new THREE.Vector3().subVectors(P[17], wrist))
    .normalize();
  for (const b of rig.bones) {
    const mesh = group.getObjectByName(b.key) as THREE.Mesh | undefined;
    if (!mesh) continue;
    if (b.type === 'palm') {
      frameMatrix(mesh.matrix, wrist, palmAxis, normal, palmLen, palmLen);
    } else if (b.a !== undefined && b.b !== undefined) {
      const A = P[b.a];
      const axis = new THREE.Vector3().subVectors(P[b.b], A);
      const len = Math.max(1, axis.length());
      frameMatrix(mesh.matrix, A, axis, normal, len, (b.width || 0.3) * palmLen);
    }
    mesh.matrixWorldNeedsUpdate = true;
  }
}

/** Converte a matriz do Face Landmarker para Matrix4 (detecta se veio por linhas ou colunas). */
export function faceMatrixToThree(m: { rows: number; columns: number; data: number[] }): THREE.Matrix4 {
  const d = m.data;
  const out = new THREE.Matrix4();
  // Translação típica: z entre -20 e -200 cm. Em coluna-maior ela está em d[12..14].
  const colMajorZ = d[14];
  const rowMajorZ = d[11];
  if (Math.abs(colMajorZ) >= Math.abs(rowMajorZ)) out.fromArray(d);
  else out.fromArray(d).transpose();
  return out;
}

/** Ângulos da cabeça (graus) a partir da matriz: virar (yaw), acenar (pitch), inclinar (roll). */
export function headAngles(m: THREE.Matrix4): { yaw: number; pitch: number; roll: number; distance: number } {
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  m.decompose(p, q, s);
  const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
  const deg = THREE.MathUtils.radToDeg;
  return { yaw: deg(e.y), pitch: deg(e.x), roll: deg(e.z), distance: -p.z };
}
