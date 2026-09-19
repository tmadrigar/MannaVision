// src/components/HandDrawingApp.tsx

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Hands, Results, NormalizedLandmarkList } from '@mediapipe/hands';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import {
  Palette, Eraser, Trash2, Download, Video, Square, Minus as MinusIcon, Plus,
  PenLine, Sparkles, SprayCan, Wand2, Camera as CameraIcon, X as XIcon, Save,
  RefreshCw, FlipHorizontal, ArrowLeft, Moon, Undo2, Redo2, Flower2, Hourglass,
  Feather, Ribbon, Sparkle, Zap
} from 'lucide-react';
import {
  BrushStyle, SymmetryMode, BrushSettings, StrokeState, Point,
  BRUSH_STYLES, SYMMETRY_MODES, ParticleSystem,
  createStrokeState, resetStroke, strokeTo, rgba,
} from '../utils/brushEngine';

// Tipos
type ThemeColor = 'purple' | 'blue' | 'green' | 'pink';
type BoardMode = 'webcam' | 'white' | 'dark';

// Conexões canônicas dos 21 landmarks da mão no MediaPipe
const HAND_CONNECTIONS_ARRAY: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

// Cores do esqueleto por mão (mesmo visual do Control Time / Fluido)
const HAND_COLORS = [
  { line: '#22d3ee', dot: '#67e8f9' },
  { line: '#e879f9', dot: '#f0abfc' },
];

// Ícones dos estilos de pincel
const BRUSH_ICONS: Record<BrushStyle, React.ReactNode> = {
  solid: <PenLine className="w-3.5 h-3.5" />,
  neon: <Zap className="w-3.5 h-3.5" />,
  ribbon: <Ribbon className="w-3.5 h-3.5" />,
  calligraphy: <Feather className="w-3.5 h-3.5" />,
  rainbow: <Wand2 className="w-3.5 h-3.5" />,
  sparkle: <Sparkle className="w-3.5 h-3.5" />,
  spray: <SprayCan className="w-3.5 h-3.5" />,
  dashed: <MinusIcon className="w-3.5 h-3.5" />,
};

// Estado de rastreamento por mão (esqueleto + cursor desenhados no canvas de FX)
interface HandCursor {
  x: number;
  y: number;
  thumbX: number;
  thumbY: number;
  pinch: number; // 0 (fechada) .. 1 (aberta)
  drawing: boolean;
  landmarks: NormalizedLandmarkList;
  handIndex: number;
}

// Máximo de estados guardados para desfazer
const MAX_UNDO = 25;

export interface ResolutionPreset {
  id: string;
  label: string;
  width: number;
  height: number;
  tag: string;
  desc: string;
}

export const RESOLUTION_PRESETS: ResolutionPreset[] = [
  { id: '640x480', label: '640p', width: 640, height: 480, tag: 'SD', desc: '640x480 (Leve / Mais Rápido)' },
  { id: '800x600', label: '800p', width: 800, height: 600, tag: 'Médio', desc: '800x600 (Equilibrado)' },
  { id: '1280x720', label: '1280p', width: 1280, height: 720, tag: 'HD', desc: '1280x720 (Alta Definição)' },
];

interface HandDrawingAppProps {
  onBackToHub?: () => void;
  themeColor: ThemeColor;
  setThemeColor: React.Dispatch<React.SetStateAction<ThemeColor>>;
}

