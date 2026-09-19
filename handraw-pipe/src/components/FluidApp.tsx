// src/components/FluidApp.tsx

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Hands, Results, NormalizedLandmarkList } from '@mediapipe/hands';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import {
  Waves, ArrowLeft, FlipHorizontal, Eye, EyeOff, Sliders, Activity,
  Trash2, Bomb, Pause, Play, Hand, Pointer, Grab, Palette, AlertCircle
} from 'lucide-react';
import {
  FluidSimulation,
  DEFAULT_FLUID_CONFIG,
  FluidConfig,
  generateColor,
  RGB,
} from '../utils/fluidSimulation';
import { RESOLUTION_PRESETS } from './HandDrawingApp';

type ThemeColor = 'purple' | 'blue' | 'green' | 'pink';

interface FluidAppProps {
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

// Pontas dos dedos: polegar, indicador, médio, anelar, mínimo
const FINGERTIPS = [4, 8, 12, 16, 20];
// Base da palma usada para calcular o centro da mão
const PALM_LANDMARKS = [0, 5, 9, 13, 17];

// --- MODOS DE TOQUE (como a mão interage com o fluido) ---
type TouchMode = 'fingers' | 'index' | 'pinch' | 'palm';

interface TouchModeDef {
  id: TouchMode;
  label: string;
  hint: string;
  icon: React.ReactNode;
}

const TOUCH_MODES: TouchModeDef[] = [
  { id: 'fingers', label: 'Cinco Dedos', hint: 'Cada ponta de dedo empurra e pinta o fluido', icon: <Hand className="w-3.5 h-3.5" /> },
  { id: 'index', label: 'Indicador', hint: 'Apenas o dedo indicador interage', icon: <Pointer className="w-3.5 h-3.5" /> },
  { id: 'pinch', label: 'Pinça', hint: 'Junte polegar e indicador para agarrar o fluido', icon: <Grab className="w-3.5 h-3.5" /> },
  { id: 'palm', label: 'Palma', hint: 'A palma inteira varre o fluido como uma onda', icon: <Waves className="w-3.5 h-3.5" /> },
];

// --- MODOS DE COR ---
type ColorMode = 'rainbow' | 'theme' | 'hand';

const COLOR_MODES: { id: ColorMode; label: string; hint: string }[] = [
  { id: 'rainbow', label: 'Arco-íris', hint: 'Cores mudam continuamente' },
  { id: 'theme', label: 'Tema', hint: 'Cor do tema atual do MannaVision' },
  { id: 'hand', label: 'Por Mão', hint: 'Mão esquerda ciano, mão direita magenta' },
];

// Matiz (0..1) de cada tema, extraído da cor --main
const THEME_HUE: Record<ThemeColor, number> = {
  purple: 0.72,
  blue: 0.6,
  green: 0.39,
  pink: 0.92,
};

// --- QUALIDADE DA SIMULAÇÃO ---
interface QualityPreset {
  id: string;
  label: string;
  sim: number;
  dye: number;
}

const QUALITY_PRESETS: QualityPreset[] = [
  { id: 'low', label: 'Baixa (512p)', sim: 64, dye: 512 },
  { id: 'medium', label: 'Média (768p)', sim: 128, dye: 768 },
  { id: 'high', label: 'Alta (1024p)', sim: 128, dye: 1024 },
  { id: 'ultra', label: 'Ultra (1024p+)', sim: 256, dye: 1024 },
];

// --- CONFIG DE RASTREAMENTO DOS DEDOS ---
interface TrackingConfig {
  smoothingAlpha: number; // suavização exponencial das pontas (0.1..1.0)
  deadzone: number; // movimento mínimo em coordenadas normalizadas
  pinchThreshold: number; // pinça normalizada abaixo disso = "agarrando"
}

const DEFAULT_TRACKING_CONFIG: TrackingConfig = {
  smoothingAlpha: 0.55,
  deadzone: 0.0015,
  pinchThreshold: 0.4,
};

interface SmoothedPoint {
  x: number;
  y: number;
}

function wrapHue(h: number): number {
  return ((h % 1) + 1) % 1;
}

function dist2D(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

const FluidApp: React.FC<FluidAppProps> = ({ onBackToHub, themeColor }) => {
  // --- REFS ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const pipCanvasRef = useRef<HTMLCanvasElement>(null);
  const fluidCanvasRef = useRef<HTMLCanvasElement>(null);
  const handsRef = useRef<Hands | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const simRef = useRef<FluidSimulation | null>(null);
  const smoothedRef = useRef<Map<string, SmoothedPoint>>(new Map());
  // Geração da câmera: cada startCamera incrementa; chamadas obsoletas (ex.: efeito duplo do
  // StrictMode) abortam ao acordar de um await, evitando dois loops chamando hands.send()
  const cameraGenRef = useRef(0);

  // --- ESTADOS DE CÂMERA & RESOLUÇÃO ---
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>(() => {
    return localStorage.getItem('mannavision_camera_id') || '';
  });
  const [selectedResId, setSelectedResId] = useState<string>(() => {
    return localStorage.getItem('mannavision_resolution') || '800x600';
  });
  const [cameraStatus, setCameraStatus] = useState<'starting' | 'active' | 'error'>('starting');
  const [cameraErrorMsg, setCameraErrorMsg] = useState<string | null>(null);
  const [isMirror, setIsMirror] = useState<boolean>(true);
  const [cameraAspect, setCameraAspect] = useState<string>('16 / 9');
  const isMirrorRef = useRef(isMirror);

  // --- ESTADOS DO FLUIDO ---
  const [touchMode, setTouchMode] = useState<TouchMode>('fingers');
  const [colorMode, setColorMode] = useState<ColorMode>('rainbow');
  const [qualityId, setQualityId] = useState<string>('high');
  const [fluidConfig, setFluidConfig] = useState<FluidConfig>(DEFAULT_FLUID_CONFIG);
  const [trackingConfig, setTrackingConfig] = useState<TrackingConfig>(DEFAULT_TRACKING_CONFIG);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [fluidError, setFluidError] = useState<string | null>(null);

  // --- ESTADOS DE UI E HUD ---
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showPipWebcam, setShowPipWebcam] = useState<boolean>(true);
  const [handsDetected, setHandsDetected] = useState<number>(0);
  const [activePointers, setActivePointers] = useState<number>(0);
  const [mediaPipeStatus, setMediaPipeStatus] = useState<string>('Iniciando IA...');
  const [mediaPipeError, setMediaPipeError] = useState<string | null>(null);
  const [framesProcessedCount, setFramesProcessedCount] = useState<number>(0);

  // Refs espelhando estados usados dentro do callback do MediaPipe
  const touchModeRef = useRef(touchMode);
  const colorModeRef = useRef(colorMode);
  const themeColorRef = useRef(themeColor);
  const trackingConfigRef = useRef(trackingConfig);

  useEffect(() => { isMirrorRef.current = isMirror; }, [isMirror]);
  useEffect(() => { touchModeRef.current = touchMode; }, [touchMode]);
  useEffect(() => { colorModeRef.current = colorMode; }, [colorMode]);
  useEffect(() => { themeColorRef.current = themeColor; }, [themeColor]);
  useEffect(() => { trackingConfigRef.current = trackingConfig; }, [trackingConfig]);

  // --- INICIALIZAR SIMULAÇÃO DE FLUIDO (WEBGL) ---
  useEffect(() => {
    const canvas = fluidCanvasRef.current;
    if (!canvas) return;
    const smoothed = smoothedRef.current;

    let sim: FluidSimulation | null = null;
    try {
      sim = new FluidSimulation(canvas, {
        config: DEFAULT_FLUID_CONFIG,
        ditheringTextureUrl: '/fluid/LDR_LLL1_0.png',
      });
      simRef.current = sim;
      sim.start();
      sim.burst(); // Boas-vindas: alguns respingos coloridos
      setFluidError(null);
    } catch (err: any) {
      console.error('Erro ao iniciar a simulação de fluido:', err);
      setFluidError(err?.message || 'Não foi possível iniciar o WebGL.');
    }

    return () => {
      if (sim) {
        sim.destroy();
      }
      simRef.current = null;
      smoothed.clear();
    };
  }, []);

  // Sincronizar configuração do fluido com a simulação
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    const preset = QUALITY_PRESETS.find((q) => q.id === qualityId) || QUALITY_PRESETS[2];
    sim.applyConfig({
      ...fluidConfig,
      SIM_RESOLUTION: preset.sim,
      DYE_RESOLUTION: preset.dye,
      COLORFUL: colorMode === 'rainbow',
      PAUSED: isPaused,
    });
  }, [fluidConfig, qualityId, colorMode, isPaused]);

  // Atalhos de teclado: P = pausar, Espaço = explosão, C = limpar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.code === 'KeyP') setIsPaused((p) => !p);
      if (e.key === ' ') {
        e.preventDefault();
        simRef.current?.burst();
      }
      if (e.code === 'KeyC') simRef.current?.clear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  // --- COR DO POINTER CONFORME O MODO DE COR ---
  const colorForPointer = useCallback((tipIndex: number, handLabel: string): RGB | undefined => {
    const mode = colorModeRef.current;
    if (mode === 'rainbow') return undefined; // a simulação cicla as cores sozinha
    if (mode === 'theme') {
      // Pequena variação de matiz por dedo para dar textura à cor do tema
      const offset = (tipIndex / 20 - 0.5) * 0.16;
      return generateColor(wrapHue(THEME_HUE[themeColorRef.current] + offset));
    }
    return generateColor(handLabel === 'Left' ? 0.55 : 0.88);
  }, []);

  // --- PROCESSAR RESULTADOS DO MEDIAPIPE HANDS ---
  const onResults = useCallback((results: Results) => {
    setFramesProcessedCount((c) => c + 1);
    setMediaPipeStatus('Ativo');
    setMediaPipeError(null);

    const sim = simRef.current;
    const mirror = isMirrorRef.current;
    const mode = touchModeRef.current;
    const tracking = trackingConfigRef.current;
    const handsList: NormalizedLandmarkList[] = results.multiHandLandmarks || [];
    setHandsDetected(handsList.length);

    // 1. Converter landmarks em pointers do fluido
    const activeIds = new Set<string>();
    const highlightTips: { hand: number; idx: number }[] = [];

    if (sim) {
      handsList.forEach((lm, handIdx) => {
        const handLabel = results.multiHandedness?.[handIdx]?.label ?? 'Right';
        const points: { id: string; x: number; y: number; tip: number; radiusScale: number; forceScale: number }[] = [];

        if (mode === 'fingers') {
          FINGERTIPS.forEach((t) => {
            points.push({ id: `${handIdx}-${t}`, x: lm[t].x, y: lm[t].y, tip: t, radiusScale: 1, forceScale: 1 });
            highlightTips.push({ hand: handIdx, idx: t });
          });
        } else if (mode === 'index') {
          points.push({ id: `${handIdx}-8`, x: lm[8].x, y: lm[8].y, tip: 8, radiusScale: 1.3, forceScale: 1 });
          highlightTips.push({ hand: handIdx, idx: 8 });
        } else if (mode === 'pinch') {
          const handScale = Math.max(0.01, dist2D(lm[0], lm[9]));
          const pinch = dist2D(lm[4], lm[8]) / handScale;
          if (pinch < tracking.pinchThreshold) {
            points.push({
              id: `${handIdx}-pinch`,
              x: (lm[4].x + lm[8].x) / 2,
              y: (lm[4].y + lm[8].y) / 2,
              tip: 8,
              radiusScale: 1.8,
              forceScale: 1.2,
            });
            highlightTips.push({ hand: handIdx, idx: 4 }, { hand: handIdx, idx: 8 });
          }
        } else if (mode === 'palm') {
          let cx = 0;
          let cy = 0;
          PALM_LANDMARKS.forEach((i) => {
            cx += lm[i].x;
            cy += lm[i].y;
          });
          cx /= PALM_LANDMARKS.length;
          cy /= PALM_LANDMARKS.length;
          points.push({ id: `${handIdx}-palm`, x: cx, y: cy, tip: 9, radiusScale: 3.2, forceScale: 1.3 });
          highlightTips.push({ hand: handIdx, idx: 9 });
        }

        points.forEach((p) => {
          // MediaPipe: X cresce para a direita, Y para baixo. Fluido: Y para cima.
          const tx = mirror ? 1 - p.x : p.x;
          const ty = 1 - p.y;

          // Suavização exponencial + deadzone para eliminar tremor do rastreamento
          const prev = smoothedRef.current.get(p.id);
          let sx = tx;
          let sy = ty;
          if (prev) {
            sx = prev.x + tracking.smoothingAlpha * (tx - prev.x);
            sy = prev.y + tracking.smoothingAlpha * (ty - prev.y);
            if (Math.hypot(sx - prev.x, sy - prev.y) < tracking.deadzone) {
              sx = prev.x;
              sy = prev.y;
            }
          }
          smoothedRef.current.set(p.id, { x: sx, y: sy });

          sim.setPointer(p.id, sx, sy, {
            color: colorForPointer(p.tip, handLabel),
            radiusScale: p.radiusScale,
            forceScale: p.forceScale,
          });
          activeIds.add(p.id);
        });
      });

      // Soltar pointers de dedos que sumiram neste frame
      sim.getPointerIds().forEach((id) => {
        if (!activeIds.has(id)) {
          sim.releasePointer(id);
          smoothedRef.current.delete(id);
        }
      });
    }
    setActivePointers(activeIds.size);

    // 2. Desenhar esqueleto no PiP sobre a webcam
    const pipCanvas = pipCanvasRef.current;
    if (pipCanvas) {
      const pipCtx = pipCanvas.getContext('2d');
      if (pipCtx) {
        const vidW = videoRef.current?.videoWidth || 640;
        const vidH = videoRef.current?.videoHeight || 480;
        if (pipCanvas.width !== vidW || pipCanvas.height !== vidH) {
          pipCanvas.width = vidW;
          pipCanvas.height = vidH;
        }

        pipCtx.save();
        pipCtx.clearRect(0, 0, pipCanvas.width, pipCanvas.height);

        handsList.forEach((lm, handIdx) => {
          try {
            drawConnectors(pipCtx, lm, HAND_CONNECTIONS_ARRAY, {
              color: handIdx === 0 ? '#22d3ee' : '#e879f9',
              lineWidth: 2,
            });
            drawLandmarks(pipCtx, lm, {
              color: handIdx === 0 ? '#67e8f9' : '#f0abfc',
              lineWidth: 1,
              radius: 2.5,
            });
          } catch (drawErr) {
            console.warn('Aviso no desenho dos landmarks:', drawErr);
          }
        });

        // Destacar os pontos que estão tocando o fluido
        highlightTips.forEach(({ hand, idx }) => {
          const lm = handsList[hand]?.[idx];
          if (!lm) return;
          const x = lm.x * pipCanvas.width;
          const y = lm.y * pipCanvas.height;
          pipCtx.beginPath();
          pipCtx.arc(x, y, 7, 0, Math.PI * 2);
          pipCtx.fillStyle = 'rgba(251, 113, 133, 0.85)';
          pipCtx.fill();
          pipCtx.lineWidth = 2;
          pipCtx.strokeStyle = '#fff';
          pipCtx.stroke();
        });

        pipCtx.restore();
      }
    }
  }, [colorForPointer]);

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
          ? {
              deviceId: { exact: deviceIdToUse },
              width: { ideal: preset.width },
              height: { ideal: preset.height },
            }
          : {
              width: { ideal: preset.width },
              height: { ideal: preset.height },
              facingMode: 'user',
            },
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

        // Loop de envio de frames para o MediaPipe
        let isProcessing = false;
        let lastProcessTime = 0;

        const processVideo = async () => {
          if (isStale()) return; // loop órfão de uma geração anterior: encerra
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

  // Inicialização e limpeza ao desmontar
  useEffect(() => {
    const savedDeviceId = localStorage.getItem('mannavision_camera_id') || undefined;
    const savedResId = localStorage.getItem('mannavision_resolution') || undefined;
    const genRef = cameraGenRef;
    startCamera(savedDeviceId, savedResId);

    return () => {
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
    localStorage.setItem('mannavision_camera_id', newDeviceId);
    startCamera(newDeviceId, selectedResId);
  };

  const handleResolutionChange = (resId: string) => {
    setSelectedResId(resId);
    localStorage.setItem('mannavision_resolution', resId);
    startCamera(selectedCameraId, resId);
  };

  const updateFluid = (partial: Partial<FluidConfig>) => {
    setFluidConfig((c) => ({ ...c, ...partial }));
  };

  const currentTouchMode = TOUCH_MODES.find((m) => m.id === touchMode) || TOUCH_MODES[0];

  return (
    <div className="manna-vision-container h-screen w-screen max-h-screen overflow-hidden flex flex-col bg-black text-white select-none">
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
            <Waves className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-semibold text-emerald-200">Manipular o Fluido</span>
            <span className="text-[10px] text-gray-400">• Simulação Navier-Stokes na GPU</span>
          </div>
        </div>

        {/* Controles de Câmera, Resolução e Ajustes */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          <button
            onClick={() => setShowPipWebcam(!showPipWebcam)}
            className={`p-1.5 rounded-lg text-xs flex items-center space-x-1 transition-colors border ${
              showPipWebcam
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
            }`}
            title="Alternar visualização da câmera de rastreamento"
          >
            {showPipWebcam ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span className="hidden lg:inline text-[11px]">PiP Câmera</span>
          </button>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-1.5 rounded-lg text-xs flex items-center space-x-1 transition-colors border ${
              showSettings
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
            }`}
            title="Ajustes da simulação e do rastreamento"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden lg:inline text-[11px]">Ajustes</span>
          </button>

          <select
            value={selectedCameraId}
            onChange={(e) => handleCameraChange(e.target.value)}
            disabled={cameraStatus === 'starting'}
            className="bg-black/60 border border-[var(--border)]/40 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-400 transition-all cursor-pointer max-w-[120px] sm:max-w-[160px] truncate"
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
            className="bg-black/60 border border-[var(--border)]/40 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-400 transition-all cursor-pointer"
            title="Resolução da Câmera"
          >
            {RESOLUTION_PRESETS.map((p) => (
              <option key={p.id} value={p.id} className="bg-gray-900 text-white">
                {p.label}
              </option>
            ))}
          </select>

          <button
            onClick={() => setIsMirror(!isMirror)}
            className={`p-1.5 rounded-lg transition-colors ${
              isMirror ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-gray-400'
            }`}
            title={isMirror ? 'Espelhamento ativado' : 'Espelhamento desativado'}
          >
            <FlipHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* 2. PALCO: CANVAS WEBGL DO FLUIDO EM TELA CHEIA */}
      <div className="relative flex-1 min-h-0 w-full overflow-hidden bg-black">
        <canvas ref={fluidCanvasRef} className="block w-full h-full" />

        {/* Erro de WebGL */}
        {fluidError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/85 p-6">
            <div className="bg-red-950/80 border border-red-500/50 p-5 rounded-2xl max-w-md text-center">
              <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-red-300 mb-1">Simulação indisponível</h3>
              <p className="text-xs text-red-200">{fluidError}</p>
            </div>
          </div>
        )}

        {/* Erro de câmera */}
        {cameraStatus === 'error' && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-xl bg-red-950/85 border border-red-500/50 text-xs text-red-200 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span>{cameraErrorMsg || 'Não foi possível acessar a câmera.'}</span>
          </div>
        )}

        {/* Dica quando nenhuma mão é detectada */}
        {!fluidError && handsDetected === 0 && !mediaPipeError && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 px-4 py-2 rounded-full bg-black/60 backdrop-blur-md border border-emerald-500/40 text-xs text-emerald-200 pointer-events-none animate-pulse flex items-center space-x-2">
            <Hand className="w-4 h-4" />
            <span>Mostre a mão para a câmera e mova os dedos sobre o fluido</span>
          </div>
        )}

        {/* Indicador de pausa */}
        {isPaused && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-[11px] text-amber-200 font-semibold pointer-events-none flex items-center space-x-1.5">
            <Pause className="w-3 h-3" />
            <span>Simulação pausada</span>
          </div>
        )}

        {/* PIP WEBCAM FLUTUANTE COM RASTREAMENTO */}
        <div
          className={`absolute top-4 right-4 z-20 w-52 sm:w-64 rounded-xl overflow-hidden border border-emerald-500/30 bg-black/80 shadow-2xl backdrop-blur-md transition-all ${
            showPipWebcam ? 'block' : 'hidden'
          }`}
        >
          <div
            className="relative bg-gray-950 flex items-center justify-center overflow-hidden"
            style={{ aspectRatio: cameraAspect }}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: isMirror ? 'scaleX(-1)' : 'none' }}
            />

            <canvas
              ref={pipCanvasRef}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              style={{ transform: isMirror ? 'scaleX(-1)' : 'none' }}
            />

            <div className="absolute top-2 left-2 flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-black/80 backdrop-blur-sm border border-white/10 text-[10px] pointer-events-none z-10 max-w-[85%]">
              {handsDetected > 0 ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                  <span className="text-green-300 font-semibold">
                    {handsDetected} {handsDetected === 1 ? 'mão' : 'mãos'} • {activePointers} toques
                  </span>
                </>
              ) : mediaPipeError ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-red-400"></span>
                  <span className="text-red-300 font-semibold truncate">Erro IA: {mediaPipeError}</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  <span className="text-amber-300 font-semibold">
                    Aguardando Mão ({framesProcessedCount > 0 ? 'IA Ativa' : mediaPipeStatus})
                  </span>
                </>
              )}
            </div>

            <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 font-mono text-[10px] text-emerald-300 border border-emerald-500/20 pointer-events-none z-10">
              {currentTouchMode.label}
            </div>
          </div>
        </div>

        {/* PAINEL DE AJUSTES */}
        {showSettings && (
          <div className="absolute top-4 left-4 z-20 w-80 max-h-[calc(100%-2rem)] overflow-y-auto custom-scrollbar bg-black/85 backdrop-blur-xl border border-amber-500/40 rounded-2xl p-4 shadow-2xl text-xs space-y-3 font-sans">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center space-x-2 text-amber-300 font-bold">
                <Activity className="w-4 h-4" />
                <span>Ajustes do Fluido</span>
              </div>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white">
                ✕
              </button>
            </div>

            {/* Qualidade */}
            <div className="space-y-1">
              <div className="text-gray-300 font-semibold">Qualidade da simulação</div>
              <select
                value={qualityId}
                onChange={(e) => setQualityId(e.target.value)}
                className="w-full bg-black/60 border border-white/15 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
              >
                {QUALITY_PRESETS.map((q) => (
                  <option key={q.id} value={q.id} className="bg-gray-900">
                    {q.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Sliders de simulação */}
            <SliderRow
              label="Força do toque"
              value={fluidConfig.SPLAT_FORCE}
              min={1000}
              max={15000}
              step={250}
              display={fluidConfig.SPLAT_FORCE.toFixed(0)}
              onChange={(v) => updateFluid({ SPLAT_FORCE: v })}
            />
            <SliderRow
              label="Raio do toque"
              value={fluidConfig.SPLAT_RADIUS}
              min={0.05}
              max={1.0}
              step={0.01}
              display={fluidConfig.SPLAT_RADIUS.toFixed(2)}
              onChange={(v) => updateFluid({ SPLAT_RADIUS: v })}
            />
            <SliderRow
              label="Vorticidade (redemoinhos)"
              value={fluidConfig.CURL}
              min={0}
              max={60}
              step={1}
              display={fluidConfig.CURL.toFixed(0)}
              onChange={(v) => updateFluid({ CURL: v })}
            />
            <SliderRow
              label="Dissipação da tinta"
              value={fluidConfig.DENSITY_DISSIPATION}
              min={0}
              max={4}
              step={0.05}
              display={fluidConfig.DENSITY_DISSIPATION.toFixed(2)}
              onChange={(v) => updateFluid({ DENSITY_DISSIPATION: v })}
            />
            <SliderRow
              label="Dissipação da velocidade"
              value={fluidConfig.VELOCITY_DISSIPATION}
              min={0}
              max={4}
              step={0.05}
              display={fluidConfig.VELOCITY_DISSIPATION.toFixed(2)}
              onChange={(v) => updateFluid({ VELOCITY_DISSIPATION: v })}
            />

            {/* Toggles visuais */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              <ToggleChip label="Bloom" active={fluidConfig.BLOOM} onClick={() => updateFluid({ BLOOM: !fluidConfig.BLOOM })} />
              <ToggleChip label="Raios" active={fluidConfig.SUNRAYS} onClick={() => updateFluid({ SUNRAYS: !fluidConfig.SUNRAYS })} />
              <ToggleChip label="Relevo" active={fluidConfig.SHADING} onClick={() => updateFluid({ SHADING: !fluidConfig.SHADING })} />
            </div>

            {/* Rastreamento */}
            <div className="pt-2 border-t border-white/10 space-y-2">
              <div className="text-gray-300 font-semibold flex items-center space-x-1.5">
                <Hand className="w-3.5 h-3.5 text-emerald-400" />
                <span>Rastreamento dos dedos</span>
              </div>
              <SliderRow
                label="Suavização"
                value={trackingConfig.smoothingAlpha}
                min={0.1}
                max={1.0}
                step={0.05}
                display={trackingConfig.smoothingAlpha.toFixed(2)}
                onChange={(v) => setTrackingConfig({ ...trackingConfig, smoothingAlpha: v })}
              />
              <SliderRow
                label="Deadzone (anti-tremor)"
                value={trackingConfig.deadzone}
                min={0}
                max={0.01}
                step={0.0005}
                display={trackingConfig.deadzone.toFixed(4)}
                onChange={(v) => setTrackingConfig({ ...trackingConfig, deadzone: v })}
              />
              <SliderRow
                label="Limiar da pinça"
                value={trackingConfig.pinchThreshold}
                min={0.15}
                max={0.8}
                step={0.01}
                display={trackingConfig.pinchThreshold.toFixed(2)}
                onChange={(v) => setTrackingConfig({ ...trackingConfig, pinchThreshold: v })}
              />
            </div>

            <button
              onClick={() => {
                setFluidConfig(DEFAULT_FLUID_CONFIG);
                setTrackingConfig(DEFAULT_TRACKING_CONFIG);
                setQualityId('high');
              }}
              className="w-full mt-1 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-[11px] text-gray-300 transition-colors"
            >
              Restaurar Padrões de Fábrica
            </button>

            <div className="text-[10px] text-gray-500 pt-1 border-t border-white/10">
              Atalhos: <kbd className="px-1 bg-white/10 rounded">P</kbd> pausar •{' '}
              <kbd className="px-1 bg-white/10 rounded">Espaço</kbd> explosão •{' '}
              <kbd className="px-1 bg-white/10 rounded">C</kbd> limpar
            </div>
          </div>
        )}
      </div>

      {/* 3. RODAPÉ: MODOS DE TOQUE, COR E AÇÕES */}
      <footer className="min-h-[88px] bg-black/70 backdrop-blur-xl border-t border-[var(--border)]/30 px-4 sm:px-6 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-3 z-20 flex-shrink-0">
        {/* Modos de toque */}
        <div className="flex flex-col items-start space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Como tocar</span>
          <div className="flex items-center space-x-2 overflow-x-auto custom-scrollbar">
            {TOUCH_MODES.map((m) => {
              const isSelected = touchMode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setTouchMode(m.id)}
                  title={m.hint}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border whitespace-nowrap ${
                    isSelected
                      ? 'bg-gradient-to-r from-emerald-500/30 to-teal-600/30 border-emerald-400 text-white shadow-lg shadow-emerald-500/20 scale-105'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {m.icon}
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Modos de cor */}
        <div className="flex flex-col items-start space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold flex items-center space-x-1">
            <Palette className="w-3 h-3" />
            <span>Cor da tinta</span>
          </span>
          <div className="flex items-center space-x-2">
            {COLOR_MODES.map((c) => {
              const isSelected = colorMode === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setColorMode(c.id)}
                  title={c.hint}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border whitespace-nowrap ${
                    isSelected
                      ? 'bg-gradient-to-r from-[var(--main)]/40 to-[var(--light)]/30 border-[var(--light)] text-white shadow-lg scale-105'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Ações */}
        <div className="flex flex-col items-start space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Ações</span>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => simRef.current?.clear()}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-red-500/20 hover:border-red-500/40 transition-all"
              title="Limpar toda a tinta (C)"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Limpar</span>
            </button>
            <button
              onClick={() => simRef.current?.burst()}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-fuchsia-500/20 hover:border-fuchsia-500/40 transition-all"
              title="Explosão de respingos aleatórios (Espaço)"
            >
              <Bomb className="w-3.5 h-3.5" />
              <span>Explosão</span>
            </button>
            <button
              onClick={() => setIsPaused((p) => !p)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                isPaused
                  ? 'bg-amber-500/25 border-amber-400 text-amber-100'
                  : 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-white/10'
              }`}
              title="Pausar / continuar a simulação (P)"
            >
              {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              <span>{isPaused ? 'Continuar' : 'Pausar'}</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

// --- Subcomponentes de UI do painel de ajustes ---

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}

const SliderRow: React.FC<SliderRowProps> = ({ label, value, min, max, step, display, onChange }) => (
  <div className="space-y-1">
    <div className="text-gray-300 font-semibold flex items-center justify-between">
      <span>{label}</span>
      <span className="text-amber-300 font-mono">{display}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-400"
    />
  </div>
);

interface ToggleChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

const ToggleChip: React.FC<ToggleChipProps> = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
      active
        ? 'bg-amber-500/25 border-amber-400 text-amber-100'
        : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
    }`}
  >
    {label}
  </button>
);

export default FluidApp;
