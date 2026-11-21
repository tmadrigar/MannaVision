// src/components/XRayMirrorApp.tsx
//
// Modo "Espelho Raio-X": crânio, cérebro, músculos e olhos 3D (BodyParts3D) presos ao rosto pela
// webcam, mandíbula que abre com a boca, olhos que seguem o olhar e os ossos da mão sobre a mão.
// No modo "Raio da mão" (padrão) a anatomia só aparece onde o raio que sai da palma atinge o rosto,
// e a área revelada cresce conforme a mão se aproxima da cabeça.

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { FaceLandmarker, HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import {
  ArrowLeft, FlipHorizontal, ScanFace, Circle, Square, AlertCircle, Loader2, PanelRightClose, PanelRightOpen, RotateCcw, Zap,
} from 'lucide-react';
import { RESOLUTION_PRESETS } from './HandDrawingApp';
import {
  XRayScene, XRaySettings, DEFAULT_XRAY_SETTINGS, LayerId, RevealId, LabelPoint,
  faceMatrixToThree, headAngles, HandInput,
} from '../utils/xray/xrayScene';

type ThemeColor = 'purple' | 'blue' | 'green' | 'pink';

interface XRayMirrorAppProps {
  onBackToHub: () => void;
  themeColor: ThemeColor;
  setThemeColor: React.Dispatch<React.SetStateAction<ThemeColor>>;
}

const LS_KEY = 'mannavision_xray_settings';

const LAYER_INFO: { id: LayerId; label: string; dot: string }[] = [
  { id: 'skull', label: 'Crânio', dot: '#dfe9ff' },
  { id: 'brain', label: 'Cérebro', dot: '#ff7fb6' },
  { id: 'muscles', label: 'Músculos', dot: '#ff5a4f' },
  { id: 'eyes', label: 'Olhos', dot: '#ffe9a8' },
  { id: 'outline', label: 'Contorno', dot: '#4f8bff' },
  { id: 'hands', label: 'Ossos da mão', dot: '#e8f0ff' },
];

const LABEL_COLOR: Record<string, string> = {
  skull: '#e6eeff',
  brain: '#ff9cc6',
  muscles: '#ff8a80',
  eyes: '#ffe9a8',
};

const PRESETS: { label: string; layers: Partial<Record<LayerId, boolean>> }[] = [
  { label: 'Crânio', layers: { skull: true, brain: false, muscles: false, eyes: true } },
  { label: 'Cérebro', layers: { skull: false, brain: true, muscles: false, eyes: false } },
  { label: 'Músculos', layers: { skull: false, brain: false, muscles: true, eyes: true } },
  { label: 'Tudo', layers: { skull: true, brain: true, muscles: true, eyes: true } },
];

const REVEALS: { id: RevealId; label: string }[] = [
  { id: 'beam', label: 'Raio da mão (aproxime a mão)' },
  { id: 'whole', label: 'Cabeça inteira' },
  { id: 'left', label: 'Só metade esquerda' },
  { id: 'right', label: 'Só metade direita' },
  { id: 'top', label: 'Só o topo da cabeça' },
  { id: 'lower', label: 'Só a parte de baixo do rosto' },
  { id: 'lens', label: 'Lente de raio-X (segue o seu dedo)' },
];

interface UiSettings extends XRaySettings {
  showLabels: boolean;
  showData: boolean;
  v: number;
}

const SETTINGS_VERSION = 2;

/** Estado do raio da mão, em pixels do quadro da câmera (sem espelho). */
interface BeamState {
  level: number;        // 0..1, suavizado
  gain: number;         // intensidade aplicada ao modelo
  x: number;            // ponto do rosto atingido
  y: number;
  r: number;            // raio da área revelada
  palm: { x: number; y: number } | null;
  handSize: number;
}

function loadSettings(): UiSettings {
  const base: UiSettings = { ...DEFAULT_XRAY_SETTINGS, showLabels: true, showData: false, v: SETTINGS_VERSION };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const merged: UiSettings = { ...base, ...s, layers: { ...base.layers, ...s.layers }, fit: { ...base.fit, ...s.fit }, v: SETTINGS_VERSION };
      // Quem já usava a versão anterior passa a abrir no novo modo "Raio da mão"
      if (s.v !== SETTINGS_VERSION) merged.reveal = 'beam';
      return merged;
    }
  } catch { /* ignora */ }
  return base;
}

interface Stats {
  face: boolean;
  distance: number;
  yaw: number;
  pitch: number;
  roll: number;
  jaw: number;
  hands: string;
  finger: string;
  beam: number;
  fps: number;
}

