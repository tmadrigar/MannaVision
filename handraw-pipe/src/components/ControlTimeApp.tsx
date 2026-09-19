// src/components/ControlTimeApp.tsx

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Hands, Results } from '@mediapipe/hands';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import {
  Clock, ArrowLeft, FlipHorizontal, Eye, EyeOff, Sliders, Upload, Activity, AlertCircle
} from 'lucide-react';
import { GestureInterpreter, GestureData, DEFAULT_GESTURE_CONFIG } from '../utils/gestureInterpreter';
import { TIME_EXPERIENCES, TimeExperience } from '../utils/timeExperiences';
import { RESOLUTION_PRESETS } from './HandDrawingApp';

type ThemeColor = 'purple' | 'blue' | 'green' | 'pink';

interface ControlTimeAppProps {
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

// Função auxiliar pura para desenhar o frame preservando proporção
function drawFrameImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  canvasW: number,
  canvasH: number
) {
  if (!ctx || !img || !canvasW || !canvasH) return;
  ctx.clearRect(0, 0, canvasW, canvasH);
  const imgAspect = (img.naturalWidth || 16) / (img.naturalHeight || 9);
  const canvasAspect = canvasW / canvasH;
  let drawW = canvasW;
  let drawH = canvasH;
  let offsetX = 0;
  let offsetY = 0;

  if (canvasAspect > imgAspect) {
    drawW = canvasH * imgAspect;
    offsetX = (canvasW - drawW) / 2;
  } else {
    drawH = canvasW / imgAspect;
    offsetY = (canvasH - drawH) / 2;
  }

  ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
}

