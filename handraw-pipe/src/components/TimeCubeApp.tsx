// src/components/TimeCubeApp.tsx
//
// Modo "Cubo do Tempo": um vídeo vira um volume 3D (X, Y, T) que você gira com as duas
// mãos e percorre no tempo com a pinça. Baseado no Video Summagator (CHI 2012).

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { pickStartupCamera, rememberManualCamera } from '../utils/camera';
import { Hands, Results, NormalizedLandmarkList } from '@mediapipe/hands';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import {
  Box, ArrowLeft, FlipHorizontal, Eye, EyeOff, Sliders, Film, Upload, Play, Pause,
  RotateCcw, Circle, Square, Hand, AlertCircle, Loader2, Grab, Move3d, Timer, X, HelpCircle,
} from 'lucide-react';
import {
  TimeCubeRenderer,
  TimeCubeParams,
  DEFAULT_TIME_CUBE_PARAMS,
  Mat3,
  mat3Identity,
  rotateInView,
  extractVideoToVolume,
  VolumeInfo,
} from '../utils/timeCubeRenderer';
import { GestureInterpreter } from '../utils/gestureInterpreter';
import { RESOLUTION_PRESETS } from './HandDrawingApp';

type ThemeColor = 'purple' | 'blue' | 'green' | 'pink';

interface TimeCubeAppProps {
  onBackToHub: () => void;
  themeColor: ThemeColor;
  setThemeColor: React.Dispatch<React.SetStateAction<ThemeColor>>;
}

// Conexões canônicas dos 21 landmarks da mão no MediaPipe
const HAND_CONNECTIONS_ARRAY: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

const PALM_LANDMARKS = [0, 5, 9, 13, 17];

const THEME_TINT: Record<ThemeColor, [number, number, number]> = {
  purple: [0.545, 0.361, 0.965], // #8B5CF6
  blue: [0.231, 0.510, 0.965],   // #3B82F6
  green: [0.133, 0.773, 0.369],  // #22C55E
  pink: [0.925, 0.282, 0.600],   // #EC4899
};

// --- BIBLIOTECA DE VÍDEOS (public/timecube) ---
interface VideoEntry {
  id: string;
  label: string;
  hint: string;
  src: string;
  poster?: string;
}

const PRESET_VIDEOS: VideoEntry[] = [
  { id: 'onibus-cidade', label: 'Ônibus na Cidade', hint: 'Timelapse urbano · 6 s', src: '/timecube/onibus-cidade.mp4', poster: '/timecube/onibus-cidade.jpg' },
  { id: 'ciclistas-por-do-sol', label: 'Ciclistas ao Pôr do Sol', hint: 'Pelotão em contraluz · 6 s', src: '/timecube/ciclistas-por-do-sol.mp4', poster: '/timecube/ciclistas-por-do-sol.jpg' },
  { id: 'cruzamento-noturno', label: 'Cruzamento Noturno', hint: 'Rastros de luz · 7 s', src: '/timecube/cruzamento-noturno.mp4', poster: '/timecube/cruzamento-noturno.jpg' },
  { id: 'canion-fpv', label: 'Cânion em FPV', hint: 'Drone mergulhando · 67 s', src: '/timecube/canion-fpv.mp4', poster: '/timecube/canion-fpv.jpg' },
  { id: 'ondas-fpv', label: 'Ondas ao Pôr do Sol', hint: 'Drone rasante · 82 s', src: '/timecube/ondas-fpv.mp4', poster: '/timecube/ondas-fpv.jpg' },
];

// --- QUALIDADE (resolução das fatias × passos do raymarching × escala do canvas) ---
interface QualityPreset { id: string; label: string; maxSide: number; steps: number; scale: number }
const QUALITY_PRESETS: QualityPreset[] = [
  { id: 'low', label: 'Leve', maxSide: 224, steps: 80, scale: 0.55 },
  { id: 'medium', label: 'Equilibrada', maxSide: 320, steps: 128, scale: 0.75 },
  { id: 'high', label: 'Alta', maxSide: 448, steps: 192, scale: 1.0 },
];

const SLICE_OPTIONS = [96, 160, 256];
const RATE_OPTIONS = [0.25, 0.5, 1, 2];

// --- GESTOS ---
type GestureMode = 'none' | 'wait' | 'scrub' | 'orbit' | 'drag' | 'hold';

const GESTURE_LABEL: Record<GestureMode, string> = {
  none: 'Sem mãos · rotação automática',
  wait: 'Detectando mão…',
  scrub: 'Uma mão · pinça controla o tempo',
  orbit: 'Duas mãos abertas · girando o cubo',
  drag: 'Pinça + mão aberta · arrastando o tempo',
  hold: 'Duas pinças · cubo travado',
};

// Limiares de pinça normalizada (dist. polegar-indicador / tamanho da palma) com histerese
const PINCH_ENTER = 0.30;
const PINCH_EXIT = 0.44;
// Sensibilidades
const YAW_GAIN = 3.4;    // rad por largura de tela
const PITCH_GAIN = 3.4;
const DRAG_GAIN = 1.25;  // linha do tempo por largura de tela
const IDLE_SPIN = 0.18;  // rad/s na rotação automática
const ONE_HAND_GRACE_MS = 220;

interface HandSummary {
  landmarks: NormalizedLandmarkList;
  cx: number;
  cy: number;
  pinchNorm: number;
}

interface TrackState {
  mid: { x: number; y: number };
  angle: number;
  dist: number;
}