const HandDrawingApp: React.FC<HandDrawingAppProps> = ({ onBackToHub, themeColor, setThemeColor }) => {
  // Refs para os elementos do DOM
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement>(null);

  // Refs para MediaPipe e Stream de Câmera
  const handsRef = useRef<Hands | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  // Geração da câmera: chamadas obsoletas de startCamera (efeito duplo do StrictMode)
  // abortam ao acordar de um await, evitando dois loops chamando hands.send()
  const cameraGenRef = useRef(0);

  // Estados de Câmera e Resolução
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>(() => {
    return localStorage.getItem('mannavision_camera_id') || '';
  });
  const [selectedResId, setSelectedResId] = useState<string>(() => {
    return localStorage.getItem('mannavision_resolution') || '800x600';
  });
  const [activeResolution, setActiveResolution] = useState<{ width: number; height: number }>({
    width: 800,
    height: 600,
  });
  const [cameraAspect, setCameraAspect] = useState<string>('4 / 3');
  const [cameraStatus, setCameraStatus] = useState<'starting' | 'active' | 'error'>('starting');
  const [cameraErrorMsg, setCameraErrorMsg] = useState<string | null>(null);
  const [isRefreshingCameras, setIsRefreshingCameras] = useState(false);
  const [isMirror, setIsMirror] = useState<boolean>(true);
  const [cameraResolution, setCameraResolution] = useState<string>('');
  const isMirrorRef = useRef(isMirror);

  // Estados para o desenho com as mãos
  const [isDrawing, setIsDrawing] = useState(false);
  const [boardMode, setBoardMode] = useState<BoardMode>('webcam');
  const [brushSize, setBrushSize] = useState(6);
  const [currentColor, setCurrentColor] = useState('#8B5CF6'); // Cor inicial padrão
  const [isEraser, setIsEraser] = useState(false);
  const [brushStyle, setBrushStyle] = useState<BrushStyle>('neon');
  const [symmetry, setSymmetry] = useState<SymmetryMode>('none');
  const [fadeInk, setFadeInk] = useState(false); // tinta evanescente (light painting)
  const [pinchThreshold, setPinchThreshold] = useState(0.35); // pinça normalizada p/ começar a desenhar
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Estado por mão: traço em andamento + cursor exibido no canvas de FX
  const strokesRef = useRef<StrokeState[]>([createStrokeState(), createStrokeState()]);
  const cursorsRef = useRef<HandCursor[]>([]);
  const particlesRef = useRef<ParticleSystem>(new ParticleSystem());
  const undoStackRef = useRef<ImageData[]>([]);
  const redoStackRef = useRef<ImageData[]>([]);

  // Refs para manter os valores atualizados dentro do useCallback do onResults
  const brushSizeRef = useRef(brushSize);
  const currentColorRef = useRef(currentColor);
  const isEraserRef = useRef(isEraser);
  const brushStyleRef = useRef(brushStyle);
  const symmetryRef = useRef(symmetry);
  const fadeInkRef = useRef(fadeInk);
  const pinchThresholdRef = useRef(pinchThreshold);

  useEffect(() => {
    brushSizeRef.current = brushSize;
    currentColorRef.current = currentColor;
    isEraserRef.current = isEraser;
    brushStyleRef.current = brushStyle;
    isMirrorRef.current = isMirror;
    symmetryRef.current = symmetry;
    fadeInkRef.current = fadeInk;
    pinchThresholdRef.current = pinchThreshold;
  }, [brushSize, currentColor, isEraser, brushStyle, isMirror, symmetry, fadeInk, pinchThreshold]);

  // --- DESFAZER / REFAZER (snapshots do canvas de desenho) ---
  const pushUndoSnapshot = useCallback(() => {
    const canvas = drawingCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || canvas.width === 0 || canvas.height === 0) return;
    try {
      undoStackRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
      redoStackRef.current = [];
      setCanUndo(true);
      setCanRedo(false);
    } catch (e) {
      console.warn('Não foi possível guardar estado para desfazer:', e);
    }
  }, []);

  const undo = useCallback(() => {
    const canvas = drawingCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const snap = undoStackRef.current.pop();
    if (!snap) return;
    try {
      redoStackRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      ctx.putImageData(snap, 0, 0);
    } catch (e) {
      console.warn('Erro ao desfazer:', e);
    }
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  const redo = useCallback(() => {
    const canvas = drawingCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const snap = redoStackRef.current.pop();
    if (!snap) return;
    try {
      undoStackRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      ctx.putImageData(snap, 0, 0);
    } catch (e) {
      console.warn('Erro ao refazer:', e);
    }
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  // --- ESTADOS PARA A FUNCIONALIDADE DE IA ---
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resultImageUrl, setResultImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cores da paleta (ORIGINAIS)
  const colors = [
    '#8B5CF6', '#EC4899', '#EF4444', '#F97316',
    '#EAB308', '#22C55E', '#06B6D4', '#3B82F6',
    '#6366F1', '#A855F7', '#FFFFFF', '#000000'
  ];

  const onResults = useCallback((results: Results) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

    const drawingCtx = drawingCanvasRef.current?.getContext('2d');
    if (!drawingCtx) {
      ctx.restore();
      return;
    }

    const now = performance.now();
    const w = canvas.width;
    const h = canvas.height;

    // Configuração atual do pincel (espessura escalada pela largura do canvas)
    const settings: BrushSettings = {
      style: brushStyleRef.current,
      color: currentColorRef.current,
      size: brushSizeRef.current * (w / 800),
      eraser: isEraserRef.current,
      symmetry: symmetryRef.current,
    };

    const hands = results.multiHandLandmarks || [];
    const cursors: HandCursor[] = [];
    let anyHandIsDrawing = false;
    let snapshotTaken = strokesRef.current.some((st) => st.active);

    hands.forEach((landmarks, index) => {
      if (index >= strokesRef.current.length) return;
      const state = strokesRef.current[index];

      // Pinça normalizada pelo tamanho da mão (pulso -> base do dedo médio):
      // funciona igual perto ou longe da câmera, em qualquer resolução
      const wrist = landmarks[0];
      const middleMCP = landmarks[9];
      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];
      const handScale = Math.max(0.01, Math.hypot(wrist.x - middleMCP.x, wrist.y - middleMCP.y));
      const pinch = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y) / handScale;

      // Histerese: precisa fechar abaixo de `closeAt` para começar e abrir acima de `openAt` para soltar
      const closeAt = pinchThresholdRef.current;
      const openAt = closeAt + 0.1;
      const drawing = state.active ? pinch < openAt : pinch < closeAt;

      const tip: Point = { x: indexTip.x * w, y: indexTip.y * h };
      const tX = thumbTip.x * w;
      const tY = thumbTip.y * h;

      // --- Traço ---
      if (drawing) {
        anyHandIsDrawing = true;
        if (!state.active && !snapshotTaken) {
          pushUndoSnapshot();
          snapshotTaken = true;
        }
        strokeTo(drawingCtx, particlesRef.current, state, tip, now, settings, w, h);
      } else if (state.active) {
        resetStroke(state);
      }

      cursors.push({
        x: tip.x,
        y: tip.y,
        thumbX: tX,
        thumbY: tY,
        pinch: Math.max(0, Math.min(1, (pinch - 0.15) / 0.8)),
        drawing,
        landmarks,
        handIndex: index,
      });
    });

    // Mãos que saíram do quadro encerram o traço
    for (let i = hands.length; i < strokesRef.current.length; i++) {
      resetStroke(strokesRef.current[i]);
    }

    cursorsRef.current = cursors;
    setIsDrawing(anyHandIsDrawing);
    ctx.restore();
  }, [pushUndoSnapshot]);

  // Inicializa o modelo MediaPipe Hands
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
      minTrackingConfidence: 0.45
    });
    hands.onResults(onResults);
    handsRef.current = hands;

    return () => {
      try {
        hands.close();
      } catch (e) {}
      handsRef.current = null;
      if (typeof window !== 'undefined') {
        (window as any).Module = undefined;
      }
    };
  }, [onResults]);

  // --- LOOP DE EFEITOS (60 fps): partículas, cursores dos dedos e tinta evanescente ---
  useEffect(() => {
    let rafId = 0;
    let last = performance.now();
    let fadeFrame = 0;

    const loop = () => {
      const now = performance.now();
      const dt = Math.min(50, now - last);
      last = now;

      const fx = fxCanvasRef.current;
      const drawing = drawingCanvasRef.current;
      const fxCtx = fx?.getContext('2d');
      if (fx && fxCtx && drawing && drawing.width > 0) {
        if (fx.width !== drawing.width || fx.height !== drawing.height) {
          fx.width = drawing.width;
          fx.height = drawing.height;
        }
        const w = fx.width;
        const h = fx.height;
        fxCtx.clearRect(0, 0, w, h);

        // Tinta evanescente: o desenho desaparece aos poucos (light painting)
        if (fadeInkRef.current) {
          const dctx = drawing.getContext('2d');
          if (dctx) {
            dctx.save();
            dctx.globalCompositeOperation = 'destination-out';
            dctx.fillStyle = 'rgba(0,0,0,0.06)';
            dctx.fillRect(0, 0, w, h);
            dctx.restore();
            // A quantização de 8 bits deixa resíduos quase invisíveis; zera-os periodicamente
            if (++fadeFrame % 45 === 0) {
              try {
                const img = dctx.getImageData(0, 0, w, h);
                const d = img.data;
                for (let i = 3; i < d.length; i += 4) {
                  if (d[i] < 14) d[i] = 0;
                }
                dctx.putImageData(img, 0, 0);
              } catch {
                /* canvas indisponível */
              }
            }
          }
        }

        // Partículas vivas (pincel Fagulhas)
        const ps = particlesRef.current;
        ps.update(dt);
        ps.render(fxCtx, symmetryRef.current, w, h);

        // Esqueleto da mão (mesmo visual do Control Time / Fluido), por cima de qualquer fundo
        const size = brushSizeRef.current * (w / 800);
        const color = isEraserRef.current ? '#ffffff' : currentColorRef.current;
        for (const c of cursorsRef.current) {
          const palette = HAND_COLORS[c.handIndex % HAND_COLORS.length];
          try {
            drawConnectors(fxCtx, c.landmarks, HAND_CONNECTIONS_ARRAY, { color: palette.line, lineWidth: 2 });
            drawLandmarks(fxCtx, c.landmarks, { color: palette.dot, lineWidth: 1, radius: 2.5 });
          } catch (drawErr) {
            console.warn('Aviso no desenho dos landmarks:', drawErr);
          }

          // Linha de pinça entre polegar e indicador
          const tipColor = c.drawing ? color : '#fb7185';
          fxCtx.save();
          fxCtx.beginPath();
          fxCtx.moveTo(c.thumbX, c.thumbY);
          fxCtx.lineTo(c.x, c.y);
          fxCtx.strokeStyle = c.drawing ? tipColor : '#f43f5e';
          fxCtx.lineWidth = c.drawing ? 3 : 2;
          fxCtx.setLineDash(c.drawing ? [] : [4, 4]);
          fxCtx.stroke();
          fxCtx.setLineDash([]);

          // Pontas luminosas (brilham na cor do pincel enquanto desenha)
          fxCtx.shadowBlur = c.drawing ? 14 : 0;
          fxCtx.shadowColor = tipColor;
          fxCtx.fillStyle = tipColor;
          fxCtx.beginPath();
          fxCtx.arc(c.thumbX, c.thumbY, 5, 0, Math.PI * 2);
          fxCtx.fill();
          fxCtx.beginPath();
          fxCtx.arc(c.x, c.y, 6, 0, Math.PI * 2);
          fxCtx.fill();
          fxCtx.restore();

          // Cursor do pincel na ponta do indicador
          const r = Math.max(6, size / 2 + 4);
          fxCtx.save();
          if (c.drawing) {
            fxCtx.shadowBlur = 16;
            fxCtx.shadowColor = color;
            fxCtx.fillStyle = rgba(color, 0.35);
            fxCtx.beginPath();
            fxCtx.arc(c.x, c.y, r, 0, Math.PI * 2);
            fxCtx.fill();
            fxCtx.strokeStyle = color;
            fxCtx.lineWidth = 2;
            fxCtx.stroke();
          } else {
            // Anel que encolhe conforme a pinça se fecha: mostra o quanto falta para desenhar
            fxCtx.strokeStyle = rgba(color, 0.7);
            fxCtx.lineWidth = 1.5;
            fxCtx.setLineDash([3, 3]);
            fxCtx.beginPath();
            fxCtx.arc(c.x, c.y, r + c.pinch * 12, 0, Math.PI * 2);
            fxCtx.stroke();
            fxCtx.setLineDash([]);
            fxCtx.fillStyle = rgba(color, 0.2 + (1 - c.pinch) * 0.5);
            fxCtx.beginPath();
            fxCtx.arc(c.x, c.y, Math.max(2, r * (1 - c.pinch)), 0, Math.PI * 2);
            fxCtx.fill();
          }
          fxCtx.restore();
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Atalhos: Ctrl+Z desfazer, Ctrl+Y ou Ctrl+Shift+Z refazer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // Lista todos os dispositivos de vídeo disponíveis
  const enumerateCameras = useCallback(async () => {
    setIsRefreshingCameras(true);
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        setCameras([]);
        return [];
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');
      setCameras(videoDevices);
      return videoDevices;
    } catch (err) {
      console.error('Erro ao enumerar câmeras:', err);
      return [];
    } finally {
      setIsRefreshingCameras(false);
    }
  }, []);

  // Redimensiona os canvas mantendo e escalonando o desenho existente
  const resizeCanvasAndPreserve = (newW: number, newH: number) => {
    const drawingCanvas = drawingCanvasRef.current;
    if (drawingCanvas) {
      if (drawingCanvas.width !== newW || drawingCanvas.height !== newH) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = drawingCanvas.width;
        tempCanvas.height = drawingCanvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx && drawingCanvas.width > 0 && drawingCanvas.height > 0) {
          tempCtx.drawImage(drawingCanvas, 0, 0);
        }

        drawingCanvas.width = newW;
        drawingCanvas.height = newH;

        const ctx = drawingCanvas.getContext('2d');
        if (ctx && tempCtx && tempCanvas.width > 0 && tempCanvas.height > 0) {
          ctx.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height, 0, 0, newW, newH);
        }
      }
    }

    if (canvasRef.current) {
      canvasRef.current.width = newW;
      canvasRef.current.height = newH;
    }
    if (fxCanvasRef.current) {
      fxCanvasRef.current.width = newW;
      fxCanvasRef.current.height = newH;
    }
    // Snapshots antigos têm outra dimensão: histórico é descartado
    undoStackRef.current = [];
    redoStackRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
  };

  // Inicia ou alterna a câmera especificada e a resolução
  const startCamera = useCallback(async (deviceIdToUse?: string, resIdToUse?: string) => {
    const resId = resIdToUse || selectedResId;
    const preset = RESOLUTION_PRESETS.find((p) => p.id === resId) || RESOLUTION_PRESETS[1];
    const gen = ++cameraGenRef.current;
    const isStale = () => gen !== cameraGenRef.current;

    // 1. Cancela loop de frames anterior
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }

    // 2. Para tracks ativas anteriores
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
          console.warn('Falha com ID exato de câmera, tentando câmera padrão...', err);
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

      // Atualiza lista de câmeras após permissão concedida para obter os labels
      const devs = await enumerateCameras();
      if (isStale()) return;
      const activeTrack = stream.getVideoTracks()[0];
      const settings = activeTrack?.getSettings();
      const currentDevId = settings?.deviceId || deviceIdToUse || (devs[0]?.deviceId ?? '');
      const actualW = settings?.width || preset.width;
      const actualH = settings?.height || preset.height;

      setActiveResolution({ width: actualW, height: actualH });
      setCameraResolution(`${actualW}x${actualH}`);
      setCameraAspect(`${actualW} / ${actualH}`);

      if (currentDevId) {
        setSelectedCameraId(currentDevId);
        localStorage.setItem('mannavision_camera_id', currentDevId);
      }

      resizeCanvasAndPreserve(actualW, actualH);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        if (isStale()) return;

        let isProcessing = false;
        let lastProcessTime = 0;

        const processFrame = async () => {
          if (isStale()) return; // loop órfão de uma geração anterior: encerra
          const video = videoRef.current;
          if (!video || video.paused || video.ended) {
            animFrameIdRef.current = requestAnimationFrame(processFrame);
            return;
          }

          const now = performance.now();
          if (video.readyState >= 2 && !isProcessing && (now - lastProcessTime >= 25)) {
            lastProcessTime = now;
            isProcessing = true;
            try {
              if (handsRef.current) {
                await handsRef.current.send({ image: video });
              }
            } catch (err) {
              console.error('Erro no processamento MediaPipe:', err);
            } finally {
              isProcessing = false;
            }
          }

          animFrameIdRef.current = requestAnimationFrame(processFrame);
        };

        animFrameIdRef.current = requestAnimationFrame(processFrame);
      }

      setCameraStatus('active');
    } catch (err: any) {
      console.error('Erro ao iniciar câmera:', err);
      setCameraStatus('error');
      setCameraErrorMsg(err.message || 'Não foi possível acessar a câmera.');
    }
  }, [enumerateCameras, selectedResId]);

  // Listener para conexões e desconexões de dispositivos
  useEffect(() => {
    const handleDeviceChange = () => {
      enumerateCameras();
    };
    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [enumerateCameras]);

  // Inicializa a câmera na montagem com o dispositivo salvo e resolução salva
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

  const handleResolutionChange = (newResId: string) => {
    setSelectedResId(newResId);
    localStorage.setItem('mannavision_resolution', newResId);
    startCamera(selectedCameraId, newResId);
  };

  const clearCanvas = () => {
    const ctx = drawingCanvasRef.current?.getContext('2d');
    if (ctx && drawingCanvasRef.current) {
      pushUndoSnapshot();
      ctx.clearRect(0, 0, drawingCanvasRef.current.width, drawingCanvasRef.current.height);
      particlesRef.current.clear();
    }
  };

const saveDrawing = () => {
    const drawingCanvas = drawingCanvasRef.current;
    if (!drawingCanvas) return;

    // 1. Criar um canvas temporário para fazer a mágica
    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return;

    tempCanvas.width = drawingCanvas.width;
    tempCanvas.height = drawingCanvas.height;

    // 2. SALVAR o estado original do canvas
    ctx.save();

    // 3. APLICAR O ESPELHAMENTO no canvas temporário para corresponder à tela (se espelhado)
    if (isMirrorRef.current) {
      ctx.scale(-1, 1);
      ctx.translate(-tempCanvas.width, 0);
    }

    // 4. DESENHAR a sua arte no canvas
    ctx.drawImage(drawingCanvas, 0, 0);

    // 5. RESTAURAR o canvas ao estado original (sem espelhamento)
    // Isso é CRUCIAL para que a logo seja desenhada corretamente, e não ao contrário!
    ctx.restore();

    // 6. Carregar e desenhar a logo no canto inferior direito (agora no canvas já corrigido)
    const logoImg = new Image();
    logoImg.src = '/logo_manna_vision.png';

    logoImg.onload = () => {
      const logoHeight = Math.min(60, tempCanvas.height * 0.1);
      const logoWidth = logoImg.width * (logoHeight / logoImg.height);
      const margin = 20;

      ctx.drawImage(logoImg, tempCanvas.width - logoWidth - margin, tempCanvas.height - logoHeight - margin, logoWidth, logoHeight);

      const link = document.createElement('a');
      link.download = `desenho-mannavision-${new Date().getTime()}.png`;
      link.href = tempCanvas.toDataURL('image/png');
      link.click();
    };

    logoImg.onerror = () => {
      console.error("Não foi possível carregar a logo. Salvando o desenho com a correção de espelhamento, mas sem a logo.");
      const link = document.createElement('a');
      link.download = `desenho-mannavision-${new Date().getTime()}.png`;
      link.href = tempCanvas.toDataURL('image/png');
      link.click();
    };
  };

  const saveSouvenir = () => {
    const videoCanvas = canvasRef.current;
    const drawingCanvas = drawingCanvasRef.current;

    if (!videoCanvas || !drawingCanvas) return;

    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return;

    tempCanvas.width = videoCanvas.width;
    tempCanvas.height = videoCanvas.height;

    const renderCombined = () => {
      if (isMirrorRef.current) {
        ctx.save();
        ctx.scale(-1, 1);
        ctx.translate(-tempCanvas.width, 0);
        ctx.drawImage(videoCanvas, 0, 0);
        ctx.drawImage(drawingCanvas, 0, 0);
        ctx.restore();
      } else {
        ctx.drawImage(videoCanvas, 0, 0);
        ctx.drawImage(drawingCanvas, 0, 0);
      }
    };

    const logoImg = new Image();
    logoImg.src = '/logo_manna_vision.png';

    logoImg.onload = () => {
      renderCombined();
      const logoHeight = 60;
      const logoWidth = logoImg.width * (logoHeight / logoImg.height);
      const margin = 20;
      ctx.drawImage(logoImg, tempCanvas.width - logoWidth - margin, tempCanvas.height - logoHeight - margin, logoWidth, logoHeight);
      const link = document.createElement('a');
      link.download = `recordacao-mannavision-${new Date().getTime()}.png`;
      link.href = tempCanvas.toDataURL('image/png');
      link.click();
    };

    logoImg.onerror = () => {
      console.error("Não foi possível carregar a logo para a recordação. Salvando sem logo.");
      renderCombined();
      const link = document.createElement('a');
      link.download = `recordacao-mannavision-${new Date().getTime()}.png`;
      link.href = tempCanvas.toDataURL('image/png');
      link.click();
    };
  };

  // --- FUNÇÃO PARA GERAR IMAGEM COM IA (Mantida) ---
  const handleGenerateImage = async () => {
    if (!promptText) {
      setError("Por favor, descreva a imagem que você quer criar.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setIsPromptModalOpen(false); // Fecha o modal de prompt

    try {
      const response = await fetch('http://127.0.0.1:5000/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Falha ao se comunicar com o servidor.');
      }

      const data = await response.json();
      setResultImageUrl(data.imageUrl);

    } catch (err: any) {
      console.error('Erro ao gerar imagem:', err);
      setError(err.message || 'Ocorreu um erro desconhecido.');
    } finally {
      setIsLoading(false);
    }
  };

// --- FUNÇÃO PARA SALVAR A IMAGEM GERADA PELA IA (AGORA COM LOGO) ---
  const handleSaveResult = () => {
    if (!resultImageUrl) return;

    // Criar um canvas temporário para adicionar a logo
    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.src = resultImageUrl; // A imagem gerada pela IA já é um data URL

    img.onload = () => {
      tempCanvas.width = img.width;
      tempCanvas.height = img.height;

      // Desenha a imagem gerada pela IA no canvas
      ctx.drawImage(img, 0, 0);

      // Carrega a logo
      const logoImg = new Image();
      logoImg.src = '/logo_manna_vision.png'; // Certifique-se de ter essa imagem na pasta public/

      logoImg.onload = () => {
        const logoHeight = Math.min(60, tempCanvas.height * 0.1); // Altura máxima de 60px, ou 10% da imagem
        const logoWidth = logoImg.width * (logoHeight / logoImg.height);
        const margin = 20;

        // Desenha a logo no canto inferior direito
        ctx.drawImage(logoImg, tempCanvas.width - logoWidth - margin, tempCanvas.height - logoHeight - margin, logoWidth, logoHeight);

        // Exporta o canvas final
        const link = document.createElement('a');
        link.download = `ia-mannavision-${new Date().getTime()}.png`;
        link.href = tempCanvas.toDataURL('image/png');
        link.click();
      };

      logoImg.onerror = () => {
        console.error("Não foi possível carregar a logo para a arte da IA. Salvando sem logo.");
        // Se a logo falhar, salva a imagem da IA sem a logo.
        const link = document.createElement('a');
        link.download = `ia-mannavision-${new Date().getTime()}.png`;
        link.href = resultImageUrl;
        link.click();
      };
    };

    img.onerror = () => {
      console.error("Não foi possível carregar a imagem gerada pela IA para adicionar a logo.");
      // Se a imagem da IA falhar, não faz nada ou mostra um erro.
      setError("Erro ao processar a imagem gerada para salvar.");
    };
  };


  return (
    <div className="manna-vision-container h-screen w-screen max-h-screen overflow-hidden select-none">
      <div className="h-full w-full bg-gradient-to-br from-[var(--bg-from)] to-[var(--bg-to)] via-black text-white flex flex-col overflow-hidden">
        {/* Header Compacto */}
        <header className="h-12 min-h-[48px] max-h-12 bg-black/40 backdrop-blur-md border-b border-[var(--border)]/20 px-4 flex items-center justify-between z-20 flex-shrink-0">
          <div className="flex items-center space-x-3">
            {onBackToHub && (
              <button
                onClick={onBackToHub}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-all hover:scale-105 border border-white/10 mr-1"
                title="Voltar para a tela inicial"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Hub Principal</span>
              </button>
            )}
            <img src="/logo_manna_vision.png" alt="MannaVision Logo" className="h-7 object-contain" />
            <span className="hidden sm:inline text-xs text-[var(--text)] border-l border-white/20 pl-3">
              Desenho no ar com IA & Gestos
            </span>
          </div>
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1.5" title="Temas de Cores">
              <button onClick={() => setThemeColor('purple')} className={`w-4 h-4 rounded-full bg-purple-500 transition-transform duration-200 ${themeColor === 'purple' ? 'ring-2 ring-white scale-125' : 'hover:scale-110'}`}></button>
              <button onClick={() => setThemeColor('blue')} className={`w-4 h-4 rounded-full bg-blue-500 transition-transform duration-200 ${themeColor === 'blue' ? 'ring-2 ring-white scale-125' : 'hover:scale-110'}`}></button>
              <button onClick={() => setThemeColor('green')} className={`w-4 h-4 rounded-full bg-green-500 transition-transform duration-200 ${themeColor === 'green' ? 'ring-2 ring-white scale-125' : 'hover:scale-110'}`}></button>
              <button onClick={() => setThemeColor('pink')} className={`w-4 h-4 rounded-full bg-pink-500 transition-transform duration-200 ${themeColor === 'pink' ? 'ring-2 ring-white scale-125' : 'hover:scale-110'}`}></button>
            </div>
          </div>
        </header>

        {/* Conteúdo Principal: Sidebar e Área da Câmera (100% contido na tela) */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Sidebar Compacta com rolagem suave se necessário */}
          <div className="w-72 lg:w-80 flex-shrink-0 h-full overflow-y-auto custom-scrollbar p-2.5 space-y-2 bg-black/40 backdrop-blur-md border-r border-[var(--border)]/20 text-xs">
            {/* Controle de Câmera e Resolução */}
            <div className="bg-[var(--dark)]/30 rounded-xl p-2.5 border border-[var(--border)]/20 shadow-inner">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold flex items-center text-white text-xs">
                  <CameraIcon className="w-3.5 h-3.5 mr-1.5 text-[var(--light)]" />
                  Câmera & Desempenho
                </h3>
                <div className="flex items-center space-x-1">
                  {cameraStatus === 'active' && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-500/20 text-green-300 border border-green-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 mr-1 animate-pulse"></span>
                      {cameraResolution || 'Ativa'}
                    </span>
                  )}
                  {cameraStatus === 'starting' && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 mr-1 animate-pulse"></span>
                      Iniciando
                    </span>
                  )}
                  {cameraStatus === 'error' && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-500/20 text-red-300 border border-red-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 mr-1"></span>
                      Erro
                    </span>
                  )}
                  <button
                    onClick={() => enumerateCameras()}
                    title="Atualizar lista de câmeras"
                    className="p-1 rounded hover:bg-white/10 text-[var(--text)] hover:text-white transition-colors"
                  >
                    <RefreshCw className={`w-3 h-3 ${isRefreshingCameras ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Seleção de Dispositivo */}
              <div className="space-y-2">
                <select
                  value={selectedCameraId}
                  onChange={(e) => handleCameraChange(e.target.value)}
                  disabled={cameraStatus === 'starting'}
                  className="w-full bg-black/60 border border-[var(--border)]/40 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[var(--main)] transition-all cursor-pointer truncate disabled:opacity-50"
                >
                  {cameras.length === 0 ? (
                    <option value="">{cameraStatus === 'starting' ? 'Detectando câmeras...' : 'Câmera Padrão'}</option>
                  ) : (
                    cameras.map((device, idx) => (
                      <option key={device.deviceId || idx} value={device.deviceId} className="bg-gray-900 text-white">
                        {device.label || `Câmera ${idx + 1}`}
                      </option>
                    ))
                  )}
                </select>

                {/* Seletor dos 3 Modos de Resolução (640, 800, 1280) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-[var(--text)] font-medium">Modo / Resolução:</span>
                    <span className="text-[10px] text-gray-400">
                      {RESOLUTION_PRESETS.find(p => p.id === selectedResId)?.desc || ''}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 bg-black/40 p-0.5 rounded-lg border border-white/10">
                    {RESOLUTION_PRESETS.map((p) => {
                      const isSel = selectedResId === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleResolutionChange(p.id)}
                          className={`py-1 px-1.5 rounded-md text-[11px] font-medium transition-all flex flex-col items-center justify-center ${
                            isSel
                              ? 'bg-[var(--main)] text-white shadow-sm shadow-[var(--light)]/25 font-bold'
                              : 'text-gray-300 hover:text-white hover:bg-white/5'
                          }`}
                          title={p.desc}
                        >
                          <span>{p.label}</span>
                          <span className={`text-[9px] ${isSel ? 'text-white/80' : 'text-gray-400'}`}>{p.tag}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {cameraErrorMsg && (
                  <div className="bg-red-900/30 border border-red-500/40 rounded-lg p-2 text-xs text-red-200">
                    <p className="font-medium text-[11px]">Falha na câmera:</p>
                    <p className="text-red-300 text-[10px] mb-1.5">{cameraErrorMsg}</p>
                    <button
                      onClick={() => startCamera(selectedCameraId, selectedResId)}
                      className="bg-red-600/50 hover:bg-red-600/80 px-2 py-0.5 rounded text-[10px] font-medium text-white transition-colors"
                    >
                      Tentar Novamente
                    </button>
                  </div>
                )}

                {/* Espelhar Imagem */}
                <div className="flex items-center justify-between pt-1 border-t border-[var(--border)]/15">
                  <span className="text-[11px] text-[var(--text)]">Espelhar horizontal:</span>
                  <button
                    type="button"
                    onClick={() => setIsMirror((m) => !m)}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-medium flex items-center space-x-1 transition-all ${
                      isMirror
                        ? 'bg-[var(--main)] text-white shadow-sm shadow-[var(--light)]/30'
                        : 'bg-white/10 text-gray-300 hover:bg-white/15'
                    }`}
                    title="Inverter horizontalmente a imagem da câmera"
                  >
                    <FlipHorizontal className="w-3 h-3" />
                    <span>{isMirror ? 'Espelhado' : 'Normal'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Fundo do palco */}
            <div className="bg-[var(--dark)]/30 rounded-xl p-2.5 border border-[var(--border)]/20">
              <h3 className="font-semibold mb-1.5 flex items-center text-xs">
                <Video className="w-3.5 h-3.5 mr-1.5 text-[var(--light)]" />
                Fundo
              </h3>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { id: 'webcam', label: 'Webcam', icon: <Video className="w-3.5 h-3.5" /> },
                  { id: 'white', label: 'Lousa', icon: <Square className="w-3.5 h-3.5" /> },
                  { id: 'dark', label: 'Escuro', icon: <Moon className="w-3.5 h-3.5" /> },
                ] as { id: BoardMode; label: string; icon: React.ReactNode }[]).map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setBoardMode(b.id)}
                    className={`py-1.5 px-2 rounded-lg transition-all duration-200 flex items-center justify-center space-x-1.5 text-xs ${
                      boardMode === b.id
                        ? 'bg-[var(--main)] shadow-md shadow-[var(--light)]/25 text-white font-medium'
                        : 'bg-[var(--dark)]/30 text-[var(--text)] hover:bg-[var(--main)]/30'
                    }`}
                  >
                    {b.icon}
                    <span>{b.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Ferramentas: Pincel/Borracha, Desfazer, Espessura, Tinta e Pinça */}
            <div className="bg-[var(--dark)]/30 rounded-xl p-2.5 border border-[var(--border)]/20">
              <h3 className="font-semibold mb-1.5 text-xs">Ferramentas</h3>
              <div className="flex space-x-1.5 mb-2">
                <button
                  onClick={() => setIsEraser(false)}
                  className={`flex-1 py-1.5 px-2 rounded-lg transition-all duration-200 flex items-center justify-center space-x-1.5 text-xs ${
                    !isEraser
                      ? 'bg-[var(--main)] shadow-md shadow-[var(--light)]/25 text-white font-medium'
                      : 'bg-[var(--dark)]/30 text-[var(--text)] hover:bg-[var(--main)]/30'
                  }`}
                >
                  <Palette className="w-3.5 h-3.5" />
                  <span>Pincel</span>
                </button>
                <button
                  onClick={() => setIsEraser(true)}
                  className={`flex-1 py-1.5 px-2 rounded-lg transition-all duration-200 flex items-center justify-center space-x-1.5 text-xs ${
                    isEraser
                      ? 'bg-[var(--main)] shadow-md shadow-[var(--light)]/25 text-white font-medium'
                      : 'bg-[var(--dark)]/30 text-[var(--text)] hover:bg-[var(--main)]/30'
                  }`}
                >
                  <Eraser className="w-3.5 h-3.5" />
                  <span>Borracha</span>
                </button>
                <button
                  onClick={undo}
                  disabled={!canUndo}
                  className="w-8 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10 flex items-center justify-center transition-colors"
                  title="Desfazer (Ctrl+Z)"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={redo}
                  disabled={!canRedo}
                  className="w-8 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10 flex items-center justify-center transition-colors"
                  title="Refazer (Ctrl+Y)"
                >
                  <Redo2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div>
                <div className="flex justify-between items-center text-[11px] text-[var(--text)] mb-1">
                  <span>Espessura:</span>
                  <span className="font-mono font-medium">{brushSize}px</span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setBrushSize((s) => Math.max(1, s - 1))}
                    className="w-6 h-6 bg-[var(--main)]/40 hover:bg-[var(--light)]/50 rounded flex items-center justify-center transition-colors text-white"
                  >
                    <MinusIcon className="w-3 h-3" />
                  </button>
                  <div className="flex-1 bg-[var(--dark)]/40 rounded-lg h-2 relative overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-[var(--light)] to-pink-500 h-full rounded-lg transition-all duration-200"
                      style={{ width: `${(brushSize / 30) * 100}%` }}
                    />
                  </div>
                  <button
                    onClick={() => setBrushSize((s) => Math.min(30, s + 1))}
                    className="w-6 h-6 bg-[var(--main)]/40 hover:bg-[var(--light)]/50 rounded flex items-center justify-center transition-colors text-white"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Tinta evanescente (light painting) */}
              <div className="flex items-center justify-between pt-2 mt-2 border-t border-[var(--border)]/15">
                <span className="text-[11px] text-[var(--text)] flex items-center space-x-1">
                  <Hourglass className="w-3 h-3" />
                  <span>Tinta evanescente:</span>
                </span>
                <button
                  type="button"
                  onClick={() => setFadeInk((f) => !f)}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${
                    fadeInk
                      ? 'bg-[var(--main)] text-white shadow-sm shadow-[var(--light)]/30'
                      : 'bg-white/10 text-gray-300 hover:bg-white/15'
                  }`}
                  title="O traço desaparece aos poucos, como pintura de luz"
                >
                  {fadeInk ? 'Ligada' : 'Desligada'}
                </button>
              </div>

              {/* Sensibilidade da pinça */}
              <div className="pt-2 mt-2 border-t border-[var(--border)]/15">
                <div className="flex justify-between items-center text-[11px] text-[var(--text)] mb-1">
                  <span>Sensibilidade da pinça:</span>
                  <span className="font-mono font-medium">{pinchThreshold.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="0.6"
                  step="0.01"
                  value={pinchThreshold}
                  onChange={(e) => setPinchThreshold(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[var(--light)]"
                  title="Menor = precisa juntar mais os dedos para desenhar"
                />
              </div>
            </div>

            {/* Estilos */}
            <div className="bg-[var(--dark)]/30 rounded-xl p-2.5 border border-[var(--border)]/20">
              <h3 className="font-semibold mb-1.5 text-xs">Estilos</h3>
              <div className="grid grid-cols-2 gap-1.5">
                {BRUSH_STYLES.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      setBrushStyle(b.id);
                      setIsEraser(false);
                    }}
                    title={b.hint}
                    className={`py-1 px-2 rounded-lg transition-all duration-200 flex items-center space-x-1.5 text-[11px] ${
                      brushStyle === b.id && !isEraser
                        ? 'bg-[var(--main)] shadow-md shadow-[var(--light)]/25 text-white font-medium'
                        : 'bg-[var(--dark)]/30 text-[var(--text)] hover:bg-[var(--main)]/30'
                    }`}
                  >
                    {BRUSH_ICONS[b.id]}
                    <span>{b.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Simetria / Caleidoscópio */}
            <div className="bg-[var(--dark)]/30 rounded-xl p-2.5 border border-[var(--border)]/20">
              <h3 className="font-semibold mb-1.5 flex items-center text-xs">
                <Flower2 className="w-3.5 h-3.5 mr-1.5 text-[var(--light)]" />
                Simetria
              </h3>
              <div className="grid grid-cols-6 gap-1">
                {SYMMETRY_MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSymmetry(m.id)}
                    title={m.hint}
                    className={`py-1 rounded-lg transition-all duration-200 text-[11px] ${
                      symmetry === m.id
                        ? 'bg-[var(--main)] shadow-md shadow-[var(--light)]/25 text-white font-medium'
                        : 'bg-[var(--dark)]/30 text-[var(--text)] hover:bg-[var(--main)]/30'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Cores */}
            <div className="bg-[var(--dark)]/30 rounded-xl p-2.5 border border-[var(--border)]/20">
              <h3 className="font-semibold mb-1.5 text-xs">Cores</h3>
              <div className="grid grid-cols-6 gap-1.5">
                {colors.map((color) => (
                  <button
                    key={color}
                    onClick={() => {
                      setCurrentColor(color);
                      setIsEraser(false);
                    }}
                    className={`w-full aspect-square rounded-md transition-all duration-200 ${
                      currentColor === color && !isEraser
                        ? 'ring-2 ring-white ring-offset-1 ring-offset-black scale-110'
                        : 'hover:scale-105'
                    } ${color === '#FFFFFF' ? 'border border-[var(--border)]/30' : ''}`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>

            {/* Ações */}
            <div className="space-y-1.5 pt-2 border-t border-[var(--border)]/20">
              <button
                onClick={() => setIsPromptModalOpen(true)}
                className="w-full bg-gradient-to-r from-[var(--main)] to-[var(--light)] text-white font-semibold py-2 rounded-lg transition-all duration-200 flex items-center justify-center space-x-1.5 hover:shadow-md hover:shadow-[var(--light)]/30 text-xs"
              >
                <Sparkles className="w-4 h-4" />
                <span>Gerar Imagem com IA</span>
              </button>
              <div className="grid grid-cols-3 gap-1">
                <button
                  onClick={clearCanvas}
                  className="bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-300 py-1.5 rounded-lg transition-all duration-200 flex flex-col items-center justify-center text-[10px]"
                  title="Limpar Desenho"
                >
                  <Trash2 className="w-3.5 h-3.5 mb-0.5" />
                  <span>Limpar</span>
                </button>
                <button
                  onClick={saveDrawing}
                  className="bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 text-green-300 py-1.5 rounded-lg transition-all duration-200 flex flex-col items-center justify-center text-[10px]"
                  title="Salvar Desenho PNG transparente"
                >
                  <Download className="w-3.5 h-3.5 mb-0.5" />
                  <span>Desenho</span>
                </button>
                <button
                  onClick={saveSouvenir}
                  className="bg-[var(--main)]/20 hover:bg-[var(--main)]/30 border border-[var(--border)]/30 text-[var(--text)] py-1.5 rounded-lg transition-all duration-200 flex flex-col items-center justify-center text-[10px]"
                  title="Salvar Recordação (Câmera + Desenho + Logo)"
                >
                  <CameraIcon className="w-3.5 h-3.5 mb-0.5" />
                  <span>Recordação</span>
                </button>
              </div>
            </div>
          </div>

          {/* Área Principal: Câmera/Lousa e Canvas de Desenho (Fita na proporção exata sem cortar e sem esticar) */}
          <div className="flex-1 h-full min-h-0 min-w-0 p-3 flex items-center justify-center relative overflow-hidden bg-black/40">
            <div
              className="relative rounded-2xl overflow-hidden border-2 shadow-2xl bg-black border-[var(--border)]/30 flex items-center justify-center"
              style={{
                aspectRatio: cameraAspect,
                maxWidth: '100%',
                maxHeight: '100%',
                width: '100%',
                height: '100%',
              }}
            >
              <video
                ref={videoRef}
                className="w-full h-full object-contain"
                autoPlay
                muted
                playsInline
                style={{ transform: isMirror ? 'scaleX(-1)' : 'none' }}
              />
              <canvas
                ref={canvasRef}
                width={activeResolution.width}
                height={activeResolution.height}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                style={{ transform: isMirror ? 'scaleX(-1)' : 'none' }}
              />
              {boardMode === 'white' && <div className="absolute inset-0 bg-white" />}
              {boardMode === 'dark' && <div className="absolute inset-0 bg-[#05060a]" />}
              <canvas
                ref={drawingCanvasRef}
                width={activeResolution.width}
                height={activeResolution.height}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                style={{ transform: isMirror ? 'scaleX(-1)' : 'none' }}
              />
              {/* Camada de efeitos: partículas e cursor dos dedos (redesenhada a 60 fps) */}
              <canvas
                ref={fxCanvasRef}
                width={activeResolution.width}
                height={activeResolution.height}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                style={{ transform: isMirror ? 'scaleX(-1)' : 'none' }}
              />

              {/* Badges Flutuantes sobre o Vídeo */}
              <div className="absolute top-3 right-3 flex items-center space-x-2 z-10">
                {isDrawing && (
                  <div className="bg-green-600/85 backdrop-blur-sm rounded-full px-2.5 py-1 text-xs font-medium animate-pulse shadow-lg flex items-center space-x-1">
                    <span>✏️</span>
                    <span>Desenhando</span>
                  </div>
                )}

                <div className="bg-black/70 backdrop-blur-md border border-white/15 rounded-lg px-2 py-1 flex items-center space-x-1.5 text-[11px] text-gray-300">
                  <span className="font-mono">{cameraResolution || '800x600'}</span>
                  <span className="text-gray-500">|</span>
                  <button
                    onClick={() => setIsMirror((m) => !m)}
                    title={isMirror ? 'Desativar espelho' : 'Ativar espelho'}
                    className={`hover:text-white transition-colors ${isMirror ? 'text-[var(--light)]' : 'text-gray-400'}`}
                  >
                    <FlipHorizontal className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="absolute top-3 left-3 bg-black/75 backdrop-blur-md rounded-lg px-3 py-2 z-10 border border-white/10 text-[11px]">
                <p className="font-semibold text-white mb-0.5">Como desenhar:</p>
                <p className="text-[var(--text)]">🤏 Junte polegar e indicador para pintar</p>
                <p className="text-gray-400">✋ Afaste para soltar • 🙌 Duas mãos pintam juntas</p>
                <p className="text-gray-500">Ctrl+Z desfaz • Ctrl+Y refaz</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* --- MODAL DE PROMPT (Rodapé) --- */}
      {isPromptModalOpen && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/80 backdrop-blur-md p-4 border-t border-[var(--border)]/30 flex items-center gap-4 animate-slide-up z-50">
          <input
            type="text"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            className="flex-1 p-3 rounded-lg bg-white/10 border border-white/20 focus:ring-2 focus:ring-[var(--main)] focus:outline-none text-white placeholder-gray-400"
            placeholder="Descreva a imagem que você quer criar (ex: um peixe-palhaço no estilo de Van Gogh)"
            autoFocus
            disabled={isLoading}
          />
          <button
            onClick={handleGenerateImage}
            disabled={isLoading || !promptText.trim()}
            className="bg-[var(--main)] hover:bg-[var(--light)] text-white font-bold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Gerando...' : 'Gerar'}
          </button>
          <button onClick={() => { setIsPromptModalOpen(false); setPromptText(''); }} className="p-3 hover:bg-white/10 rounded-full transition-colors"><XIcon className="w-5 h-5 text-white" /></button>
        </div>
      )}

      {/* --- MODAL DE RESULTADO (Centralizado) --- */}
      {(isLoading || resultImageUrl || error) && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-[var(--dark)] to-black/50 p-6 rounded-2xl border border-[var(--border)]/30 max-w-2xl w-full text-center animate-fade-in">
            {isLoading && (
              <>
                <div className="w-12 h-12 border-4 border-[var(--main)] border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="mt-4 text-lg text-[var(--text)]">Gerando sua obra de arte... Isso pode levar até um minuto.</p>
              </>
            )}
            {error && (
              <>
                <h2 className="text-2xl font-bold text-red-400">Ocorreu um Erro</h2>
                <p className="mt-2 text-red-300">{error}</p>
                <button onClick={() => { setError(null); setIsPromptModalOpen(true); }} className="mt-6 bg-red-500/80 hover:bg-red-500 text-white font-bold py-2 px-6 rounded-lg">Tentar Novamente</button>
              </>
            )}
            {resultImageUrl && (
              <>
                <h2 className="text-2xl font-bold text-[var(--text)] mb-4">Sua Arte está Pronta!</h2>
                <img src={resultImageUrl} alt="Imagem gerada pela IA" className="rounded-lg w-full max-h-[60vh] object-contain" />
                <div className="flex justify-center gap-4 mt-6">
                  <button onClick={() => setResultImageUrl(null)} className="bg-white/10 hover:bg-white/20 text-white font-bold py-2 px-6 rounded-lg"><XIcon className="w-4 h-4 mr-2 inline" />Fechar</button>
                  <button onClick={handleSaveResult} className="bg-[var(--main)] hover:bg-[var(--light)] text-white font-bold py-2 px-6 rounded-lg"><Save className="w-4 h-4 mr-2 inline"/>Salvar Imagem</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default HandDrawingApp;