const XRayMirrorApp: React.FC<XRayMirrorAppProps> = ({ onBackToHub }) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<XRayScene | null>(null);
  const faceLmRef = useRef<FaceLandmarker | null>(null);
  const handLmRef = useRef<HandLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraGenRef = useRef(0);
  const settingsRef = useRef<UiSettings>(loadSettings());
  const isMirrorRef = useRef(true);
  const rectRef = useRef({ left: 0, top: 0, w: 1, h: 1 });
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);

  const [settings, setSettings] = useState<UiSettings>(settingsRef.current);
  const [isMirror, setIsMirror] = useState(true);
  const [showPanel, setShowPanel] = useState(true);
  const [loading, setLoading] = useState<string | null>('Preparando o raio-X…');
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>(() => localStorage.getItem('mannavision_camera_id') || '');
  const [selectedResId, setSelectedResId] = useState<string>(() => localStorage.getItem('mannavision_resolution') || '1280x720');
  const [isRecording, setIsRecording] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [rect, setRect] = useState({ left: 0, top: 0, w: 0, h: 0 });
  const [faceSeen, setFaceSeen] = useState(false);
  const [beamIdle, setBeamIdle] = useState(false);

  useEffect(() => { isMirrorRef.current = isMirror; sceneRef.current?.applySettings(settingsRef.current, isMirror); }, [isMirror]);

  const update = useCallback((partial: Partial<UiSettings>) => {
    setSettings((prev) => {
      const next: UiSettings = { ...prev, ...partial };
      settingsRef.current = next;
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ok */ }
      sceneRef.current?.applySettings(next, isMirrorRef.current);
      return next;
    });
  }, []);
  const setLayer = (id: LayerId, on: boolean) => update({ layers: { ...settingsRef.current.layers, [id]: on } });
  const setFit = (k: keyof XRaySettings['fit'], v: number) => update({ fit: { ...settingsRef.current.fit, [k]: v } });

  // --- 1. CENA 3D + MODELOS DE RASTREAMENTO ---
  useEffect(() => {
    let cancelled = false;
    const canvas = glCanvasRef.current;
    if (!canvas) return;
    let scene: XRayScene;
    try {
      scene = new XRayScene(canvas);
    } catch (e) {
      setError('WebGL indisponível neste navegador.');
      console.error(e);
      return;
    }
    sceneRef.current = scene;
    scene.applySettings(settingsRef.current, isMirrorRef.current);

    (async () => {
      try {
        await scene.load((msg) => !cancelled && setLoading(msg));
        if (cancelled) return;
        setLoading('Carregando rastreamento de rosto e mãos…');
        const fileset = await FilesetResolver.forVisionTasks('/mediapipe/tasks/wasm');
        const make = async (delegate: 'GPU' | 'CPU') => {
          const face = await FaceLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: '/mediapipe/tasks/face_landmarker.task', delegate },
            runningMode: 'VIDEO',
            numFaces: 1,
            outputFaceBlendshapes: true,
            outputFacialTransformationMatrixes: true,
          });
          const hands = await HandLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: '/mediapipe/tasks/hand_landmarker.task', delegate },
            runningMode: 'VIDEO',
            numHands: 2,
          });
          return { face, hands };
        };
        let lm;
        try {
          lm = await make('GPU');
        } catch (gpuErr) {
          console.warn('GPU indisponível para o MediaPipe, usando CPU:', gpuErr);
          lm = await make('CPU');
        }
        if (cancelled) { lm.face.close(); lm.hands.close(); return; }
        faceLmRef.current = lm.face;
        handLmRef.current = lm.hands;
        setLoading(null);
      } catch (e: unknown) {
        console.error(e);
        if (!cancelled) {
          setLoading(null);
          setError(`Não foi possível carregar o raio-X: ${e instanceof Error ? e.message : String(e)}. Rode "npm run setup:mediapipe" na pasta handraw-pipe.`);
        }
      }
    })();

    return () => {
      cancelled = true;
      faceLmRef.current?.close();
      handLmRef.current?.close();
      faceLmRef.current = null;
      handLmRef.current = null;
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // --- 2. CÂMERA ---
  const enumerateCameras = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const vids = devices.filter((d) => d.kind === 'videoinput');
      setCameras(vids);
      return vids;
    } catch {
      return [];
    }
  }, []);

  const startCamera = useCallback(async (deviceId?: string, resId?: string) => {
    const preset = RESOLUTION_PRESETS.find((p) => p.id === (resId || selectedResId)) || RESOLUTION_PRESETS[2];
    const gen = ++cameraGenRef.current;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraError(null);
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: preset.width }, height: { ideal: preset.height } }
            : { width: { ideal: preset.width }, height: { ideal: preset.height }, facingMode: 'user' },
          audio: false,
        });
      } catch (err) {
        if (!deviceId) throw err;
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: preset.width }, height: { ideal: preset.height } }, audio: false });
      }
      if (gen !== cameraGenRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      const devs = await enumerateCameras();
      const devId = stream.getVideoTracks()[0]?.getSettings().deviceId || deviceId || devs[0]?.deviceId || '';
      if (devId) {
        setSelectedCameraId(devId);
        localStorage.setItem('mannavision_camera_id', devId);
      }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      try { await video.play(); } catch (e) { console.warn('Play video:', e); }
    } catch (err: unknown) {
      console.error('Erro ao acessar webcam:', err);
      setCameraError(err instanceof Error ? err.message : 'Não foi possível acessar a câmera.');
    }
  }, [selectedResId, enumerateCameras]);

  useEffect(() => {
    const genRef = cameraGenRef;
    startCamera(localStorage.getItem('mannavision_camera_id') || undefined, localStorage.getItem('mannavision_resolution') || undefined);
    return () => {
      genRef.current++;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [startCamera]);

  // --- 3. LAÇO: RASTREAR, RENDERIZAR E DESENHAR RÓTULOS ---
  useEffect(() => {
    let raf = 0;
    let lastTs = 0;
    let frames = 0;
    let fpsT = performance.now();
    let fps = 0;
    let lastStats = 0;
    let sawFace = false;
    let lastFrame = performance.now();
    let wasIdle = false;
    const beam: BeamState = { level: 0, gain: 0, x: 0, y: 0, r: 0, palm: null, handSize: 0 };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const video = videoRef.current;
      const stage = stageRef.current;
      const scene = sceneRef.current;
      if (!video || !stage || !scene) return;
      if (video.readyState < 2 || !video.videoWidth) return;

      // Layout "cover": vídeo, canvas 3D e rótulos ocupam o mesmo retângulo
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const cw = stage.clientWidth;
      const ch = stage.clientHeight;
      const sc = Math.max(cw / vw, ch / vh);
      const r = { left: (cw - vw * sc) / 2, top: (ch - vh * sc) / 2, w: vw * sc, h: vh * sc };
      const prev = rectRef.current;
      if (Math.abs(prev.w - r.w) > 0.5 || Math.abs(prev.h - r.h) > 0.5 || Math.abs(prev.left - r.left) > 0.5 || Math.abs(prev.top - r.top) > 0.5) {
        rectRef.current = r;
        setRect(r);
      }
      const gl = glCanvasRef.current!;
      if (scene.width !== vw || scene.height !== vh || gl.width !== vw || gl.height !== vh) scene.setSize(vw, vh);

      const now = performance.now();
      const ts = Math.max(lastTs + 1, now);
      lastTs = ts;

      // Rastreamento
      const s = settingsRef.current;
      let faceOk = false;
      let statsFace: Partial<Stats> = {};
      const faceLm = faceLmRef.current;
      const handLm = handLmRef.current;
      let fingertip: { x: number; y: number } | null = null;
      const handInputs: HandInput[] = [];
      const handNames: string[] = [];
      let faceLandmarks: { x: number; y: number; z: number }[] | null = null;

      if (faceLm) {
        const res = faceLm.detectForVideo(video, ts);
        const lms = res.faceLandmarks?.[0];
        const mat = res.facialTransformationMatrixes?.[0];
        if (lms && mat) {
          faceOk = true;
          faceLandmarks = lms;
          const matrix = faceMatrixToThree(mat);
          const blend: Record<string, number> = {};
          res.faceBlendshapes?.[0]?.categories.forEach((c) => { blend[c.categoryName] = c.score; });
          scene.updateFace({ matrix, landmarks: lms, blend });
          const a = headAngles(matrix);
          statsFace = { distance: a.distance, yaw: a.yaw, pitch: a.pitch, roll: a.roll, jaw: blend.jawOpen ?? 0 };
        } else {
          scene.updateFace(null);
        }
      }
      if (handLm) {
        const res = handLm.detectForVideo(video, ts);
        res.landmarks?.forEach((lm, i) => {
          const cat = res.handedness?.[i]?.[0]?.categoryName || 'Right';
          // O modelo assume imagem espelhada: na imagem crua da webcam, "Left" é a mão direita da pessoa
          const physicalRight = cat === 'Left';
          handInputs.push({ landmarks: lm, physicalRight });
          handNames.push(physicalRight ? 'direita' : 'esquerda');
          if (!fingertip) fingertip = { x: lm[8].x, y: lm[8].y };
        });
        scene.updateHands(handInputs);
      }
      // Raio da mão: quanto mais perto a palma está da cabeça, mais o raio revela
      const dt = Math.min(0.1, (now - lastFrame) / 1000);
      lastFrame = now;
      const head = faceOk ? scene.headScreen() : null;
      if (s.reveal === 'beam') {
        let target = 0;
        if (head) {
          const reach = 1.5 + 3 * s.beamReach; // em raios da cabeça, a partir da borda do rosto
          let best = -1;
          for (const h of handInputs) {
            const lm = h.landmarks;
            let px = 0;
            let py = 0;
            for (const k of [0, 5, 9, 13, 17]) { px += lm[k].x * vw; py += lm[k].y * vh; }
            px /= 5;
            py /= 5;
            const gap = Math.max(0, Math.hypot(px - head.cx, py - head.cy) - head.r * 0.9) / head.r;
            const prox = Math.pow(1 - Math.min(1, gap / reach), 1.15);
            if (prox > best) {
              best = prox;
              beam.palm = { x: px, y: py };
              beam.handSize = Math.hypot((lm[9].x - lm[0].x) * vw, (lm[9].y - lm[0].y) * vh);
            }
          }
          target = Math.max(0, best);
        }
        // sobe rápido, apaga devagar
        const tau = target > beam.level ? 0.12 : 0.45;
        beam.level += (target - beam.level) * (1 - Math.exp(-dt / tau));
        if (beam.level < 0.002) beam.level = 0;
        beam.gain = Math.min(1, beam.level * 2.5);
        if (head && beam.palm) {
          // o raio toca a borda do rosto do lado da mão e avança para o centro conforme ela chega perto
          const dx = beam.palm.x - head.cx;
          const dy = beam.palm.y - head.cy;
          const d = Math.hypot(dx, dy) || 1;
          const off = Math.min(d, head.r * 0.85 * (1 - beam.level));
          const tx = head.cx + (dx / d) * off;
          const ty = head.cy + (dy / d) * off;
          const k = beam.r === 0 ? 1 : 1 - Math.exp(-dt / 0.07);
          beam.x += (tx - beam.x) * k;
          beam.y += (ty - beam.y) * k;
          beam.r = head.r * (0.35 + 1.2 * beam.level);
        }
        scene.setBeam(head && beam.level > 0 ? { x: beam.x, y: beam.y, r: beam.r } : null, beam.gain);
      } else {
        beam.level = 0;
        beam.gain = 0;
        scene.setLens(s.reveal === 'lens' ? fingertip : null);
      }
      scene.render();
      if (faceOk !== sawFace) { sawFace = faceOk; setFaceSeen(faceOk); }
      const idle = s.reveal === 'beam' && faceOk && beam.level < 0.03;
      if (idle !== wasIdle) { wasIdle = idle; setBeamIdle(idle); }

      // Rótulos, contorno, lente e feixe (canvas 2D por cima)
      drawOverlay(scene, faceLandmarks, fingertip, vw, vh, s.reveal === 'beam' ? beam : null, now);

      // Gravação: compõe vídeo + raio-X + rótulos
      if (recorderRef.current && recordCanvasRef.current) composeRecording(recordCanvasRef.current, video, gl, overlayRef.current!);

      // Estatísticas
      frames++;
      if (now - fpsT > 1000) { fps = (frames * 1000) / (now - fpsT); frames = 0; fpsT = now; }
      if (s.showData && now - lastStats > 250) {
        lastStats = now;
        const ft = fingertip as { x: number; y: number } | null;
        setStats({
          face: faceOk,
          distance: statsFace.distance ?? 0,
          yaw: statsFace.yaw ?? 0,
          pitch: statsFace.pitch ?? 0,
          roll: statsFace.roll ?? 0,
          jaw: statsFace.jaw ?? 0,
          hands: handNames.length ? handNames.join(', ') : 'nenhuma',
          finger: ft ? `${ft.x.toFixed(2)}, ${ft.y.toFixed(2)}` : '—',
          beam: beam.level,
          fps,
        });
      }
    };

    const drawOverlay = (
      scene: XRayScene,
      lms: { x: number; y: number; z: number }[] | null,
      fingertip: { x: number; y: number } | null,
      vw: number,
      vh: number,
      beam: BeamState | null,
      now: number,
    ) => {
      const ov = overlayRef.current;
      if (!ov) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = rectRef.current;
      const W = Math.round(r.w * dpr);
      const H = Math.round(r.h * dpr);
      if (ov.width !== W || ov.height !== H) { ov.width = W; ov.height = H; }
      const ctx = ov.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      const s = settingsRef.current;
      const mirror = isMirrorRef.current;
      const toX = (x: number) => (mirror ? 1 - x : x) * W;
      const toY = (y: number) => y * H;

      // Contorno da cabeça
      if (lms && s.layers.outline) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineJoin = 'round';
        for (const [w, a] of [[14, 0.12], [6, 0.3], [2, 0.85]] as const) {
          ctx.beginPath();
          FaceLandmarker.FACE_LANDMARKS_FACE_OVAL.forEach((c, i) => {
            const p = lms[c.start];
            if (i === 0) ctx.moveTo(toX(p.x), toY(p.y));
            else ctx.lineTo(toX(p.x), toY(p.y));
          });
          ctx.closePath();
          ctx.strokeStyle = `rgba(79,139,255,${a * (beam ? 0.35 + 0.65 * beam.gain : 1)})`;
          ctx.lineWidth = w * dpr;
          ctx.stroke();
        }
        ctx.restore();
      }

      // Lente
      if (s.reveal === 'lens' && fingertip) {
        const f = fingertip as { x: number; y: number };
        const rad = (0.08 + 0.22 * s.lensSize) * H;
        ctx.beginPath();
        ctx.arc(toX(f.x), toY(f.y), rad, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(160,200,255,0.55)';
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();
      }

      // Feixe de luz da palma até o ponto atingido no rosto
      if (beam && beam.palm && beam.level > 0.01 && lms) {
        const L = beam.level;
        const t = now / 1000;
        const k = H / vh;
        const ax = toX(beam.palm.x / vw);
        const ay = toY(beam.palm.y / vh);
        const bx = toX(beam.x / vw);
        const by = toY(beam.y / vh);
        const dx = bx - ax;
        const dy = by - ay;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const wa = Math.max(10 * dpr, beam.handSize * k * 0.5);
        const wb = Math.max(wa, beam.r * k * 0.75);
        const flick = 0.85 + 0.15 * Math.sin(t * 37) * Math.sin(t * 23);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const cone = (wA: number, wB: number, a0: number, a1: number) => {
          const g = ctx.createLinearGradient(ax, ay, bx, by);
          g.addColorStop(0, `rgba(140,210,255,${a0 * L * flick})`);
          g.addColorStop(1, `rgba(90,170,255,${a1 * L * flick})`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(ax + nx * wA, ay + ny * wA);
          ctx.lineTo(bx + nx * wB, by + ny * wB);
          ctx.lineTo(bx - nx * wB, by - ny * wB);
          ctx.lineTo(ax - nx * wA, ay - ny * wA);
          ctx.closePath();
          ctx.fill();
        };
        cone(wa, wb, 0.38, 0.12);
        cone(wa * 0.3, wb * 0.2, 0.7, 0.22);
        // partículas viajando da mão para o rosto
        for (let i = 0; i < 22; i++) {
          const u = (t * 0.9 + i / 22) % 1;
          const lat = Math.sin(i * 12.9898) * 0.85;
          const w = wa + (wb - wa) * u;
          const px = ax + dx * u + nx * lat * w;
          const py = ay + dy * u + ny * lat * w;
          ctx.fillStyle = `rgba(200,235,255,${0.8 * L * Math.sin(Math.PI * u)})`;
          ctx.beginPath();
          ctx.arc(px, py, (1.2 + (i % 3) * 0.6) * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
        // brilho na palma
        const pg = ctx.createRadialGradient(ax, ay, 0, ax, ay, wa * 1.8);
        pg.addColorStop(0, `rgba(190,230,255,${0.55 * L * flick})`);
        pg.addColorStop(1, 'rgba(90,170,255,0)');
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.arc(ax, ay, wa * 1.8, 0, Math.PI * 2);
        ctx.fill();
        // anel do scanner no ponto atingido
        const rb = beam.r * k;
        ctx.strokeStyle = `rgba(150,215,255,${0.85 * L})`;
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.arc(bx, by, rb, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([10 * dpr, 14 * dpr]);
        ctx.lineDashOffset = -t * 60 * dpr;
        ctx.strokeStyle = `rgba(150,215,255,${0.6 * L})`;
        ctx.lineWidth = 1.2 * dpr;
        ctx.beginPath();
        ctx.arc(bx, by, rb * 1.07, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Rótulos anatômicos em duas colunas
      if (lms && s.showLabels && (!beam || beam.gain > 0.05)) {
        const head = scene.headScreen();
        let pts: LabelPoint[] = scene.projectLabels();
        // com o raio, só aparecem os nomes do que ele está iluminando
        if (beam) pts = pts.filter((p) => Math.hypot(p.x - beam.x, p.y - beam.y) < beam.r * 0.95);
        if (head && pts.length) {
          const hx = toX(head.cx / vw);
          const radius = (head.r / vh) * H;
          const cols: Record<'L' | 'R', { p: LabelPoint; x: number; y: number }[]> = { L: [], R: [] };
          for (const p of pts) {
            const x = toX(p.x / vw);
            const y = toY(p.y / vh);
            cols[x < hx ? 'L' : 'R'].push({ p, x, y });
          }
          const gap = 15 * dpr;
          ctx.save();
          if (beam) ctx.globalAlpha = beam.gain;
          ctx.font = `600 ${11 * dpr}px "Inter", system-ui, sans-serif`;
          ctx.textBaseline = 'middle';
          for (const side of ['L', 'R'] as const) {
            const list = cols[side].sort((a, b) => a.y - b.y);
            const colX = side === 'L' ? Math.max(8 * dpr, hx - radius * 1.25) : Math.min(W - 8 * dpr, hx + radius * 1.25);
            // distribui sem sobreposição
            const ys = list.map((l) => l.y);
            for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + gap);
            const overflow = ys.length ? ys[ys.length - 1] - (H - 10 * dpr) : 0;
            if (overflow > 0) for (let i = 0; i < ys.length; i++) ys[i] -= overflow;
            list.forEach((l, i) => {
              const color = LABEL_COLOR[l.p.layer] || '#fff';
              const ly = ys[i];
              ctx.strokeStyle = 'rgba(255,255,255,0.45)';
              ctx.lineWidth = 0.8 * dpr;
              ctx.beginPath();
              ctx.moveTo(l.x, l.y);
              ctx.lineTo(colX + (side === 'L' ? 6 : -6) * dpr, ly);
              ctx.stroke();
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(l.x, l.y, 1.8 * dpr, 0, Math.PI * 2);
              ctx.fill();
              ctx.textAlign = side === 'L' ? 'right' : 'left';
              ctx.shadowColor = 'rgba(0,0,0,0.9)';
              ctx.shadowBlur = 4 * dpr;
              ctx.fillText(l.p.text, colX, ly);
              ctx.shadowBlur = 0;
            });
          }
          ctx.restore();
        }
      }
    };

    const composeRecording = (out: HTMLCanvasElement, video: HTMLVideoElement, gl: HTMLCanvasElement, ov: HTMLCanvasElement) => {
      const ctx = out.getContext('2d');
      if (!ctx) return;
      const W = out.width;
      const H = out.height;
      ctx.save();
      if (isMirrorRef.current) { ctx.translate(W, 0); ctx.scale(-1, 1); }
      ctx.drawImage(video, 0, 0, W, H);
      ctx.drawImage(gl, 0, 0, W, H);
      ctx.restore();
      ctx.drawImage(ov, 0, 0, W, H);
      ctx.save();
      ctx.font = `${Math.round(H * 0.018)}px system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.textAlign = 'right';
      ctx.fillText('Modelos anatômicos: BodyParts3D, © DBCLS, CC BY 4.0', W - 12, H - 12);
      ctx.restore();
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // --- GRAVAÇÃO ---
  const toggleRecording = () => {
    if (isRecording) { recorderRef.current?.stop(); return; }
    const video = videoRef.current;
    if (!video || !video.videoWidth || typeof MediaRecorder === 'undefined') {
      alert('Gravação indisponível: a câmera precisa estar ativa.');
      return;
    }
    const out = document.createElement('canvas');
    out.width = video.videoWidth;
    out.height = video.videoHeight;
    recordCanvasRef.current = out;
    const stream = (out as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 10_000_000 } : undefined);
    recordChunksRef.current = [];
    rec.ondataavailable = (ev) => { if (ev.data.size > 0) recordChunksRef.current.push(ev.data); };
    rec.onstop = () => {
      const blob = new Blob(recordChunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `espelho-raio-x-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      stream.getTracks().forEach((t) => t.stop());
      recorderRef.current = null;
      recordCanvasRef.current = null;
      setIsRecording(false);
    };
    rec.start(250);
    recorderRef.current = rec;
    setIsRecording(true);
  };
  useEffect(() => () => { recorderRef.current?.stop(); }, []);

  const handleCameraChange = (id: string) => { setSelectedCameraId(id); localStorage.setItem('mannavision_camera_id', id); startCamera(id, selectedResId); };
  const handleResolutionChange = (id: string) => { setSelectedResId(id); localStorage.setItem('mannavision_resolution', id); startCamera(selectedCameraId, id); };

  const mirrorStyle: React.CSSProperties = { transform: isMirror ? 'scaleX(-1)' : 'none' };
  const rectStyle: React.CSSProperties = { left: rect.left, top: rect.top, width: rect.w, height: rect.h };

  const slider = (label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void, shown?: string) => (
    <label className="flex items-center justify-between gap-3">
      <span className="text-gray-300 whitespace-nowrap">{label} {shown && <span className="text-gray-500">{shown}</span>}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-32 accent-sky-300" />
    </label>
  );

  const f = settings.fit;

  return (
    <div className="h-screen w-screen max-h-screen overflow-hidden flex flex-col bg-black text-white select-none">
      {/* HEADER */}
      <header className="h-12 min-h-[48px] bg-black/50 backdrop-blur-md border-b border-[var(--border)]/20 px-4 flex items-center justify-between z-30 flex-shrink-0">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBackToHub}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-all hover:scale-105 border border-white/10"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Hub Principal</span>
          </button>
          <img src="/logo_manna_vision.png" alt="MannaVision Logo" className="h-6 object-contain hidden sm:inline" />
          <div className="hidden md:flex items-center space-x-2 border-l border-white/20 pl-3">
            <ScanFace className="w-3.5 h-3.5 text-sky-300" />
            <span className="text-xs font-semibold text-sky-200">Espelho Raio-X</span>
            <span className="text-[10px] text-gray-400">• anatomia 3D presa ao seu rosto</span>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={toggleRecording}
            className={`p-1.5 rounded-lg text-xs flex items-center space-x-1 border ${isRecording ? 'bg-red-500/25 border-red-500/60 text-red-300 animate-pulse' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'}`}
            title={isRecording ? 'Parar e baixar a gravação' : 'Gravar vídeo'}
          >
            {isRecording ? <Square className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
            <span className="hidden lg:inline text-[11px]">{isRecording ? 'Parar' : 'Gravar'}</span>
          </button>
          <button
            onClick={() => update({ reveal: settings.reveal === 'beam' ? 'whole' : 'beam' })}
            className={`p-1.5 rounded-lg text-xs flex items-center space-x-1 border ${settings.reveal === 'beam' ? 'bg-sky-400/20 border-sky-400/60 text-sky-200' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'}`}
            title={settings.reveal === 'beam' ? 'Raio da mão ligado: aproxime a mão do rosto' : 'Ligar o raio da mão'}
          >
            <Zap className="w-3.5 h-3.5" />
            <span className="hidden lg:inline text-[11px]">Raio da mão</span>
          </button>
          <button
            onClick={() => setIsMirror(!isMirror)}
            className={`p-1.5 rounded-lg ${isMirror ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-gray-400'}`}
            title={isMirror ? 'Espelhamento ativado' : 'Espelhamento desativado'}
          >
            <FlipHorizontal className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowPanel(!showPanel)}
            className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:text-white"
            title="Mostrar/ocultar painel"
          >
            {showPanel ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        {/* PALCO */}
        <div className="relative flex-1 min-w-0 flex flex-col">
          <div ref={stageRef} className="relative flex-1 min-h-0 overflow-hidden bg-black">
            <video ref={videoRef} muted playsInline className="absolute object-cover" style={{ ...rectStyle, ...mirrorStyle }} />
            <canvas ref={glCanvasRef} className="absolute pointer-events-none" style={{ ...rectStyle, ...mirrorStyle }} />
            <canvas ref={overlayRef} className="absolute pointer-events-none" style={rectStyle} />

            {loading && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-xl bg-black/75 border border-sky-500/40 text-xs text-sky-200 flex items-center space-x-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{loading}</span>
              </div>
            )}
            {(error || cameraError) && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-xl bg-red-950/85 border border-red-500/50 text-xs text-red-200 flex items-center space-x-2 max-w-[90%]">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span>{error || `Câmera: ${cameraError}`}</span>
              </div>
            )}
            {!loading && !error && !cameraError && !faceSeen && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 px-4 py-1.5 rounded-full bg-black/60 border border-sky-500/30 text-xs text-sky-200 pointer-events-none">
                Olhe para a câmera para ver o seu crânio · levante a mão para ver os ossos
              </div>
            )}
            {!loading && !error && !cameraError && faceSeen && beamIdle && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 px-4 py-1.5 rounded-full bg-black/60 border border-sky-500/30 text-xs text-sky-200 pointer-events-none flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" /> Aproxime a mão do rosto para lançar o raio-X
              </div>
            )}
          </div>

          {/* RODAPÉ COM CRÉDITOS */}
          <footer className="flex-shrink-0 px-3 py-1 bg-black text-[9px] leading-tight text-gray-500 text-center">
            Modelos anatômicos: BodyParts3D, © The Database Center for Life Science, licenciados sob CC BY 4.0
            (malhas simplificadas e alinhadas pelo MannaVision). Modelo genérico de um adulto: mostra onde as estruturas
            costumam ficar, não é um exame seu nem ferramenta médica. O vídeo é processado neste computador.
          </footer>
        </div>

        {/* PAINEL */}
        {showPanel && (
          <aside className="w-80 flex-shrink-0 overflow-y-auto bg-[#0b111b] border-l border-white/10 p-3 space-y-3 text-xs">
            <section className="bg-white/[0.03] border border-white/10 rounded-xl p-3 space-y-2">
              <h3 className="text-[10px] font-bold tracking-widest text-gray-400">CAMADAS</h3>
              <div className="grid grid-cols-4 gap-1">
                {PRESETS.map((p) => (
                  <button key={p.label} onClick={() => update({ layers: { ...settingsRef.current.layers, ...p.layers } })} className="py-1 rounded-md bg-white/5 hover:bg-white/15 border border-white/10">
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                {LAYER_INFO.map((l) => (
                  <label key={l.id} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={settings.layers[l.id]} onChange={(e) => setLayer(l.id, e.target.checked)} className="accent-sky-300" />
                    <span className="w-2 h-2 rounded-full" style={{ background: l.dot }} />
                    <span>{l.label}</span>
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-2 cursor-pointer pt-1 border-t border-white/10">
                <input type="checkbox" checked={settings.showLabels} onChange={(e) => update({ showLabels: e.target.checked })} className="accent-sky-300" />
                <span>Mostrar nomes das estruturas</span>
              </label>
            </section>

            <section className="bg-white/[0.03] border border-white/10 rounded-xl p-3 space-y-2">
              <h3 className="text-[10px] font-bold tracking-widest text-gray-400">VISUAL</h3>
              <div className="grid grid-cols-2 gap-1">
                {(['xray', 'solid'] as const).map((l) => (
                  <button key={l} onClick={() => update({ look: l })} className={`py-1.5 rounded-md border ${settings.look === l ? 'bg-sky-300 text-black border-sky-300 font-bold' : 'bg-white/5 border-white/10'}`}>
                    {l === 'xray' ? 'Raio-X' : 'Sólido'}
                  </button>
                ))}
              </div>
              {slider('Brilho', settings.brightness, 0.3, 2, 0.05, (v) => update({ brightness: v }))}
            </section>

            <section className="bg-white/[0.03] border border-white/10 rounded-xl p-3 space-y-2">
              <h3 className="text-[10px] font-bold tracking-widest text-gray-400">REALIDADE MISTA</h3>
              {slider('Você aparecendo', settings.showThrough, 0, 1, 0.05, (v) => update({ showThrough: v }))}
              {slider('Suavizar borda', settings.feather, 0, 1, 0.05, (v) => update({ feather: v }), `${Math.round(settings.feather * 100)}%`)}
              <label className="flex items-center justify-between gap-2">
                <span className="text-gray-300">Revelar</span>
                <select value={settings.reveal} onChange={(e) => update({ reveal: e.target.value as RevealId })} className="bg-black/60 border border-white/15 rounded-md px-1.5 py-1 max-w-[11rem]">
                  {REVEALS.map((r) => <option key={r.id} value={r.id} className="bg-gray-900">{r.label}</option>)}
                </select>
              </label>
              {settings.reveal === 'beam'
                ? slider('Alcance do raio', settings.beamReach, 0, 1, 0.05, (v) => update({ beamReach: v }))
                : settings.reveal === 'lens'
                  ? slider('Tamanho da lente', settings.lensSize, 0, 1, 0.05, (v) => update({ lensSize: v }))
                  : settings.reveal !== 'whole' && slider('Posição do corte', settings.cut, 0, 1, 0.01, (v) => update({ cut: v }))}
            </section>

            <section className="bg-white/[0.03] border border-white/10 rounded-xl p-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={settings.showData} onChange={(e) => update({ showData: e.target.checked })} className="accent-sky-300" />
                <span>Mostrar dados do rastreamento</span>
              </label>
              {settings.showData && stats && (
                <pre className="font-mono text-[10.5px] leading-relaxed text-gray-300 bg-black/40 rounded-lg p-2 whitespace-pre-wrap">
{`rosto          ${stats.face ? 'rastreado, 478 pontos' : 'não encontrado'}
distância      ${stats.face ? `${Math.round(stats.distance)} cm (estimativa)` : '—'}
virar/acenar/inclinar ${stats.face ? `${Math.round(stats.yaw)}° / ${Math.round(stats.pitch)}° / ${Math.round(stats.roll)}°` : '—'}
boca aberta    ${stats.jaw.toFixed(2)}
mãos           ${stats.hands}
ponta do indicador ${stats.finger}
raio da mão    ${Math.round(stats.beam * 100)}%
velocidade     ${Math.round(stats.fps)} quadros/s`}
                </pre>
              )}
            </section>

            <section className="bg-white/[0.03] border border-white/10 rounded-xl p-3 space-y-2">
              <h3 className="text-[10px] font-bold tracking-widest text-gray-400">AJUSTAR À MINHA CABEÇA</h3>
              {slider('Tamanho', f.size, 0.6, 1.5, 0.01, (v) => setFit('size', v), `${Math.round(f.size * 100)}%`)}
              {slider('Largura', f.width, 0.7, 1.3, 0.01, (v) => setFit('width', v), `${Math.round(f.width * 100)}%`)}
              {slider('Altura', f.height, 0.7, 1.3, 0.01, (v) => setFit('height', v), `${Math.round(f.height * 100)}%`)}
              {slider('Profundidade', f.depth, 0.7, 1.3, 0.01, (v) => setFit('depth', v), `${Math.round(f.depth * 100)}%`)}
              {slider('Esquerda/direita', f.x, -3, 3, 0.1, (v) => setFit('x', v), `${f.x.toFixed(1)} cm`)}
              {slider('Cima/baixo', f.y, -3, 3, 0.1, (v) => setFit('y', v), `${f.y.toFixed(1)} cm`)}
              {slider('Frente/trás', f.z, -3, 3, 0.1, (v) => setFit('z', v), `${f.z.toFixed(1)} cm`)}
              <button onClick={() => update({ fit: { ...DEFAULT_XRAY_SETTINGS.fit } })} className="flex items-center gap-1 text-sky-300 hover:text-sky-200">
                <RotateCcw className="w-3 h-3" /> Restaurar ajuste
              </button>
              <p className="text-[10.5px] text-gray-500 leading-snug">
                Dica: escolha o visual Sólido, deixe "Você aparecendo" pela metade e alinhe o crânio ao seu rosto.
              </p>
            </section>

            <section className="bg-white/[0.03] border border-white/10 rounded-xl p-3 space-y-2">
              <h3 className="text-[10px] font-bold tracking-widest text-gray-400">CÂMERA</h3>
              <select value={selectedCameraId} onChange={(e) => handleCameraChange(e.target.value)} className="w-full bg-black/60 border border-white/15 rounded-md px-1.5 py-1">
                {cameras.length === 0
                  ? <option value="">Câmera padrão</option>
                  : cameras.map((d, i) => <option key={d.deviceId || i} value={d.deviceId} className="bg-gray-900">{d.label || `Câmera ${i + 1}`}</option>)}
              </select>
              <select value={selectedResId} onChange={(e) => handleResolutionChange(e.target.value)} className="w-full bg-black/60 border border-white/15 rounded-md px-1.5 py-1">
                {RESOLUTION_PRESETS.map((p) => <option key={p.id} value={p.id} className="bg-gray-900">{p.desc}</option>)}
              </select>
            </section>
          </aside>
        )}
      </div>
    </div>
  );
};

export default XRayMirrorApp;