function summarizeHand(lm: NormalizedLandmarkList): HandSummary {
  let cx = 0;
  let cy = 0;
  for (const i of PALM_LANDMARKS) {
    cx += lm[i].x;
    cy += lm[i].y;
  }
  cx /= PALM_LANDMARKS.length;
  cy /= PALM_LANDMARKS.length;
  const pinch = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
  const scale = Math.max(0.01, Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y));
  return { landmarks: lm, cx, cy, pinchNorm: pinch / scale };
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function formatTime(sec: number): string {
  if (!isFinite(sec)) return '0:00.0';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

const TimeCubeApp: React.FC<TimeCubeAppProps> = ({ onBackToHub, themeColor }) => {
  // --- REFS DE DOM E MOTORES ---
  const videoRef = useRef<HTMLVideoElement>(null);          // webcam
  const pipCanvasRef = useRef<HTMLCanvasElement>(null);
  const cubeCanvasRef = useRef<HTMLCanvasElement>(null);
  const srcVideoRef = useRef<HTMLVideoElement>(null);       // vídeo-fonte (oculto) para extração
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handsRef = useRef<Hands | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const rendererRef = useRef<TimeCubeRenderer | null>(null);
  const cameraGenRef = useRef(0);
  const loadGenRef = useRef(0);
  const interpreterRef = useRef(new GestureInterpreter());

  // Estado contínuo do cubo (lido no loop de render, escrito pelos gestos)
  const rotationRef = useRef<Mat3>(rotateInView(mat3Identity(), -0.55, 0.32, 0));
  const camDistRef = useRef<number>(DEFAULT_TIME_CUBE_PARAMS.camDist);
  const cursorTargetRef = useRef<number>(0);
  const cursorShownRef = useRef<number>(0);
  const loadedFractionRef = useRef<number>(0);
  const gestureModeRef = useRef<GestureMode>('none');
  const trackRef = useRef<TrackState | null>(null);
  const dragXRef = useRef<number | null>(null);
  const pinchedRef = useRef<[boolean, boolean]>([false, false]);
  const oneHandSinceRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(performance.now());
  const isPlayingRef = useRef<boolean>(false);
  const rateRef = useRef<number>(1);
  const durationRef = useRef<number>(0);
  const autoRotateRef = useRef<boolean>(true);
  const isMirrorRef = useRef<boolean>(true);
  const themeColorRef = useRef<ThemeColor>(themeColor);
  const paramsRef = useRef<Omit<TimeCubeParams, 'rotation' | 'timeCursor' | 'loaded' | 'camDist'>>({
    ...DEFAULT_TIME_CUBE_PARAMS,
  });
  const qualityRef = useRef<QualityPreset>(QUALITY_PRESETS[1]);
  const mouseDragRef = useRef<{ x: number; y: number } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);

  // --- ESTADOS DE CÂMERA ---
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>(() => localStorage.getItem('mannavision_camera_id') || '');
  const [selectedResId, setSelectedResId] = useState<string>(() => localStorage.getItem('mannavision_resolution') || '800x600');
  const [cameraStatus, setCameraStatus] = useState<'starting' | 'active' | 'error'>('starting');
  const [cameraErrorMsg, setCameraErrorMsg] = useState<string | null>(null);
  const [isMirror, setIsMirror] = useState<boolean>(true);
  const [cameraAspect, setCameraAspect] = useState<string>('16 / 9');

  // --- ESTADOS DO VÍDEO-FONTE ---
  const [selectedVideo, setSelectedVideo] = useState<VideoEntry>(PRESET_VIDEOS[0]);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [loadProgress, setLoadProgress] = useState<{ loaded: number; total: number }>({ loaded: 0, total: 0 });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [volumeInfo, setVolumeInfo] = useState<VolumeInfo | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [sliceCount, setSliceCount] = useState<number>(160);
  const [qualityId, setQualityId] = useState<string>('medium');

  // --- ESTADOS DE REPRODUÇÃO E VISUAL ---
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [rate, setRate] = useState<number>(1);
  const [cursorShown, setCursorShown] = useState<number>(0);
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [visual, setVisual] = useState({
    density: DEFAULT_TIME_CUBE_PARAMS.density,
    motionGain: DEFAULT_TIME_CUBE_PARAMS.motionGain,
    staticAlpha: DEFAULT_TIME_CUBE_PARAMS.staticAlpha,
    trail: DEFAULT_TIME_CUBE_PARAMS.trail,
    pastFade: DEFAULT_TIME_CUBE_PARAMS.pastFade,
    futureFade: DEFAULT_TIME_CUBE_PARAMS.futureFade,
    cursorOpacity: DEFAULT_TIME_CUBE_PARAMS.cursorOpacity,
    depthScale: DEFAULT_TIME_CUBE_PARAMS.depthScale,
    showEdges: DEFAULT_TIME_CUBE_PARAMS.showEdges,
  });
  const [rendererError, setRendererError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);

  // --- ESTADOS DE UI E HUD ---
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showLibrary, setShowLibrary] = useState<boolean>(false);
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [showPipWebcam, setShowPipWebcam] = useState<boolean>(true);
  const [handsDetected, setHandsDetected] = useState<number>(0);
  const [gestureMode, setGestureMode] = useState<GestureMode>('none');
  const [mediaPipeStatus, setMediaPipeStatus] = useState<string>('Iniciando IA...');
  const [mediaPipeError, setMediaPipeError] = useState<string | null>(null);
  const [framesProcessedCount, setFramesProcessedCount] = useState<number>(0);

  // Espelhar estados em refs usados nos loops
  useEffect(() => { isMirrorRef.current = isMirror; }, [isMirror]);
  useEffect(() => { themeColorRef.current = themeColor; }, [themeColor]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { rateRef.current = rate; }, [rate]);
  useEffect(() => { autoRotateRef.current = autoRotate; }, [autoRotate]);
  useEffect(() => { durationRef.current = videoDuration; }, [videoDuration]);
  useEffect(() => {
    qualityRef.current = QUALITY_PRESETS.find((q) => q.id === qualityId) || QUALITY_PRESETS[1];
  }, [qualityId]);
  useEffect(() => {
    paramsRef.current = {
      ...paramsRef.current,
      ...visual,
      tint: THEME_TINT[themeColor],
      steps: qualityRef.current.steps,
    };
  }, [visual, themeColor, qualityId]);

  // --- RENDERIZADOR WEBGL2 + LOOP DE RENDER ---
  useEffect(() => {
    const canvas = cubeCanvasRef.current;
    if (!canvas) return;
    let renderer: TimeCubeRenderer | null = null;
    try {
      renderer = new TimeCubeRenderer(canvas);
      rendererRef.current = renderer;
      setRendererError(null);
    } catch (err: any) {
      console.error('Erro ao iniciar o Cubo do Tempo:', err);
      setRendererError(err?.message || 'Não foi possível iniciar o WebGL2.');
      return;
    }

    let rafId = 0;
    let hudAccum = 0;
    lastFrameTimeRef.current = performance.now();

    const loop = () => {
      rafId = requestAnimationFrame(loop);
      const r = rendererRef.current;
      if (!r) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastFrameTimeRef.current) / 1000);
      lastFrameTimeRef.current = now;

      // Rotação automática quando ninguém está segurando o cubo
      if (autoRotateRef.current && gestureModeRef.current === 'none' && !mouseDragRef.current) {
        rotationRef.current = rotateInView(rotationRef.current, IDLE_SPIN * dt, 0, 0);
      }

      // Reprodução automática do playhead
      if (isPlayingRef.current && durationRef.current > 0 && loadedFractionRef.current >= 1) {
        let c = cursorTargetRef.current + (rateRef.current * dt) / durationRef.current;
        if (c > 1) c -= 1;
        cursorTargetRef.current = c;
      }

      // Suavização do cursor exibido
      const target = Math.max(0, Math.min(1, cursorTargetRef.current));
      const diff = target - cursorShownRef.current;
      cursorShownRef.current += Math.abs(diff) > 0.5 ? diff : diff * 0.28;

      // Tamanho interno conforme qualidade
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 1.5) * qualityRef.current.scale;
      r.resize(rect.width * scale, rect.height * scale);

      r.render({
        ...paramsRef.current,
        rotation: rotationRef.current,
        camDist: camDistRef.current,
        timeCursor: cursorShownRef.current,
        loaded: loadedFractionRef.current,
      });

      // HUD a ~12 Hz
      hudAccum += dt;
      if (hudAccum > 0.08) {
        hudAccum = 0;
        setCursorShown(cursorShownRef.current);
      }
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      renderer?.destroy();
      rendererRef.current = null;
    };
  }, []);

  // --- CARREGAR VÍDEO E EXTRAIR PARA O VOLUME ---
  const loadVideo = useCallback(async (entry: VideoEntry, slices: number, quality: QualityPreset) => {
    const srcVideo = srcVideoRef.current;
    const renderer = rendererRef.current;
    if (!srcVideo || !renderer) return;
    const gen = ++loadGenRef.current;
    const isStale = () => gen !== loadGenRef.current;

    setLoadState('loading');
    setLoadError(null);
    setLoadProgress({ loaded: 0, total: slices });
    setIsPlaying(false);
    loadedFractionRef.current = 0;
    cursorTargetRef.current = 0;
    cursorShownRef.current = 0;

    try {
      // Aguardar metadados
      await new Promise<void>((resolve, reject) => {
        const onMeta = () => { cleanup(); resolve(); };
        const onErr = () => { cleanup(); reject(new Error('Não foi possível abrir o vídeo (formato não suportado?).')); };
        const cleanup = () => {
          srcVideo.removeEventListener('loadeddata', onMeta);
          srcVideo.removeEventListener('error', onErr);
        };
        srcVideo.addEventListener('loadeddata', onMeta);
        srcVideo.addEventListener('error', onErr);
        srcVideo.src = entry.src;
        srcVideo.load();
      });
      if (isStale()) return;

      setVideoDuration(srcVideo.duration);
      const info = await extractVideoToVolume(renderer, srcVideo, {
        sliceCount: slices,
        maxSide: quality.maxSide,
        shouldAbort: isStale,
        onProgress: (loaded, total) => {
          loadedFractionRef.current = loaded / total;
          setLoadProgress({ loaded, total });
        },
      });
      if (isStale()) return;
      setVolumeInfo(info);
      loadedFractionRef.current = 1;
      setLoadState('ready');
      setIsPlaying(true);
    } catch (err: any) {
      if (isStale()) return;
      console.error('Erro ao carregar vídeo no cubo:', err);
      setLoadError(err?.message || 'Falha ao carregar o vídeo.');
      setLoadState('error');
    }
  }, []);

  // Carrega o vídeo selecionado (e recarrega ao mudar fatias/qualidade da textura)
  const qualityMaxSide = (QUALITY_PRESETS.find((q) => q.id === qualityId) || QUALITY_PRESETS[1]).maxSide;
  useEffect(() => {
    if (rendererError) return;
    const quality = QUALITY_PRESETS.find((q) => q.maxSide === qualityMaxSide) || QUALITY_PRESETS[1];
    loadVideo(selectedVideo, sliceCount, quality);
  }, [selectedVideo, sliceCount, qualityMaxSide, loadVideo, rendererError]);

  // Liberar URLs de vídeos enviados pelo usuário
  useEffect(() => {
    return () => {
      if (selectedVideo.src.startsWith('blob:')) URL.revokeObjectURL(selectedVideo.src);
    };
  }, [selectedVideo]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSelectedVideo({
      id: `upload-${Date.now()}`,
      label: file.name.replace(/\.[^.]+$/, ''),
      hint: `${(file.size / 1024 / 1024).toFixed(1)} MB · arquivo local`,
      src: url,
    });
    setShowLibrary(false);
    e.target.value = '';
  };

  // --- ENUMERAR CÂMERAS ---
  const enumerateCameras = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');
      setCameras(videoDevices);
      return videoDevices;
    } catch (err) {
      console.error('Erro ao enumerar câmeras:', err);
      return [];
    }
  }, []);

  // --- GESTOS: MÁQUINA DE ESTADOS ---
  const applyGestures = useCallback((hands: HandSummary[]) => {
    const mirror = isMirrorRef.current;
    const now = performance.now();
    let mode: GestureMode = 'none';

    if (hands.length === 0) {
      mode = 'none';
      trackRef.current = null;
      dragXRef.current = null;
      oneHandSinceRef.current = 0;
      pinchedRef.current = [false, false];
      interpreterRef.current.reset(cursorTargetRef.current);
    } else if (hands.length === 1) {
      trackRef.current = null;
      dragXRef.current = null;
      pinchedRef.current = [false, false];
      if (!oneHandSinceRef.current) oneHandSinceRef.current = now;
      // Pequena carência evita que uma mão perdida por um instante durante a rotação vire scrub
      if (now - oneHandSinceRef.current >= ONE_HAND_GRACE_MS) {
        mode = 'scrub';
        const data = interpreterRef.current.process(hands[0].landmarks);
        if (data.handDetected) {
          cursorTargetRef.current = data.pinchProgress;
          if (isPlayingRef.current) { isPlayingRef.current = false; setIsPlaying(false); }
        }
      } else {
        // Durante a carência mantém o rótulo anterior (ex.: 'orbit' que perdeu uma mão por um instante)
        mode = gestureModeRef.current === 'none' ? 'wait' : gestureModeRef.current;
        interpreterRef.current.reset(cursorTargetRef.current);
      }
    } else {
      oneHandSinceRef.current = 0;
      // Ordena por posição horizontal para manter a histerese estável entre frames
      const sorted = [...hands].sort((a, b) => a.cx - b.cx).slice(0, 2);
      const pinched = pinchedRef.current;
      for (let i = 0; i < 2; i++) {
        const pn = sorted[i].pinchNorm;
        if (!pinched[i] && pn < PINCH_ENTER) pinched[i] = true;
        else if (pinched[i] && pn > PINCH_EXIT) pinched[i] = false;
      }
      const nPinched = (pinched[0] ? 1 : 0) + (pinched[1] ? 1 : 0);

      if (nPinched === 0) {
        mode = 'orbit';
        dragXRef.current = null;
        const mid = { x: (sorted[0].cx + sorted[1].cx) / 2, y: (sorted[0].cy + sorted[1].cy) / 2 };
        const angle = Math.atan2(sorted[1].cy - sorted[0].cy, sorted[1].cx - sorted[0].cx);
        const dist = Math.max(0.02, Math.hypot(sorted[1].cx - sorted[0].cx, sorted[1].cy - sorted[0].cy));
        const prev = trackRef.current;
        if (prev) {
          // Suaviza a entrada para reduzir tremor
          const sm = 0.6;
          const mx = prev.mid.x + (mid.x - prev.mid.x) * sm;
          const my = prev.mid.y + (mid.y - prev.mid.y) * sm;
          const sa = prev.angle + wrapAngle(angle - prev.angle) * sm;
          const sd = prev.dist + (dist - prev.dist) * sm;

          const dx = mx - prev.mid.x;
          const dy = my - prev.mid.y;
          const dAng = wrapAngle(sa - prev.angle);
          const ratio = sd / prev.dist;

          const sx = mirror ? -dx : dx;          // movimento visto na tela
          const yaw = sx * YAW_GAIN;
          const pitch = dy * PITCH_GAIN;          // y do landmark cresce para baixo
          const roll = mirror ? dAng : -dAng;     // ver derivação em rotateInView
          rotationRef.current = rotateInView(rotationRef.current, yaw, pitch, roll);
          camDistRef.current = Math.max(1.5, Math.min(6.5, camDistRef.current / Math.pow(ratio, 1.15)));
          trackRef.current = { mid: { x: mx, y: my }, angle: sa, dist: sd };
        } else {
          trackRef.current = { mid, angle, dist };
        }
      } else if (nPinched === 1) {
        mode = 'drag';
        trackRef.current = null;
        const hand = pinched[0] ? sorted[0] : sorted[1];
        const x = (hand.landmarks[4].x + hand.landmarks[8].x) / 2;
        if (dragXRef.current !== null) {
          const dx = x - dragXRef.current;
          const sx = mirror ? -dx : dx;
          cursorTargetRef.current = Math.max(0, Math.min(1, cursorTargetRef.current + sx * DRAG_GAIN));
          if (isPlayingRef.current) { isPlayingRef.current = false; setIsPlaying(false); }
        }
        dragXRef.current = x;
      } else {
        mode = 'hold';
        trackRef.current = null;
        dragXRef.current = null;
      }
    }

    if (mode !== gestureModeRef.current) {
      gestureModeRef.current = mode;
      setGestureMode(mode);
    }
  }, []);

  // --- PROCESSAR RESULTADOS DO MEDIAPIPE HANDS ---
  const onResults = useCallback((results: Results) => {
    setFramesProcessedCount((c) => c + 1);
    setMediaPipeStatus('Ativo');
    setMediaPipeError(null);

    const all = results.multiHandLandmarks || [];
    const hands = all.filter((lm) => lm && lm.length >= 21).map(summarizeHand);
    setHandsDetected(hands.length);
    applyGestures(hands);

    // Esqueleto sobre a webcam
    const pipCanvas = pipCanvasRef.current;
    const pipCtx = pipCanvas?.getContext('2d');
    if (pipCanvas && pipCtx) {
      const vidW = videoRef.current?.videoWidth || 640;
      const vidH = videoRef.current?.videoHeight || 480;
      if (pipCanvas.width !== vidW || pipCanvas.height !== vidH) {
        pipCanvas.width = vidW;
        pipCanvas.height = vidH;
      }
      pipCtx.clearRect(0, 0, pipCanvas.width, pipCanvas.height);
      const tint = THEME_TINT[themeColorRef.current];
      const tintCss = `rgb(${Math.round(tint[0] * 255)}, ${Math.round(tint[1] * 255)}, ${Math.round(tint[2] * 255)})`;
      for (const h of hands) {
        try {
          drawConnectors(pipCtx, h.landmarks, HAND_CONNECTIONS_ARRAY, { color: tintCss, lineWidth: 2 });
          drawLandmarks(pipCtx, h.landmarks, { color: '#ffffff', lineWidth: 1, radius: 2.5 });
        } catch (drawErr) {
          console.warn('Aviso no desenho dos landmarks:', drawErr);
        }
        // Realce da pinça
        const t = h.landmarks[4];
        const i = h.landmarks[8];
        const closed = h.pinchNorm < PINCH_EXIT;
        pipCtx.beginPath();
        pipCtx.moveTo(t.x * vidW, t.y * vidH);
        pipCtx.lineTo(i.x * vidW, i.y * vidH);
        pipCtx.strokeStyle = closed ? '#fbbf24' : 'rgba(255,255,255,0.5)';
        pipCtx.lineWidth = closed ? 4 : 2;
        pipCtx.stroke();
      }
      // Linha entre as duas palmas no modo de rotação
      if (hands.length >= 2 && gestureModeRef.current === 'orbit') {
        pipCtx.beginPath();
        pipCtx.moveTo(hands[0].cx * vidW, hands[0].cy * vidH);
        pipCtx.lineTo(hands[1].cx * vidW, hands[1].cy * vidH);
        pipCtx.setLineDash([6, 6]);
        pipCtx.strokeStyle = tintCss;
        pipCtx.lineWidth = 2;
        pipCtx.stroke();
        pipCtx.setLineDash([]);
      }
    }
  }, [applyGestures]);

  // --- INICIALIZAÇÃO DO MODELO MEDIAPIPE HANDS ---
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).Module = undefined;
    }
    const hands = new Hands({
      locateFile: (file) => `/mediapipe/hands/${file}`,
    });
    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.45,
    });
    hands.onResults(onResults);
    handsRef.current = hands;

    return () => {
      try {
        hands.close();
      } catch (e) {
        console.warn('Erro ao fechar hands:', e);
      }
      handsRef.current = null;
      if (typeof window !== 'undefined') {
        (window as any).Module = undefined;
      }
    };
  }, [onResults]);

  // --- INICIAR OU TROCAR CÂMERA ---
  const startCamera = useCallback(async (deviceIdToUse?: string, resIdToUse?: string) => {
    const resId = resIdToUse || selectedResId;
    const preset = RESOLUTION_PRESETS.find((p) => p.id === resId) || RESOLUTION_PRESETS[1];
    const gen = ++cameraGenRef.current;
    const isStale = () => gen !== cameraGenRef.current;

    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const s = videoRef.current.srcObject as MediaStream;
      s.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }

    setCameraStatus('starting');
    setCameraErrorMsg(null);

    try {
      const constraints: MediaStreamConstraints = {
        video: deviceIdToUse
          ? { deviceId: { exact: deviceIdToUse }, width: { ideal: preset.width }, height: { ideal: preset.height } }
          : { width: { ideal: preset.width }, height: { ideal: preset.height }, facingMode: 'user' },
        audio: false,
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        if (deviceIdToUse) {
          console.warn('Tentando câmera padrão após erro com ID exato:', err);
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: preset.width }, height: { ideal: preset.height } },
            audio: false,
          });
        } else {
          throw err;
        }
      }

      if (isStale()) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      const devs = await enumerateCameras();
      if (isStale()) return;
      const activeTrack = stream.getVideoTracks()[0];
      const settings = activeTrack?.getSettings();
      const currentDevId = settings?.deviceId || deviceIdToUse || (devs[0]?.deviceId ?? '');
      const actualW = settings?.width || preset.width;
      const actualH = settings?.height || preset.height;
      setCameraAspect(`${actualW} / ${actualH}`);

      if (currentDevId) {
        setSelectedCameraId(currentDevId);
        localStorage.setItem('mannavision_camera_id', currentDevId);
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn('Play video:', playErr);
        }
        if (isStale()) return;

        let isProcessing = false;
        let lastProcessTime = 0;

        const processVideo = async () => {
          if (isStale()) return;
          const video = videoRef.current;
          if (!video || video.paused || video.ended) {
            animFrameIdRef.current = requestAnimationFrame(processVideo);
            return;
          }
          const now = performance.now();
          if (
            video.readyState >= 2 &&
            video.videoWidth > 0 &&
            video.videoHeight > 0 &&
            !isProcessing &&
            now - lastProcessTime >= 25
          ) {
            lastProcessTime = now;
            isProcessing = true;
            try {
              if (handsRef.current) {
                await handsRef.current.send({ image: video });
              }
            } catch (error: any) {
              const errMsg = error?.message || String(error);
              console.error('Erro no processamento do MediaPipe:', errMsg);
              setMediaPipeError(errMsg);
            } finally {
              isProcessing = false;
            }
          }
          animFrameIdRef.current = requestAnimationFrame(processVideo);
        };

        animFrameIdRef.current = requestAnimationFrame(processVideo);
        setCameraStatus('active');
      }
    } catch (err: any) {
      console.error('Erro ao acessar webcam:', err);
      setCameraStatus('error');
      setCameraErrorMsg(err?.message || 'Não foi possível acessar a câmera.');
    }
  }, [selectedResId, enumerateCameras]);

  useEffect(() => {
    const savedResId = localStorage.getItem('mannavision_resolution') || undefined;
    const genRef = cameraGenRef;
    let cancelled = false;
    // Padrão: câmera externa; outra só se escolhida manualmente no seletor
    pickStartupCamera().then((deviceId) => {
      if (!cancelled) startCamera(deviceId, savedResId);
    });
    return () => {
      cancelled = true;
      genRef.current++;
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [startCamera]);

  const handleCameraChange = (newDeviceId: string) => {
    setSelectedCameraId(newDeviceId);
    rememberManualCamera(newDeviceId);
    startCamera(newDeviceId, selectedResId);
  };

  const handleResolutionChange = (resId: string) => {
    setSelectedResId(resId);
    localStorage.setItem('mannavision_resolution', resId);
    startCamera(selectedCameraId, resId);
  };

  // --- CONTROLE POR MOUSE (fallback sem webcam): arrastar gira, roda aproxima ---
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    mouseDragRef.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = mouseDragRef.current;
    if (!drag) return;
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const dx = (e.clientX - drag.x) / rect.width;
    const dy = (e.clientY - drag.y) / rect.height;
    mouseDragRef.current = { x: e.clientX, y: e.clientY };
    rotationRef.current = rotateInView(rotationRef.current, dx * YAW_GAIN, dy * PITCH_GAIN, 0);
  };
  const onPointerUp = () => { mouseDragRef.current = null; };
  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    camDistRef.current = Math.max(1.5, Math.min(6.5, camDistRef.current * (e.deltaY > 0 ? 1.08 : 0.926)));
  };

  // --- TRANSPORTE ---
  const togglePlay = () => setIsPlaying((p) => !p);
  const restart = () => { cursorTargetRef.current = 0; };
  const resetView = useCallback(() => {
    rotationRef.current = rotateInView(mat3Identity(), -0.55, 0.32, 0);
    camDistRef.current = DEFAULT_TIME_CUBE_PARAMS.camDist;
  }, []);
  const setCursorFromSlider = (v: number) => {
    cursorTargetRef.current = v;
    if (isPlaying) setIsPlaying(false);
  };

  // --- GRAVAÇÃO DO CANVAS (.webm) ---
  const toggleRecording = () => {
    const canvas = cubeCanvasRef.current;
    if (!canvas) return;
    if (isRecording) {
      recorderRef.current?.stop();
      return;
    }
    if (typeof MediaRecorder === 'undefined' || !('captureStream' in canvas)) {
      alert('Gravação não suportada neste navegador.');
      return;
    }
    try {
      const stream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);
      const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 12_000_000 } : undefined);
      recordChunksRef.current = [];
      rec.ondataavailable = (ev) => { if (ev.data.size > 0) recordChunksRef.current.push(ev.data); };
      rec.onstop = () => {
        const blob = new Blob(recordChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cubo-do-tempo-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        stream.getTracks().forEach((t) => t.stop());
        recorderRef.current = null;
        setIsRecording(false);
      };
      rec.start(250);
      recorderRef.current = rec;
      setIsRecording(true);
    } catch (err) {
      console.error('Erro ao iniciar gravação:', err);
      alert('Não foi possível iniciar a gravação.');
    }
  };

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try { recorderRef.current.stop(); } catch { /* ignorar */ }
      }
    };
  }, []);

  // --- ATALHOS DE TECLADO ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === ' ') { e.preventDefault(); setIsPlaying((p) => !p); }
      if (e.code === 'Home') cursorTargetRef.current = 0;
      if (e.code === 'End') cursorTargetRef.current = 1;
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        const depth = rendererRef.current?.getVolumeInfo()?.depth || 100;
        const step = (e.shiftKey ? 10 : 1) / depth;
        cursorTargetRef.current = Math.max(0, Math.min(1, cursorTargetRef.current + (e.code === 'ArrowRight' ? step : -step)));
        setIsPlaying(false);
      }
      if (e.code === 'KeyR') resetView();
      if (e.code === 'KeyA') setAutoRotate((a) => !a);
      if (e.code === 'KeyE') setVisual((v) => ({ ...v, showEdges: !v.showEdges }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [resetView]);

  const updateVisual = (partial: Partial<typeof visual>) => setVisual((v) => ({ ...v, ...partial }));

  const depth = volumeInfo?.depth || 0;
  const frameIndex = depth ? Math.min(depth - 1, Math.round(cursorShown * (depth - 1))) : 0;
  const currentSeconds = cursorShown * videoDuration;
  const gestureIcon = gestureMode === 'orbit' ? <Move3d className="w-4 h-4" /> : gestureMode === 'scrub' || gestureMode === 'drag' ? <Grab className="w-4 h-4" /> : <Hand className="w-4 h-4" />;

  return (
    <div className="manna-vision-container h-screen w-screen max-h-screen overflow-hidden flex flex-col bg-black text-white select-none">
      {/* Vídeo-fonte oculto para extração dos frames */}
      <video ref={srcVideoRef} muted playsInline preload="auto" crossOrigin="anonymous" className="hidden" />
      <input ref={fileInputRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/*" className="hidden" onChange={handleFileUpload} />

      {/* 1. HEADER SUPERIOR COMPACTO */}
      <header className="h-12 min-h-[48px] max-h-12 bg-black/50 backdrop-blur-md border-b border-[var(--border)]/20 px-4 flex items-center justify-between z-30 flex-shrink-0">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBackToHub}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-all hover:scale-105 border border-white/10"
            title="Voltar para a tela inicial"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Hub Principal</span>
          </button>

          <img src="/logo_manna_vision.png" alt="MannaVision Logo" className="h-6 object-contain hidden sm:inline" />

          <div className="hidden md:flex items-center space-x-2 border-l border-white/20 pl-3">
            <Box className="w-3.5 h-3.5 text-[var(--light)]" />
            <span className="text-xs font-semibold text-[var(--text)]">Cubo do Tempo</span>
            <span className="text-[10px] text-gray-400">• Vídeo como volume X·Y·T</span>
          </div>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-3">
          <button
            onClick={() => { setShowLibrary(!showLibrary); setShowSettings(false); }}
            className={`p-1.5 rounded-lg text-xs flex items-center space-x-1 transition-colors border ${
              showLibrary ? 'bg-[var(--main)]/25 border-[var(--border)]/60 text-[var(--text)]' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
            }`}
            title="Escolher vídeo"
          >
            <Film className="w-3.5 h-3.5" />
            <span className="hidden lg:inline text-[11px] max-w-[140px] truncate">{selectedVideo.label}</span>
          </button>

          <button
            onClick={() => setShowPipWebcam(!showPipWebcam)}
            className={`p-1.5 rounded-lg text-xs flex items-center space-x-1 transition-colors border ${
              showPipWebcam ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
            }`}
            title="Alternar visualização da câmera de rastreamento"
          >
            {showPipWebcam ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span className="hidden lg:inline text-[11px]">PiP Câmera</span>
          </button>

          <button
            onClick={() => { setShowSettings(!showSettings); setShowLibrary(false); }}
            className={`p-1.5 rounded-lg text-xs flex items-center space-x-1 transition-colors border ${
              showSettings ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
            }`}
            title="Ajustes do volume e da qualidade"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden lg:inline text-[11px]">Ajustes</span>
          </button>

          <button
            onClick={() => setShowHelp(!showHelp)}
            className={`p-1.5 rounded-lg text-xs transition-colors border ${
              showHelp ? 'bg-sky-500/20 border-sky-500/40 text-sky-300' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
            }`}
            title="Como usar os gestos"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>

          <select
            value={selectedCameraId}
            onChange={(e) => handleCameraChange(e.target.value)}
            disabled={cameraStatus === 'starting'}
            className="bg-black/60 border border-[var(--border)]/40 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[var(--light)] transition-all cursor-pointer max-w-[120px] sm:max-w-[160px] truncate"
            title="Dispositivo de Vídeo"
          >
            {cameras.length === 0 ? (
              <option value="">{cameraStatus === 'starting' ? 'Detectando...' : 'Câmera Padrão'}</option>
            ) : (
              cameras.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId} className="bg-gray-900 text-white">
                  {d.label || `Câmera ${i + 1}`}
                </option>
              ))
            )}
          </select>

          <select
            value={selectedResId}
            onChange={(e) => handleResolutionChange(e.target.value)}
            className="bg-black/60 border border-[var(--border)]/40 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[var(--light)] transition-all cursor-pointer hidden sm:block"
            title="Resolução da Câmera"
          >
            {RESOLUTION_PRESETS.map((p) => (
              <option key={p.id} value={p.id} className="bg-gray-900 text-white">{p.label}</option>
            ))}
          </select>

          <button
            onClick={() => setIsMirror(!isMirror)}
            className={`p-1.5 rounded-lg transition-colors ${isMirror ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-gray-400'}`}
            title={isMirror ? 'Espelhamento ativado' : 'Espelhamento desativado'}
          >
            <FlipHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* 2. PALCO: CANVAS WEBGL2 DO CUBO */}
      <div className="relative flex-1 min-h-0 w-full overflow-hidden bg-black">
        <canvas
          ref={cubeCanvasRef}
          className="block w-full h-full cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
          onWheel={onWheel}
        />

        {/* Erro de WebGL2 */}
        {rendererError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/85 p-6">
            <div className="bg-red-950/80 border border-red-500/50 p-5 rounded-2xl max-w-md text-center">
              <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-red-300 mb-1">Cubo indisponível</h3>
              <p className="text-xs text-red-200">{rendererError}</p>
            </div>
          </div>
        )}

        {/* Progresso de extração */}
        {loadState === 'loading' && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-80 px-4 py-3 rounded-2xl bg-black/75 backdrop-blur-md border border-[var(--border)]/40 text-xs pointer-events-none">
            <div className="flex items-center space-x-2 mb-2 text-[var(--text)]">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="font-semibold truncate">Empilhando “{selectedVideo.label}” no cubo…</span>
            </div>
            <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--main)] transition-all"
                style={{ width: `${loadProgress.total ? (100 * loadProgress.loaded) / loadProgress.total : 0}%` }}
              />
            </div>
            <div className="mt-1 text-[10px] text-gray-400 text-right font-mono">
              {loadProgress.loaded}/{loadProgress.total} frames
            </div>
          </div>
        )}

        {loadState === 'error' && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-xl bg-red-950/85 border border-red-500/50 text-xs text-red-200 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span>{loadError}</span>
          </div>
        )}

        {cameraStatus === 'error' && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-xl bg-red-950/85 border border-red-500/50 text-xs text-red-200 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span>{cameraErrorMsg || 'Não foi possível acessar a câmera.'} Use o mouse: arraste para girar, roda para aproximar.</span>
          </div>
        )}

        {/* Indicador do gesto atual */}
        {!rendererError && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10 px-4 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-[var(--border)]/40 text-xs text-[var(--text)] pointer-events-none flex items-center space-x-2">
            {gestureIcon}
            <span>{GESTURE_LABEL[gestureMode]}</span>
          </div>
        )}

        {/* PIP WEBCAM FLUTUANTE COM RASTREAMENTO */}
        <div
          className={`absolute top-4 right-4 z-20 w-52 sm:w-64 rounded-xl overflow-hidden border border-[var(--border)]/40 bg-black/80 shadow-2xl backdrop-blur-md transition-all ${
            showPipWebcam ? 'block' : 'hidden'
          }`}
        >
          <div className="relative bg-gray-950 flex items-center justify-center overflow-hidden" style={{ aspectRatio: cameraAspect }}>
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: isMirror ? 'scaleX(-1)' : 'none' }} />
            <canvas ref={pipCanvasRef} className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={{ transform: isMirror ? 'scaleX(-1)' : 'none' }} />

            <div className="absolute top-2 left-2 flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-black/80 backdrop-blur-sm border border-white/10 text-[10px] pointer-events-none z-10 max-w-[85%]">
              {handsDetected > 0 ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                  <span className="text-green-300 font-semibold">{handsDetected} {handsDetected === 1 ? 'mão' : 'mãos'}</span>
                </>
              ) : mediaPipeError ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-red-400"></span>
                  <span className="text-red-300 font-semibold truncate">Erro IA: {mediaPipeError}</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  <span className="text-amber-300 font-semibold">Aguardando Mão ({framesProcessedCount > 0 ? 'IA Ativa' : mediaPipeStatus})</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* BIBLIOTECA DE VÍDEOS */}
        {showLibrary && (
          <div className="absolute top-4 left-4 z-20 w-[22rem] max-h-[calc(100%-2rem)] overflow-y-auto custom-scrollbar bg-black/85 backdrop-blur-xl border border-[var(--border)]/40 rounded-2xl p-4 shadow-2xl text-xs space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center space-x-2 text-[var(--text)] font-bold">
                <Film className="w-4 h-4" />
                <span>Cena</span>
              </div>
              <button onClick={() => setShowLibrary(false)} className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_VIDEOS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => { setSelectedVideo(v); setShowLibrary(false); }}
                  className={`group relative rounded-xl overflow-hidden border text-left transition-all ${
                    selectedVideo.id === v.id ? 'border-[var(--light)] ring-1 ring-[var(--light)]' : 'border-white/10 hover:border-white/40'
                  }`}
                >
                  <div className="aspect-video bg-gray-900">
                    {v.poster && <img src={v.poster} alt="" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />}
                  </div>
                  <div className="p-2 bg-black/60">
                    <div className="font-semibold text-white truncate">{v.label}</div>
                    <div className="text-[10px] text-gray-400 truncate">{v.hint}</div>
                  </div>
                </button>
              ))}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="rounded-xl border border-dashed border-white/25 hover:border-[var(--light)] flex flex-col items-center justify-center aspect-video text-gray-300 hover:text-white transition-all p-2"
              >
                <Upload className="w-5 h-5 mb-1" />
                <span className="font-semibold">Abrir vídeo…</span>
                <span className="text-[10px] text-gray-500">MP4 / WebM / MOV</span>
              </button>
            </div>
            {selectedVideo.id.startsWith('upload-') && (
              <div className="text-[10px] text-gray-400 border-t border-white/10 pt-2">
                Atual: <span className="text-white">{selectedVideo.label}</span> · {selectedVideo.hint}
              </div>
            )}
          </div>
        )}

        {/* PAINEL DE AJUSTES */}
        {showSettings && (
          <div className="absolute top-4 left-4 z-20 w-80 max-h-[calc(100%-2rem)] overflow-y-auto custom-scrollbar bg-black/85 backdrop-blur-xl border border-amber-500/40 rounded-2xl p-4 shadow-2xl text-xs space-y-3 font-sans">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center space-x-2 text-amber-300 font-bold">
                <Sliders className="w-4 h-4" />
                <span>Volume & Rastro</span>
              </div>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            <Slider label="Volume (densidade)" value={visual.density} min={0.1} max={4} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => updateVisual({ density: v })} />
            <Slider label="Realce de movimento" value={visual.motionGain} min={0} max={5} step={0.05} fmt={(v) => v.toFixed(2)} onChange={(v) => updateVisual({ motionGain: v })} />
            <Slider label="Opacidade do fundo estático" value={visual.staticAlpha} min={0} max={1} step={0.01} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => updateVisual({ staticAlpha: v })} />
            <Slider label="Rastro do passado" value={visual.trail} min={0.01} max={1} step={0.01} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => updateVisual({ trail: v })} />
            <Slider label="Passado além do rastro" value={visual.pastFade} min={0} max={1} step={0.01} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => updateVisual({ pastFade: v })} />
            <Slider label="Futuro (holograma)" value={visual.futureFade} min={0} max={1} step={0.01} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => updateVisual({ futureFade: v })} />
            <Slider label="Opacidade do plano do presente" value={visual.cursorOpacity} min={0} max={1} step={0.01} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => updateVisual({ cursorOpacity: v })} />
            <Slider label="Profundidade do tempo" value={visual.depthScale} min={0.3} max={2.5} step={0.05} fmt={(v) => `${v.toFixed(2)}×`} onChange={(v) => updateVisual({ depthScale: v })} />

            <div className="flex items-center justify-between pt-1">
              <label className="text-gray-300">Arestas do cubo</label>
              <button
                onClick={() => updateVisual({ showEdges: !visual.showEdges })}
                className={`px-2 py-0.5 rounded-md border ${visual.showEdges ? 'bg-amber-500/20 border-amber-500/40 text-amber-200' : 'bg-white/5 border-white/10 text-gray-400'}`}
              >
                {visual.showEdges ? 'Ligadas' : 'Desligadas'}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-gray-300">Rotação automática (sem mãos)</label>
              <button
                onClick={() => setAutoRotate(!autoRotate)}
                className={`px-2 py-0.5 rounded-md border ${autoRotate ? 'bg-amber-500/20 border-amber-500/40 text-amber-200' : 'bg-white/5 border-white/10 text-gray-400'}`}
              >
                {autoRotate ? 'Ligada' : 'Desligada'}
              </button>
            </div>

            <div className="border-t border-white/10 pt-3 space-y-2">
              <div className="text-amber-300 font-bold flex items-center space-x-2"><Timer className="w-3.5 h-3.5" /><span>Amostragem (recarrega o cubo)</span></div>
              <div className="flex items-center justify-between">
                <label className="text-gray-300">Frames no cubo</label>
                <div className="flex space-x-1">
                  {SLICE_OPTIONS.map((n) => (
                    <button
                      key={n}
                      onClick={() => setSliceCount(n)}
                      className={`px-2 py-0.5 rounded-md border font-mono ${sliceCount === n ? 'bg-[var(--main)]/30 border-[var(--border)] text-white' : 'bg-white/5 border-white/10 text-gray-400'}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-gray-300">Qualidade</label>
                <div className="flex space-x-1">
                  {QUALITY_PRESETS.map((q) => (
                    <button
                      key={q.id}
                      onClick={() => setQualityId(q.id)}
                      className={`px-2 py-0.5 rounded-md border ${qualityId === q.id ? 'bg-[var(--main)]/30 border-[var(--border)] text-white' : 'bg-white/5 border-white/10 text-gray-400'}`}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
              {volumeInfo && (
                <div className="text-[10px] text-gray-500 font-mono">
                  Textura 3D: {volumeInfo.width}×{volumeInfo.height}×{volumeInfo.depth} · {((volumeInfo.width * volumeInfo.height * volumeInfo.depth * 4) / 1048576).toFixed(1)} MB
                </div>
              )}
            </div>

            <button onClick={resetView} className="w-full mt-1 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-gray-200 flex items-center justify-center space-x-1.5">
              <RotateCcw className="w-3.5 h-3.5" /><span>Recentralizar cubo (R)</span>
            </button>
          </div>
        )}

        {/* AJUDA DE GESTOS */}
        {showHelp && (
          <div className="absolute top-4 left-4 z-20 w-80 bg-black/85 backdrop-blur-xl border border-sky-500/40 rounded-2xl p-4 shadow-2xl text-xs space-y-2">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center space-x-2 text-sky-300 font-bold"><HelpCircle className="w-4 h-4" /><span>Gestos</span></div>
              <button onClick={() => setShowHelp(false)} className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <HelpRow emoji="🤏" title="Uma mão · pinça" text="Feche polegar e indicador para voltar ao início; abra para avançar até o fim. O plano do presente atravessa o cubo." />
            <HelpRow emoji="🖐️🖐️" title="Duas mãos abertas" text="Segure o cubo: mova as mãos para girar, gire-as para rolar, aproxime ou afaste para zoom." />
            <HelpRow emoji="🤏🖐️" title="Pinça + mão aberta" text="A mão em pinça arrasta o tempo para a esquerda e direita; a outra segura o cubo parado." />
            <HelpRow emoji="🖱️" title="Mouse" text="Arraste para girar, roda para aproximar. Espaço reproduz, ←/→ avança frame, R recentraliza, A liga a rotação automática." />
          </div>
        )}

        {/* 3. BARRA DE TRANSPORTE */}
        {!rendererError && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[min(56rem,calc(100%-2rem))] px-4 py-2.5 rounded-2xl bg-black/70 backdrop-blur-xl border border-[var(--border)]/40 shadow-2xl flex items-center space-x-3 text-xs">
            <button
              onClick={togglePlay}
              disabled={loadState !== 'ready'}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white"
              title="Reproduzir / pausar (Espaço)"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button onClick={restart} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white" title="Reiniciar (Home)">
              <RotateCcw className="w-4 h-4" />
            </button>
            <select
              value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value))}
              className="bg-black/60 border border-white/15 rounded-lg px-1.5 py-1 text-[11px] text-white focus:outline-none cursor-pointer"
              title="Velocidade"
            >
              {RATE_OPTIONS.map((r) => <option key={r} value={r} className="bg-gray-900">{r}×</option>)}
            </select>

            <div className="flex-1 flex items-center space-x-2">
              <input
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={cursorShown}
                onChange={(e) => setCursorFromSlider(parseFloat(e.target.value))}
                className="flex-1 accent-[var(--main)] cursor-pointer"
                title="Playhead"
              />
            </div>

            <div className="font-mono text-[11px] text-[var(--text)] whitespace-nowrap min-w-[7.5rem] text-right">
              {formatTime(currentSeconds)} · F{depth ? String(frameIndex + 1).padStart(3, '0') : '---'}
            </div>

            <button
              onClick={toggleRecording}
              disabled={loadState !== 'ready'}
              className={`px-2.5 py-1.5 rounded-xl border flex items-center space-x-1.5 disabled:opacity-40 ${
                isRecording ? 'bg-red-600/80 border-red-400 text-white animate-pulse' : 'bg-white/10 border-white/15 text-gray-200 hover:bg-white/20'
              }`}
              title={isRecording ? 'Parar e salvar .webm' : 'Gravar o cubo (.webm)'}
            >
              {isRecording ? <Square className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5 text-red-400" />}
              <span className="hidden sm:inline text-[11px] font-semibold">{isRecording ? 'Parar' : 'Rec'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// --- Subcomponentes de UI ---

const Slider: React.FC<{
  label: string; value: number; min: number; max: number; step: number;
  fmt: (v: number) => string; onChange: (v: number) => void;
}> = ({ label, value, min, max, step, fmt, onChange }) => (
  <div>
    <div className="flex items-center justify-between mb-0.5">
      <label className="text-gray-300">{label}</label>
      <span className="font-mono text-[10px] text-amber-200">{fmt(value)}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full accent-amber-400 cursor-pointer"
    />
  </div>
);

const HelpRow: React.FC<{ emoji: string; title: string; text: string }> = ({ emoji, title, text }) => (
  <div className="flex items-start space-x-2 bg-white/5 rounded-lg p-2">
    <span className="text-base leading-none mt-0.5">{emoji}</span>
    <div>
      <div className="font-semibold text-white">{title}</div>
      <div className="text-[11px] text-gray-300 leading-snug">{text}</div>
    </div>
  </div>
);

export default TimeCubeApp;