const ControlTimeApp: React.FC<ControlTimeAppProps> = ({ onBackToHub }) => {
  // --- REFS ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const pipCanvasRef = useRef<HTMLCanvasElement>(null);
  const stageCanvasRef = useRef<HTMLCanvasElement>(null);
  const userVideoRef = useRef<HTMLVideoElement>(null);
  const handsRef = useRef<Hands | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  // Geração da câmera: chamadas obsoletas de startCamera (efeito duplo do StrictMode)
  // abortam ao acordar de um await, evitando dois loops chamando hands.send()
  const cameraGenRef = useRef(0);
  const interpreterRef = useRef<GestureInterpreter>(new GestureInterpreter());
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  // --- ESTADOS DE CONTROLE TEMPORAL ---
  const [selectedExperience, setSelectedExperience] = useState<TimeExperience>(TIME_EXPERIENCES[0]);
  const [timelineProgress, setTimelineProgress] = useState<number>(0.0); // 0.0 a 1.0
  const [gestureData, setGestureData] = useState<GestureData>({
    handDetected: false,
    rawPinchDistance: 0,
    handScale: 1,
    normalizedPinch: 0,
    pinchProgress: 0,
    thumbTip: null,
    indexTip: null,
    wrist: null,
  });

  // --- ESTADOS DE UI E HUD ---
  const [showDebugHud, setShowDebugHud] = useState<boolean>(false);
  const [showPipWebcam, setShowPipWebcam] = useState<boolean>(true);
  const [sensitivityConfig, setSensitivityConfig] = useState(DEFAULT_GESTURE_CONFIG);
  const [customVideoUrl, setCustomVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [isVideoLoaded, setIsVideoLoaded] = useState<boolean>(false);
  const [mediaPipeStatus, setMediaPipeStatus] = useState<string>('Iniciando IA...');
  const [mediaPipeError, setMediaPipeError] = useState<string | null>(null);
  const [framesProcessedCount, setFramesProcessedCount] = useState<number>(0);

  // Armazenamento de frames em cache para renderização com latência zero
  const preloadedImagesRef = useRef<{ [expId: string]: HTMLImageElement[] }>({});
  const [framesLoadingProgress, setFramesLoadingProgress] = useState<number>(100);
  const [isFramesLoading, setIsFramesLoading] = useState<boolean>(false);
  const [framesReady, setFramesReady] = useState<boolean>(false);

  // Manter refs sincronizadas
  useEffect(() => {
    isMirrorRef.current = isMirror;
  }, [isMirror]);

  // Atualizar configurações do interpretador
  useEffect(() => {
    interpreterRef.current.updateConfig(sensitivityConfig);
  }, [sensitivityConfig]);

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

  // --- PROCESSAR RESULTADOS DO MEDIAPIPE HANDS ---
  const onResults = useCallback((results: Results) => {
    setFramesProcessedCount((c) => c + 1);
    setMediaPipeStatus('Ativo');
    setMediaPipeError(null);

    let primaryLandmarks = undefined;
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      primaryLandmarks = results.multiHandLandmarks[0];
    }

    // 1. Interpretar o gesto através do motor de normalização e suavização
    const data = interpreterRef.current.process(primaryLandmarks);
    setGestureData(data);

    // 2. Atualizar o progresso temporal:
    if (data.handDetected) {
      setTimelineProgress(data.pinchProgress);
    } else {
      setTimelineProgress(0);
      interpreterRef.current.reset(0);
    }

    // 3. Desenhar o esqueleto e pinça da mão no Canvas transparente sobre a webcam
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

        if (primaryLandmarks) {
          try {
            drawConnectors(pipCtx, primaryLandmarks, HAND_CONNECTIONS_ARRAY, {
              color: '#06b6d4',
              lineWidth: 2,
            });
            drawLandmarks(pipCtx, primaryLandmarks, {
              color: '#38bdf8',
              lineWidth: 1,
              radius: 3,
            });
          } catch (drawErr) {
            console.warn('Aviso no desenho dos landmarks:', drawErr);
          }

          // Destacar polegar (4) e indicador (8)
          const thumb = primaryLandmarks[4];
          const index = primaryLandmarks[8];

          if (thumb && index) {
            const tX = thumb.x * pipCanvas.width;
            const tY = thumb.y * pipCanvas.height;
            const iX = index.x * pipCanvas.width;
            const iY = index.y * pipCanvas.height;

            // Linha de pinça pulsante
            pipCtx.beginPath();
            pipCtx.moveTo(tX, tY);
            pipCtx.lineTo(iX, iY);
            pipCtx.strokeStyle = '#f43f5e';
            pipCtx.lineWidth = 3;
            pipCtx.setLineDash([4, 4]);
            pipCtx.stroke();
            pipCtx.setLineDash([]);

            // Indicadores luminosos nas pontas dos dedos
            pipCtx.fillStyle = '#fb7185';
            pipCtx.beginPath();
            pipCtx.arc(tX, tY, 6, 0, Math.PI * 2);
            pipCtx.fill();

            pipCtx.beginPath();
            pipCtx.arc(iX, iY, 6, 0, Math.PI * 2);
            pipCtx.fill();
          }
        }

        pipCtx.restore();
      }
    }
  }, []);

  // --- INICIALIZAÇÃO DO MODELO MEDIAPIPE HANDS (PADRÃO ROBUSTO DE HANDDRAWINGAPP) ---
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

  // --- PRÉ-CARREGAR SEQUÊNCIA DE FRAMES REAIS ---
  useEffect(() => {
    if (selectedExperience.type === 'frame_sequence' && selectedExperience.frames) {
      const expId = selectedExperience.id;
      if (!preloadedImagesRef.current[expId] || preloadedImagesRef.current[expId].length === 0) {
        setIsFramesLoading(true);
        setFramesLoadingProgress(0);
        setFramesReady(false);
        const frameUrls = selectedExperience.frames;
        const total = frameUrls.length;
        let loaded = 0;
        const imgElements: HTMLImageElement[] = new Array(total);

        frameUrls.forEach((url, idx) => {
          const img = new Image();
          img.src = url;
          const onDone = () => {
            loaded++;
            setFramesLoadingProgress(Math.floor((loaded / total) * 100));

            // Assim que o frame 0 (ou o primeiro frame) carregar, desenha imediatamente na tela!
            if (idx === 0) {
              setFramesReady(true);
              const stageCanvas = stageCanvasRef.current;
              if (stageCanvas) {
                const ctx = stageCanvas.getContext('2d');
                if (ctx) {
                  drawFrameImage(ctx, img, stageCanvas.width, stageCanvas.height);
                }
              }
            }

            if (loaded >= total) {
              setIsFramesLoading(false);
              setFramesReady(true);
            }
          };
          img.onload = onDone;
          img.onerror = onDone;
          imgElements[idx] = img;
        });

        preloadedImagesRef.current[expId] = imgElements;
      } else {
        setIsFramesLoading(false);
        setFramesLoadingProgress(100);
        setFramesReady(true);
        // Se já estava em cache, desenha o frame imediatamente
        const cached = preloadedImagesRef.current[expId];
        if (cached && cached[0] && stageCanvasRef.current) {
          const ctx = stageCanvasRef.current.getContext('2d');
          if (ctx) {
            drawFrameImage(ctx, cached[0], stageCanvasRef.current.width, stageCanvasRef.current.height);
          }
        }
      }
    }
  }, [selectedExperience]);

  // --- RENDERIZAÇÃO DA EXPERIÊNCIA PRINCIPAL ---
  useEffect(() => {
    if (selectedExperience.type === 'frame_sequence') {
      const stageCanvas = stageCanvasRef.current;
      if (!stageCanvas) return;
      const ctx = stageCanvas.getContext('2d');
      if (!ctx) return;

      const rect = stageCanvas.getBoundingClientRect();
      if (stageCanvas.width !== rect.width || stageCanvas.height !== rect.height) {
        stageCanvas.width = rect.width;
        stageCanvas.height = rect.height;
      }

      const images = preloadedImagesRef.current[selectedExperience.id];
      if (images && images.length > 0) {
        const frameIndex = Math.min(
          images.length - 1,
          Math.max(0, Math.floor(timelineProgress * (images.length - 1)))
        );
        const img = images[frameIndex] || images[0];
        if (img && (img.complete || img.naturalWidth > 0)) {
          drawFrameImage(ctx, img, stageCanvas.width, stageCanvas.height);
        }
      }
    } else if (selectedExperience.type === 'procedural') {
      const stageCanvas = stageCanvasRef.current;
      if (!stageCanvas) return;
      const ctx = stageCanvas.getContext('2d');
      if (!ctx) return;

      // Ajustar dimensões do canvas para renderização nítida
      const rect = stageCanvas.getBoundingClientRect();
      if (stageCanvas.width !== rect.width || stageCanvas.height !== rect.height) {
        stageCanvas.width = rect.width;
        stageCanvas.height = rect.height;
      }

      if (selectedExperience.renderProcedural) {
        selectedExperience.renderProcedural(ctx, timelineProgress, stageCanvas.width, stageCanvas.height);
      }
    } else if (selectedExperience.type === 'video') {
      const userVideo = userVideoRef.current;
      if (userVideo && isVideoLoaded && videoDuration > 0) {
        const targetTime = timelineProgress * videoDuration;
        // Evitar chamadas desnecessárias se a variação de tempo for mínima
        if (Math.abs(userVideo.currentTime - targetTime) > 0.04) {
          userVideo.currentTime = targetTime;
        }
      }
    }
  }, [timelineProgress, selectedExperience, isVideoLoaded, videoDuration, framesReady, isFramesLoading]);

  // Redimensionar canvas quando a janela mudar
  useEffect(() => {
    const handleResize = () => {
      const stageCanvas = stageCanvasRef.current;
      if (!stageCanvas) return;
      const rect = stageCanvas.getBoundingClientRect();
      stageCanvas.width = rect.width;
      stageCanvas.height = rect.height;
      const ctx = stageCanvas.getContext('2d');
      if (!ctx) return;

      if (selectedExperience.type === 'frame_sequence') {
        const images = preloadedImagesRef.current[selectedExperience.id];
        if (images && images.length > 0) {
          const frameIndex = Math.min(
            images.length - 1,
            Math.max(0, Math.floor(timelineProgress * (images.length - 1)))
          );
          const img = images[frameIndex];
          if (img && img.complete) {
            drawFrameImage(ctx, img, stageCanvas.width, stageCanvas.height);
          }
        }
      } else if (selectedExperience.type === 'procedural' && selectedExperience.renderProcedural) {
        selectedExperience.renderProcedural(ctx, timelineProgress, stageCanvas.width, stageCanvas.height);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [selectedExperience, timelineProgress]);

  // --- ÁUDIO REATIVO: GERENCIAR TRILHA SONORA EM LOOP (SOM & GUITARRA) ---
  useEffect(() => {
    if (selectedExperience.audioUrl) {
      const audioUrl = selectedExperience.audioUrl;
      if (!audioRef.current || !audioRef.current.src.includes(audioUrl)) {
        if (audioRef.current) {
          audioRef.current.pause();
        }
        const audio = new Audio(audioUrl);
        audio.loop = true;
        audio.volume = 0; // Começa no volume zero como requisitado
        audioRef.current = audio;

        // Inicia áudio (respeitando autoplay policy)
        audio.play().catch((err) => {
          console.warn('Autoplay bloqueado pelo navegador aguardando interação do usuário:', err);
        });
      }
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
  }, [selectedExperience]);

  // Atualiza volume da música estritamente baseado no progresso da pinça (0.0 a 1.0)
  useEffect(() => {
    if (audioRef.current && selectedExperience.audioUrl) {
      if (gestureData.handDetected) {
        const vol = Math.max(0, Math.min(1, timelineProgress));
        audioRef.current.volume = vol;
        if (audioRef.current.paused && vol > 0) {
          audioRef.current.play().catch(() => {});
        }
      } else {
        audioRef.current.volume = 0;
      }
    }
  }, [timelineProgress, gestureData.handDetected, selectedExperience]);

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

        // Loop de envio de novos frames decodificados para o MediaPipe
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
            (now - lastProcessTime >= 25)
          ) {
            lastProcessTime = now;
            isProcessing = true;
            try {
              if (handsRef.current) {
                await handsRef.current.send({ image: video });
                if (mediaPipeError) {
                  setMediaPipeError(null);
                }
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

  // --- CARREGAR VÍDEO PRÓPRIO ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setCustomVideoUrl(url);
      setIsVideoLoaded(false);

      // Troca para o modo vídeo personalizado
      const customExp = TIME_EXPERIENCES.find((exp) => exp.id === 'custom_video');
      if (customExp) {
        setSelectedExperience(customExp);
      }
    }
  };

  return (
    <div className="manna-vision-container h-screen w-screen max-h-screen overflow-hidden flex flex-col bg-gradient-to-br from-[var(--bg-from)] via-black to-[var(--bg-to)] text-white select-none">
      {/* 1. HEADER SUPERIOR COMPACTO */}
      <header className="h-12 min-h-[48px] max-h-12 bg-black/50 backdrop-blur-md border-b border-[var(--border)]/20 px-4 flex items-center justify-between z-30 flex-shrink-0">
        <div className="flex items-center space-x-3">
          {/* Botão Voltar ao Hub */}
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
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-xs font-semibold text-cyan-200">Control Time</span>
            <span className="text-[10px] text-gray-400">• Linha do tempo gestual bidirecional</span>
          </div>
        </div>

        {/* Controles de Câmera, Resolução e Debug */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Alternar Picture-in-Picture */}
          <button
            onClick={() => setShowPipWebcam(!showPipWebcam)}
            className={`p-1.5 rounded-lg text-xs flex items-center space-x-1 transition-colors border ${
              showPipWebcam
                ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
            }`}
            title="Alternar visualização da câmera de rastreamento"
          >
            {showPipWebcam ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span className="hidden lg:inline text-[11px]">PiP Câmera</span>
          </button>

          {/* Toggle HUD de Depuração */}
          <button
            onClick={() => setShowDebugHud(!showDebugHud)}
            className={`p-1.5 rounded-lg text-xs flex items-center space-x-1 transition-colors border ${
              showDebugHud
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
            }`}
            title="Abrir métricas e calibrador de pinça"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden lg:inline text-[11px]">Calibrador</span>
          </button>

          {/* Seletor de Câmera */}
          <select
            value={selectedCameraId}
            onChange={(e) => handleCameraChange(e.target.value)}
            disabled={cameraStatus === 'starting'}
            className="bg-black/60 border border-[var(--border)]/40 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-all cursor-pointer max-w-[120px] sm:max-w-[160px] truncate"
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

          {/* Seletor de Resolução */}
          <select
            value={selectedResId}
            onChange={(e) => handleResolutionChange(e.target.value)}
            className="bg-black/60 border border-[var(--border)]/40 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-all cursor-pointer"
            title="Resolução da Câmera (640p / 800p / 1280p)"
          >
            {RESOLUTION_PRESETS.map((p) => (
              <option key={p.id} value={p.id} className="bg-gray-900 text-white">
                {p.label}
              </option>
            ))}
          </select>

          {/* Espelhar Câmera */}
          <button
            onClick={() => setIsMirror(!isMirror)}
            className={`p-1.5 rounded-lg transition-colors ${
              isMirror ? 'bg-cyan-500/20 text-cyan-300' : 'bg-white/10 text-gray-400'
            }`}
            title={isMirror ? 'Espelhamento ativado' : 'Espelhamento desativado'}
          >
            <FlipHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* 2. ÁREA DE PALCO PRINCIPAL (EXPERIÊNCIA TEMPORAL) */}
      <div className="relative flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden bg-black/80">
        {/* Renderizador de Experiência Procedural ou Sequência de Frames Reais */}
        {(selectedExperience.type === 'procedural' || selectedExperience.type === 'frame_sequence') && (
          <canvas
            ref={stageCanvasRef}
            className="w-full h-full object-contain pointer-events-none"
          />
        )}

        {/* Erro de câmera */}
        {cameraStatus === 'error' && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-xl bg-red-950/85 border border-red-500/50 text-xs text-red-200 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span>{cameraErrorMsg || 'Não foi possível acessar a câmera.'}</span>
          </div>
        )}

        {/* Overlay de Pré-carregamento dos Frames */}
        {isFramesLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md">
            <div className="text-cyan-400 text-sm font-semibold mb-2 flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
              <span>Carregando experiência...</span>
            </div>
            <div className="w-56 h-2 bg-gray-800 rounded-full overflow-hidden border border-white/20">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-100"
                style={{ width: `${framesLoadingProgress}%` }}
              ></div>
            </div>
            <span className="text-[11px] text-gray-400 mt-2 font-mono">
              {framesLoadingProgress}%
            </span>
          </div>
        )}

        {/* Renderizador de Vídeo Próprio */}
        {selectedExperience.type === 'video' && (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 relative">
            {customVideoUrl ? (
              <video
                ref={userVideoRef}
                src={customVideoUrl}
                playsInline
                muted
                onLoadedMetadata={(e) => {
                  const target = e.currentTarget;
                  setVideoDuration(target.duration);
                  setIsVideoLoaded(true);
                }}
                className="max-h-full max-w-full object-contain rounded-xl shadow-2xl border border-white/10"
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-8 bg-black/50 border border-dashed border-cyan-500/40 rounded-2xl max-w-md text-center">
                <Upload className="w-12 h-12 text-cyan-400 mb-3 animate-bounce" />
                <h3 className="text-base font-bold text-white mb-1">Carregue seu próprio vídeo</h3>
                <p className="text-xs text-gray-400 mb-4">
                  Controle a reprodução em tempo real abrindo e fechando os dedos polegar e indicador.
                </p>
                <label className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-xs font-bold cursor-pointer hover:shadow-lg hover:shadow-cyan-500/25 transition-all">
                  Selecionar Arquivo (.mp4, .webm)
                  <input
                    type="file"
                    accept="video/mp4,video/webm"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            )}
          </div>
        )}

        {/* PIP WEBCAM FLUTUANTE COM RASTREAMENTO */}
        <div
          className={`absolute top-4 right-4 z-20 w-52 sm:w-64 rounded-xl overflow-hidden border border-cyan-500/30 bg-black/80 shadow-2xl backdrop-blur-md transition-all ${
            showPipWebcam ? 'block' : 'hidden'
          }`}
        >
          <div
            className="relative bg-gray-950 flex items-center justify-center overflow-hidden"
            style={{ aspectRatio: cameraAspect }}
          >
            {/* Video nativo da Webcam em tempo real */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: isMirror ? 'scaleX(-1)' : 'none' }}
            />

            {/* Canvas de sobreposição para esqueleto da mão e gestos */}
            <canvas
              ref={pipCanvasRef}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              style={{ transform: isMirror ? 'scaleX(-1)' : 'none' }}
            />

            {/* Status do Gesto no PIP */}
            <div className="absolute top-2 left-2 flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-black/80 backdrop-blur-sm border border-white/10 text-[10px] pointer-events-none z-10 max-w-[85%]">
              {gestureData.handDetected ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                  <span className="text-green-300 font-semibold">Controlando ({framesProcessedCount}f)</span>
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

            {/* Aviso visual instrutivo quando a mão não está detectada */}
            {!gestureData.handDetected && !mediaPipeError && (
              <div className="absolute inset-x-2 bottom-8 py-1 px-2 rounded-lg bg-black/90 backdrop-blur-md border border-cyan-500/50 text-[10px] text-center text-cyan-200 pointer-events-none shadow-xl animate-pulse z-10">
                ✋ Mostre a palma aberta virada para a câmera
              </div>
            )}

            {/* Distância da Pinça em tempo real */}
            <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 font-mono text-[10px] text-cyan-300 border border-cyan-500/20 pointer-events-none z-10">
              Pinça: {(timelineProgress * 100).toFixed(0)}%
            </div>
          </div>
        </div>

        {/* MODAL / OVERLAY CALIBRADOR E HUD DE DEPURAÇÃO */}
        {showDebugHud && (
          <div className="absolute top-4 left-4 z-20 w-80 bg-black/85 backdrop-blur-xl border border-amber-500/40 rounded-2xl p-4 shadow-2xl text-xs space-y-3 font-mono animate-fade-in">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center space-x-2 text-amber-300 font-bold">
                <Activity className="w-4 h-4" />
                <span>Métricas de Gesto (HUD)</span>
              </div>
              <button
                onClick={() => setShowDebugHud(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Leituras Numéricas */}
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="bg-white/5 p-2 rounded-lg">
                <div className="text-gray-400 text-[9px] uppercase">Rastreamento</div>
                <div className={gestureData.handDetected ? 'text-green-400 font-bold' : 'text-amber-400 font-bold'}>
                  {gestureData.handDetected ? 'Mão Detectada' : 'Sem Mão (Frame 0)'}
                </div>
              </div>

              <div className="bg-white/5 p-2 rounded-lg">
                <div className="text-gray-400 text-[9px] uppercase">Timeline (0..1)</div>
                <div className="text-cyan-300 font-bold">{timelineProgress.toFixed(3)}</div>
              </div>

              <div className="bg-white/5 p-2 rounded-lg">
                <div className="text-gray-400 text-[9px] uppercase">Dist. Pinça Bruta</div>
                <div className="text-gray-200">{gestureData.rawPinchDistance.toFixed(3)}</div>
              </div>

              <div className="bg-white/5 p-2 rounded-lg">
                <div className="text-gray-400 text-[9px] uppercase">Pinça Normalizada</div>
                <div className="text-purple-300">{gestureData.normalizedPinch.toFixed(3)}</div>
              </div>
            </div>

            {/* Sliders de Sensibilidade */}
            <div className="space-y-2 pt-1 border-t border-white/10 font-sans text-xs">
              <div className="text-gray-300 font-semibold flex items-center justify-between">
                <span>Suavização (Alpha):</span>
                <span className="text-amber-300 font-mono">{sensitivityConfig.smoothingAlpha.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.80"
                step="0.01"
                value={sensitivityConfig.smoothingAlpha}
                onChange={(e) =>
                  setSensitivityConfig({ ...sensitivityConfig, smoothingAlpha: parseFloat(e.target.value) })
                }
                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-400"
              />

              <div className="text-gray-300 font-semibold flex items-center justify-between pt-1">
                <span>Deadzone (Anti-tremor):</span>
                <span className="text-amber-300 font-mono">{sensitivityConfig.deadzone.toFixed(3)}</span>
              </div>
              <input
                type="range"
                min="0.001"
                max="0.030"
                step="0.001"
                value={sensitivityConfig.deadzone}
                onChange={(e) =>
                  setSensitivityConfig({ ...sensitivityConfig, deadzone: parseFloat(e.target.value) })
                }
                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-400"
              />

              <button
                onClick={() => setSensitivityConfig(DEFAULT_GESTURE_CONFIG)}
                className="w-full mt-2 py-1 bg-white/10 hover:bg-white/20 rounded text-[11px] text-gray-300 transition-colors"
              >
                Restaurar Padrões de Fábrica
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. BARRA DE LINHA DO TEMPO & SELETOR DE EXPERIÊNCIAS (RODAPÉ FIXO) */}
      <footer className="h-28 min-h-[112px] bg-black/70 backdrop-blur-xl border-t border-[var(--border)]/30 px-4 sm:px-6 py-2.5 flex flex-col justify-between z-20 flex-shrink-0">
        {/* Régua da Linha do Tempo e Medidor Visual */}
        <div className="w-full max-w-4xl mx-auto space-y-1.5">
          <div className="flex items-center justify-between text-xs text-gray-300">
            <span className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
              <span className="font-semibold text-white">{selectedExperience.startLabel}</span>
            </span>

            {/* Badge Central com Porcentagem e Feedback de Gesto */}
            <div className="flex items-center space-x-2 bg-white/10 px-3 py-1 rounded-full border border-white/15">
              <span className="text-sm font-black tracking-wider text-cyan-300 font-mono">
                {(timelineProgress * 100).toFixed(1)}%
              </span>
              {selectedExperience.audioUrl && (
                <span className="flex items-center space-x-1 text-[11px] font-mono text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30">
                  <span>{timelineProgress > 0.05 ? '🔊' : '🔈'}</span>
                  <span>Vol: {(timelineProgress * 100).toFixed(0)}%</span>
                </span>
              )}
              <span className="text-[11px] text-gray-300 hidden sm:inline">
                {gestureData.handDetected ? '• Dedos Controlando' : '• Aguardando Mão'}
              </span>
            </div>

            <span className="flex items-center space-x-1.5">
              <span className="font-semibold text-white">{selectedExperience.endLabel}</span>
              <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
            </span>
          </div>

          {/* Barra de Progresso Interativa com Indicador Luminescente */}
          <div className="relative w-full h-3.5 bg-gray-900 rounded-full overflow-hidden border border-white/20 shadow-inner">
            {/* Gradiente de preenchimento */}
            <div
              className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 rounded-full transition-all duration-75"
              style={{ width: `${Math.min(100, Math.max(0, timelineProgress * 100))}%` }}
            />

            {/* Cabeça da Agulha Luminosa */}
            <div
              className="absolute top-0 bottom-0 w-2.5 bg-white rounded-full shadow-[0_0_12px_#38bdf8] -ml-1 pointer-events-none"
              style={{ left: `${Math.min(100, Math.max(0, timelineProgress * 100))}%` }}
            />
          </div>
        </div>

        {/* Galeria de Experiências Temporais */}
        <div className="flex items-center justify-center space-x-2 sm:space-x-3 overflow-x-auto custom-scrollbar py-1">
          {TIME_EXPERIENCES.map((exp) => {
            const isSelected = selectedExperience.id === exp.id;
            return (
              <button
                key={exp.id}
                onClick={() => setSelectedExperience(exp)}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                  isSelected
                    ? 'bg-gradient-to-r from-cyan-500/30 to-blue-600/30 border-cyan-400 text-white shadow-lg shadow-cyan-500/20 scale-105'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <span className="text-sm">{exp.icon}</span>
                <span>{exp.title}</span>
              </button>
            );
          })}
        </div>
      </footer>
    </div>
  );
};

export default ControlTimeApp;
