// src/components/AirHarpApp.tsx
//
// Modo "Harpa de Luz": estique cordas de luz no ar com a pinça e toque-as com os dedos.
// O comprimento de cada corda define a nota (corda curta = aguda), ajustada à escala escolhida.

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { pickStartupCamera, rememberManualCamera } from '../utils/camera';
import { Hands, Results } from '@mediapipe/hands';
import {
  ArrowLeft, FlipHorizontal, Sliders, HelpCircle, Music, Undo2, Trash2, Sparkles,
  Circle, Square, Volume2, VolumeX, AlertCircle, Hand, Grab, Eraser, X,
} from 'lucide-react';
import { RESOLUTION_PRESETS } from './HandDrawingApp';
import { HarpAudio, TIMBRES, TimbreId } from '../utils/harp/harpAudio';
import { HarpController, HarpGesture, PluckFingers } from '../utils/harp/harpController';
import { drawString, drawDraft, drawSparks, ViewTransform, Vec2 } from '../utils/harp/harpStrings';
import { SCALES, ScaleId, NOTE_NAMES, getScale, noteName, noteHue } from '../utils/harp/harpMusic';

type ThemeColor = 'purple' | 'blue' | 'green' | 'pink';

interface AirHarpAppProps {
  onBackToHub: () => void;
  themeColor: ThemeColor;
  setThemeColor: React.Dispatch<React.SetStateAction<ThemeColor>>;
}

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

const THEME_HEX: Record<ThemeColor, string> = {
  purple: '#8B5CF6',
  blue: '#3B82F6',
  green: '#22C55E',
  pink: '#EC4899',
};

const GESTURE_LABEL: Record<HarpGesture, string> = {
  none: 'Mostre as mãos para a câmera',
  play: 'Passe o dedo pelas cordas para tocar',
  draft: 'Esticando corda · solte a pinça para fixar',
  erase: 'Punho fechado sobre a corda · apagando',
};

const LS_KEY = 'mannavision_harp_settings';

interface HarpSettings {
  scale: ScaleId;
  root: number;
  timbre: TimbreId;
  volume: number;
  reverb: number;
  preview: boolean;
  fingers: PluckFingers;
  showSkeleton: boolean;
  camBrightness: number;
}

const DEFAULT_SETTINGS: HarpSettings = {
  scale: 'pentatonic',
  root: 0,
  timbre: 'harpa',
  volume: 0.8,
  reverb: 0.35,
  preview: true,
  fingers: 'all',
  showSkeleton: true,
  camBrightness: 0.7,
};

function loadSettings(): HarpSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignora */ }
  return DEFAULT_SETTINGS;
}

const AirHarpApp: React.FC<AirHarpAppProps> = ({ onBackToHub, themeColor }) => {
  // --- REFS ---
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const handsRef = useRef<Hands | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const cameraGenRef = useRef(0);
  const audioRef = useRef<HarpAudio | null>(null);
  const controllerRef = useRef<HarpController | null>(null);
  const viewRef = useRef<ViewTransform & { aspect: number; dpr: number }>({ k: 1, offX: 0, offY: 0, aspect: 16 / 9, dpr: 1 });
  const handsDrawRef = useRef<{ pts: Vec2[]; pinched: boolean }[]>([]);
  const isMirrorRef = useRef(true);
  const settingsRef = useRef<HarpSettings>(loadSettings());
  const themeRef = useRef<ThemeColor>(themeColor);
  const lastPreviewRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const hudRef = useRef({ strings: 0, gesture: 'none' as HarpGesture, hands: 0, draftNote: '' });

  // --- STATE (HUD) ---
  const [settings, setSettings] = useState<HarpSettings>(settingsRef.current);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>(() => localStorage.getItem('mannavision_camera_id') || '');
  const [selectedResId, setSelectedResId] = useState<string>(() => localStorage.getItem('mannavision_resolution') || '1280x720');
  const [cameraStatus, setCameraStatus] = useState<'starting' | 'active' | 'error'>('starting');
  const [cameraErrorMsg, setCameraErrorMsg] = useState<string | null>(null);
  const [isMirror, setIsMirror] = useState(true);
  const [audioReady, setAudioReady] = useState(false);
  const [stringCount, setStringCount] = useState(0);
  const [gesture, setGesture] = useState<HarpGesture>('none');
  const [handsCount, setHandsCount] = useState(0);
  const [draftNote, setDraftNote] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaPipeError, setMediaPipeError] = useState<string | null>(null);

  useEffect(() => { isMirrorRef.current = isMirror; }, [isMirror]);
  useEffect(() => { themeRef.current = themeColor; }, [themeColor]);

  // --- ÁUDIO + CONTROLADOR ---
  useEffect(() => {
    const audio = new HarpAudio();
    audioRef.current = audio;
    const s = settingsRef.current;
    audio.setTimbre(s.timbre);
    audio.setVolume(s.volume);
    audio.setReverb(s.reverb);

    const controller = new HarpController({
      onPluck: (str, position, velocity) => {
        const v = viewRef.current;
        const pan = (((str.a.x + str.b.x) / 2) / v.aspect) * 2 - 1;
        audioRef.current?.pluck(str.midi, { velocity, position, pan });
      },
      onCreate: () => {},
      onRemove: () => {},
      onDraftNote: (midi) => {
        if (!settingsRef.current.preview) return;
        const now = performance.now();
        if (now - lastPreviewRef.current < 60) return;
        lastPreviewRef.current = now;
        audioRef.current?.pluck(midi, { velocity: 0.22, position: 0.5, pan: 0 });
      },
    });
    controller.pluckFingers = s.fingers;
    controller.setTuning(s.root, getScale(s.scale));
    controllerRef.current = controller;

    // O clique no Hub já conta como interação: tenta ativar o som direto
    audio.resume().then(() => setAudioReady(audio.state === 'running'));

    return () => {
      controllerRef.current = null;
      audioRef.current = null;
      audio.dispose();
    };
  }, []);

  const ensureAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.state !== 'running') {
      audio.resume().then(() => setAudioReady(audio.state === 'running'));
    }
  }, []);

  // --- APLICAR AJUSTES ---
  const updateSettings = useCallback((partial: Partial<HarpSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      settingsRef.current = next;
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ok */ }
      const audio = audioRef.current;
      const ctl = controllerRef.current;
      if (audio) {
        if (partial.timbre) audio.setTimbre(next.timbre);
        if (partial.volume !== undefined) audio.setVolume(next.volume);
        if (partial.reverb !== undefined) audio.setReverb(next.reverb);
      }
      if (ctl) {
        if (partial.fingers) ctl.pluckFingers = next.fingers;
        if (partial.scale !== undefined || partial.root !== undefined) ctl.setTuning(next.root, getScale(next.scale));
      }
      return next;
    });
  }, []);

  // --- HUD: atualiza o React só quando algo muda ---
  const syncHud = useCallback(() => {
    const ctl = controllerRef.current;
    if (!ctl) return;
    const hud = hudRef.current;
    const n = ctl.activeStrings().length;
    if (n !== hud.strings) { hud.strings = n; setStringCount(n); }
    if (ctl.gesture !== hud.gesture) { hud.gesture = ctl.gesture; setGesture(ctl.gesture); }
    const dn = ctl.draft && ctl.draft.midi >= 0 ? noteName(ctl.draft.midi) : '';
    if (dn !== hud.draftNote) { hud.draftNote = dn; setDraftNote(dn); }
  }, []);

  // --- RESULTADOS DO MEDIAPIPE ---
  const onResults = useCallback((results: Results) => {
    setMediaPipeError(null);
    const ctl = controllerRef.current;
    if (!ctl) return;
    const now = performance.now();
    const aspect = viewRef.current.aspect;
    const mirror = isMirrorRef.current;
    const all = results.multiHandLandmarks || [];
    const usedKeys = new Set<string>();
    const list: { key: string; pts: Vec2[] }[] = [];
    all.forEach((lm, i) => {
      if (!lm || lm.length < 21) return;
      let key: string = results.multiHandedness?.[i]?.label || `H${i}`;
      if (usedKeys.has(key)) key = `${key}${i}`;
      usedKeys.add(key);
      const pts = lm.map((p) => ({ x: (mirror ? 1 - p.x : p.x) * aspect, y: p.y }));
      list.push({ key, pts });
    });
    ctl.processHands(list, now);
    handsDrawRef.current = list.map((h) => ({
      pts: h.pts,
      pinched: Math.hypot(h.pts[4].x - h.pts[8].x, h.pts[4].y - h.pts[8].y)
        / Math.max(0.01, Math.hypot(h.pts[0].x - h.pts[9].x, h.pts[0].y - h.pts[9].y)) < 0.45,
    }));
    if (list.length !== hudRef.current.hands) { hudRef.current.hands = list.length; setHandsCount(list.length); }
    syncHud();
  }, [syncHud]);

  // --- MODELO MEDIAPIPE HANDS ---
  useEffect(() => {
    (window as unknown as { Module?: unknown }).Module = undefined;
    const hands = new Hands({ locateFile: (file) => `/mediapipe/hands/${file}` });
    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.55,
      minTrackingConfidence: 0.5,
    });
    hands.onResults(onResults);
    handsRef.current = hands;
    return () => {
      try { hands.close(); } catch (e) { console.warn('Erro ao fechar hands:', e); }
      handsRef.current = null;
      (window as unknown as { Module?: unknown }).Module = undefined;
    };
  }, [onResults]);

  // --- CÂMERA ---
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

  const startCamera = useCallback(async (deviceIdToUse?: string, resIdToUse?: string) => {
    const preset = RESOLUTION_PRESETS.find((p) => p.id === (resIdToUse || selectedResId)) || RESOLUTION_PRESETS[2];
    const gen = ++cameraGenRef.current;
    const isStale = () => gen !== cameraGenRef.current;

    if (animFrameIdRef.current) { cancelAnimationFrame(animFrameIdRef.current); animFrameIdRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

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
        if (!deviceIdToUse) throw err;
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: preset.width }, height: { ideal: preset.height } }, audio: false });
      }
      if (isStale()) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      const devs = await enumerateCameras();
      if (isStale()) return;
      const settingsCam = stream.getVideoTracks()[0]?.getSettings();
      const devId = settingsCam?.deviceId || deviceIdToUse || devs[0]?.deviceId || '';
      if (devId) {
        setSelectedCameraId(devId);
        localStorage.setItem('mannavision_camera_id', devId);
      }

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      try { await video.play(); } catch (e) { console.warn('Play video:', e); }
      if (isStale()) return;

      let busy = false;
      let last = 0;
      const loop = async () => {
        if (isStale()) return;
        const v = videoRef.current;
        const now = performance.now();
        if (v && !v.paused && v.readyState >= 2 && v.videoWidth > 0 && !busy && now - last >= 25) {
          last = now;
          busy = true;
          try {
            await handsRef.current?.send({ image: v });
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('Erro no MediaPipe:', msg);
            setMediaPipeError(msg);
          } finally {
            busy = false;
          }
        }
        animFrameIdRef.current = requestAnimationFrame(loop);
      };
      animFrameIdRef.current = requestAnimationFrame(loop);
      setCameraStatus('active');
    } catch (err: unknown) {
      console.error('Erro ao acessar webcam:', err);
      setCameraStatus('error');
      setCameraErrorMsg(err instanceof Error ? err.message : 'Não foi possível acessar a câmera.');
    }
  }, [selectedResId, enumerateCameras]);

  useEffect(() => {
    const genRef = cameraGenRef;
    const savedResId = localStorage.getItem('mannavision_resolution') || undefined;
    let cancelled = false;
    // Padrão: câmera externa; outra só se escolhida manualmente no seletor
    pickStartupCamera().then((deviceId) => {
      if (!cancelled) startCamera(deviceId, savedResId);
    });
    return () => {
      cancelled = true;
      genRef.current++;
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [startCamera]);

  // --- LAÇO DE DESENHO (60 fps, independente do rastreamento) ---
  useEffect(() => {
    let raf = 0;
    let lastT = performance.now();
    const render = () => {
      raf = requestAnimationFrame(render);
      const canvas = canvasRef.current;
      const stage = stageRef.current;
      const ctl = controllerRef.current;
      if (!canvas || !stage || !ctl) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const now = performance.now();
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;

      // Tamanho do canvas = tamanho do palco × densidade de pixels
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.max(1, Math.round(stage.clientWidth * dpr));
      const H = Math.max(1, Math.round(stage.clientHeight * dpr));
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }

      // Transformação "cover": a imagem da câmera preenche o palco sem distorcer
      const video = videoRef.current;
      const hasVideo = !!video && video.readyState >= 2 && video.videoWidth > 0;
      const vw = hasVideo ? video!.videoWidth : 1280;
      const vh = hasVideo ? video!.videoHeight : 720;
      const scale = Math.max(W / vw, H / vh);
      const view = viewRef.current;
      view.aspect = vw / vh;
      view.k = vh * scale;
      view.offX = (W - vw * scale) / 2;
      view.offY = (H - vh * scale) / 2;
      view.dpr = dpr;

      ctl.update(dt, now);

      // Fundo: câmera escurecida
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      if (hasVideo) {
        ctx.save();
        ctx.globalAlpha = settingsRef.current.camBrightness;
        if (isMirrorRef.current) {
          ctx.translate(W, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video!, view.offX, view.offY, vw * scale, vh * scale);
        ctx.restore();
      } else {
        const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
        g.addColorStop(0, '#0d1030');
        g.addColorStop(1, '#000');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      // Cordas, corda em construção e faíscas
      for (const s of ctl.strings) drawString(ctx, s, view, now, dpr);
      const d = ctl.draft;
      if (d) {
        const label = d.midi >= 0 ? noteName(d.midi) : '…';
        drawDraft(ctx, d.a, d.b, d.midi >= 0 ? noteHue(d.midi) : 0, label, view, dpr, now);
      }
      drawSparks(ctx, ctl.sparks, view, dpr);

      // Esqueleto das mãos
      if (settingsRef.current.showSkeleton) {
        const tint = THEME_HEX[themeRef.current];
        for (const h of handsDrawRef.current) {
          const P = h.pts.map((p) => ({ x: p.x * view.k + view.offX, y: p.y * view.k + view.offY }));
          ctx.save();
          ctx.strokeStyle = tint;
          ctx.globalAlpha = 0.75;
          ctx.lineWidth = 2 * dpr;
          ctx.beginPath();
          for (const [i, j] of HAND_CONNECTIONS) { ctx.moveTo(P[i].x, P[i].y); ctx.lineTo(P[j].x, P[j].y); }
          ctx.stroke();
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = '#fff';
          for (const p of P) { ctx.beginPath(); ctx.arc(p.x, p.y, 2.4 * dpr, 0, Math.PI * 2); ctx.fill(); }
          // Pontas que tocam
          for (const tip of [8, 12, 16, 20]) {
            ctx.beginPath();
            ctx.arc(P[tip].x, P[tip].y, 4.5 * dpr, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            ctx.lineWidth = 1.2 * dpr;
            ctx.stroke();
          }
          if (h.pinched) {
            const mx = (P[4].x + P[8].x) / 2;
            const my = (P[4].y + P[8].y) / 2;
            ctx.beginPath();
            ctx.arc(mx, my, 9 * dpr, 0, Math.PI * 2);
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 2.5 * dpr;
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      // Anel de progresso do punho (apagar)
      for (const e of ctl.erase) {
        const x = e.palm.x * view.k + view.offX;
        const y = e.palm.y * view.k + view.offY;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, 26 * dpr, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 3 * dpr;
        ctx.stroke();
        if (e.progress > 0) {
          ctx.beginPath();
          ctx.arc(x, y, 26 * dpr, -Math.PI / 2, -Math.PI / 2 + e.progress * Math.PI * 2);
          ctx.strokeStyle = '#f87171';
          ctx.lineWidth = 4 * dpr;
          ctx.stroke();
        }
        ctx.restore();
      }
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, []);

  // --- MOUSE (sem câmera): arrastar cria corda, passar por cima toca, botão direito apaga ---
  const toWorld = (e: React.PointerEvent | React.MouseEvent): Vec2 => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const v = viewRef.current;
    const px = (e.clientX - rect.left) * v.dpr;
    const py = (e.clientY - rect.top) * v.dpr;
    return { x: (px - v.offX) / v.k, y: (py - v.offY) / v.k };
  };
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    ensureAudio();
    if (e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    controllerRef.current?.mouseDown(toWorld(e));
    syncHud();
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    controllerRef.current?.mouseMove(toWorld(e), performance.now());
  };
  const onPointerUp = () => {
    controllerRef.current?.mouseUp(performance.now());
    syncHud();
  };
  const onPointerLeave = () => {
    controllerRef.current?.mouseLeave();
    syncHud();
  };
  const onContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    controllerRef.current?.removeNear(toWorld(e), performance.now());
    syncHud();
  };

  // --- AÇÕES ---
  const undo = useCallback(() => { controllerRef.current?.undo(performance.now()); syncHud(); }, [syncHud]);
  const clearAll = useCallback(() => { controllerRef.current?.clear(performance.now()); syncHud(); }, [syncHud]);
  const presetHarp = useCallback(() => {
    ensureAudio();
    const ctl = controllerRef.current;
    if (!ctl) return;
    ctl.clear(performance.now());
    ctl.addPresetHarp(viewRef.current.aspect, performance.now());
    syncHud();
  }, [ensureAudio, syncHud]);

  // Glissando de teste: toca todas as cordas em sequência
  const strumAll = useCallback(() => {
    ensureAudio();
    const ctl = controllerRef.current;
    if (!ctl) return;
    const live = [...ctl.activeStrings()].sort((a, b) => b.midi - a.midi);
    live.forEach((s, i) => {
      setTimeout(() => controllerRef.current?.pluck(s, 0.5, 0.6, performance.now()), i * 70);
    });
  }, [ensureAudio]);

  // --- TECLADO ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); undo(); return; }
      if (e.code === 'KeyZ') undo();
      if (e.code === 'KeyC' || e.code === 'Delete') clearAll();
      if (e.code === 'KeyH') presetHarp();
      if (e.code === 'Space') { e.preventDefault(); strumAll(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, clearAll, presetHarp, strumAll]);

  // --- GRAVAÇÃO (vídeo do palco + som) ---
  const toggleRecording = () => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas) return;
    if (isRecording) { recorderRef.current?.stop(); return; }
    if (typeof MediaRecorder === 'undefined' || !('captureStream' in canvas)) {
      alert('Gravação não suportada neste navegador.');
      return;
    }
    ensureAudio();
    try {
      const videoStream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);
      const tracks = [...videoStream.getVideoTracks()];
      if (audio) tracks.push(...audio.getRecordStream().getAudioTracks());
      const stream = new MediaStream(tracks);
      const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 10_000_000 } : undefined);
      recordChunksRef.current = [];
      rec.ondataavailable = (ev) => { if (ev.data.size > 0) recordChunksRef.current.push(ev.data); };
      rec.onstop = () => {
        const blob = new Blob(recordChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `harpa-de-luz-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        videoStream.getTracks().forEach((t) => t.stop());
        recorderRef.current = null;
        setIsRecording(false);
      };
      rec.start(250);
      recorderRef.current = rec;
      setIsRecording(true);
    } catch (err) {
      console.error('Erro ao gravar:', err);
      alert('Não foi possível iniciar a gravação.');
    }
  };

  useEffect(() => () => { recorderRef.current?.stop(); }, []);

  const handleCameraChange = (id: string) => {
    setSelectedCameraId(id);
    rememberManualCamera(id);
    startCamera(id, selectedResId);
  };
  const handleResolutionChange = (id: string) => {
    setSelectedResId(id);
    localStorage.setItem('mannavision_resolution', id);
    startCamera(selectedCameraId, id);
  };

  const gestureIcon = gesture === 'draft' ? <Grab className="w-4 h-4" /> : gesture === 'erase' ? <Eraser className="w-4 h-4" /> : <Hand className="w-4 h-4" />;
  const scaleLabel = `${NOTE_NAMES[settings.root]} ${getScale(settings.scale).label}`;

  return (
    <div className="h-screen w-screen max-h-screen overflow-hidden flex flex-col bg-black text-white select-none" onPointerDown={ensureAudio}>
      <video ref={videoRef} muted playsInline className="hidden" />

      {/* HEADER */}
      <header className="h-12 min-h-[48px] bg-black/50 backdrop-blur-md border-b border-[var(--border)]/20 px-4 flex items-center justify-between z-30 flex-shrink-0">
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
            <Music className="w-3.5 h-3.5 text-[var(--light)]" />
            <span className="text-xs font-semibold text-[var(--text)]">Harpa de Luz</span>
            <span className="text-[10px] text-gray-400">• {stringCount} {stringCount === 1 ? 'corda' : 'cordas'} · {scaleLabel}</span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <select
            value={settings.timbre}
            onChange={(e) => updateSettings({ timbre: e.target.value as TimbreId })}
            className="bg-black/60 border border-[var(--border)]/40 rounded-lg px-2 py-1 text-xs text-white focus:outline-none cursor-pointer"
            title="Timbre"
          >
            {TIMBRES.map((t) => <option key={t.id} value={t.id} className="bg-gray-900">{t.label}</option>)}
          </select>

          <button
            onClick={toggleRecording}
            className={`p-1.5 rounded-lg text-xs flex items-center space-x-1 transition-colors border ${
              isRecording ? 'bg-red-500/25 border-red-500/60 text-red-300 animate-pulse' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
            }`}
            title={isRecording ? 'Parar e baixar a gravação' : 'Gravar vídeo com som'}
          >
            {isRecording ? <Square className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
            <span className="hidden lg:inline text-[11px]">{isRecording ? 'Parar' : 'Gravar'}</span>
          </button>

          <button
            onClick={() => { setShowSettings(!showSettings); setShowHelp(false); }}
            className={`p-1.5 rounded-lg text-xs flex items-center space-x-1 transition-colors border ${
              showSettings ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
            }`}
            title="Escala, som e câmera"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden lg:inline text-[11px]">Ajustes</span>
          </button>

          <button
            onClick={() => { setShowHelp(!showHelp); setShowSettings(false); }}
            className={`p-1.5 rounded-lg text-xs transition-colors border ${
              showHelp ? 'bg-sky-500/20 border-sky-500/40 text-sky-300' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
            }`}
            title="Como tocar"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setIsMirror(!isMirror)}
            className={`p-1.5 rounded-lg transition-colors ${isMirror ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-gray-400'}`}
            title={isMirror ? 'Espelhamento ativado' : 'Espelhamento desativado'}
          >
            <FlipHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* PALCO */}
      <div ref={stageRef} className="relative flex-1 min-h-0 w-full overflow-hidden bg-black">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerLeave}
          onContextMenu={onContextMenu}
        />

        {/* Som bloqueado pelo navegador */}
        {!audioReady && (
          <button
            onClick={ensureAudio}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-full bg-amber-500/90 hover:bg-amber-400 text-black text-xs font-bold flex items-center space-x-2 shadow-lg"
          >
            <VolumeX className="w-4 h-4" />
            <span>Clique para ativar o som</span>
          </button>
        )}

        {cameraStatus === 'error' && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-xl bg-red-950/85 border border-red-500/50 text-xs text-red-200 flex items-center space-x-2 max-w-[90%]">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{cameraErrorMsg || 'Não foi possível acessar a câmera.'} Use o mouse: arraste para criar cordas e passe o cursor por elas para tocar.</span>
          </div>
        )}
        {mediaPipeError && (
          <div className="absolute top-28 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-xl bg-red-950/85 border border-red-500/50 text-[11px] text-red-200 max-w-[90%] truncate">
            MediaPipe: {mediaPipeError}
          </div>
        )}

        {/* Nota da corda em construção */}
        {draftNote && (
          <div className="absolute top-6 right-6 z-10 px-4 py-2 rounded-2xl bg-black/60 backdrop-blur-md border border-[var(--border)]/50 text-center pointer-events-none">
            <div className="text-[10px] text-gray-400 uppercase tracking-wider">Nota</div>
            <div className="text-2xl font-bold text-white">{draftNote}</div>
          </div>
        )}

        {/* Indicador do gesto */}
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 px-4 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-[var(--border)]/40 text-xs text-[var(--text)] pointer-events-none flex items-center space-x-2 whitespace-nowrap">
          {gestureIcon}
          <span>{cameraStatus === 'active' ? GESTURE_LABEL[gesture] : 'Modo mouse: arraste para criar, passe por cima para tocar'}</span>
          {cameraStatus === 'active' && <span className="text-gray-500">· {handsCount} {handsCount === 1 ? 'mão' : 'mãos'}</span>}
        </div>

        {/* Barra inferior */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center space-x-2 bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl px-2 py-1.5">
          <button onClick={presetHarp} className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[var(--main)]/30 hover:bg-[var(--main)]/50 border border-[var(--border)]/50 flex items-center space-x-1.5" title="Monta 8 cordas na escala atual (tecla H)">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Harpa pronta</span>
          </button>
          <button onClick={strumAll} disabled={stringCount === 0} className="px-3 py-1.5 rounded-xl text-xs bg-white/5 hover:bg-white/15 border border-white/10 flex items-center space-x-1.5 disabled:opacity-40" title="Toca todas as cordas (Espaço)">
            <Volume2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Glissando</span>
          </button>
          <button onClick={undo} disabled={stringCount === 0} className="px-3 py-1.5 rounded-xl text-xs bg-white/5 hover:bg-white/15 border border-white/10 flex items-center space-x-1.5 disabled:opacity-40" title="Apaga a última corda (Z)">
            <Undo2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Desfazer</span>
          </button>
          <button onClick={clearAll} disabled={stringCount === 0} className="px-3 py-1.5 rounded-xl text-xs bg-white/5 hover:bg-red-500/30 border border-white/10 flex items-center space-x-1.5 disabled:opacity-40" title="Apaga todas as cordas (C)">
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Limpar</span>
          </button>
        </div>

        {/* AJUDA */}
        {showHelp && (
          <div className="absolute top-4 left-4 z-20 w-80 max-w-[calc(100%-2rem)] bg-black/75 backdrop-blur-md border border-[var(--border)]/40 rounded-2xl p-4 text-xs text-gray-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-[var(--light)] flex items-center space-x-1.5"><Music className="w-4 h-4" /><span>Como tocar a Harpa de Luz</span></h3>
              <button onClick={() => setShowHelp(false)} className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <p><b className="text-white">🤏🤏 Criar corda:</b> faça a pinça com as duas mãos e afaste-as. Solte para fixar a corda no ar.</p>
            <p><b className="text-white">🤏 Com uma mão:</b> feche a pinça, arraste e solte.</p>
            <p><b className="text-white">📏 Nota:</b> corda curta = aguda, corda longa = grave. As notas se ajustam à escala escolhida.</p>
            <p><b className="text-white">☝️ Tocar:</b> passe a ponta do dedo através da corda. Quanto mais rápido, mais forte.</p>
            <p><b className="text-white">🖐️ Varrer:</b> passe a mão aberta por várias cordas para um arpejo.</p>
            <p><b className="text-white">✊ Apagar:</b> feche o punho sobre a corda e segure até o anel completar.</p>
            <p className="text-gray-400 border-t border-white/10 pt-2">Mouse: arraste para criar, passe por cima para tocar, botão direito apaga. Teclas: <b>H</b> harpa pronta, <b>Espaço</b> glissando, <b>Z</b> desfazer, <b>C</b> limpar.</p>
          </div>
        )}

        {/* AJUSTES */}
        {showSettings && (
          <div className="absolute top-4 right-4 z-20 w-80 max-w-[calc(100%-2rem)] max-h-[calc(100%-6rem)] overflow-y-auto bg-black/80 backdrop-blur-md border border-[var(--border)]/40 rounded-2xl p-4 text-xs text-gray-200 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-amber-300">Ajustes da Harpa</h3>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-gray-400">Tônica</span>
                <select value={settings.root} onChange={(e) => updateSettings({ root: Number(e.target.value) })} className="w-full bg-black/60 border border-white/15 rounded-lg px-2 py-1">
                  {NOTE_NAMES.map((n, i) => <option key={n} value={i} className="bg-gray-900">{n}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-gray-400">Escala</span>
                <select value={settings.scale} onChange={(e) => updateSettings({ scale: e.target.value as ScaleId })} className="w-full bg-black/60 border border-white/15 rounded-lg px-2 py-1">
                  {SCALES.map((s) => <option key={s.id} value={s.id} className="bg-gray-900">{s.label}</option>)}
                </select>
              </label>
            </div>

            <label className="block space-y-1">
              <span className="text-gray-400">Volume · {Math.round(settings.volume * 100)}%</span>
              <input type="range" min={0} max={1.2} step={0.05} value={settings.volume} onChange={(e) => updateSettings({ volume: Number(e.target.value) })} className="w-full accent-[var(--main)]" />
            </label>
            <label className="block space-y-1">
              <span className="text-gray-400">Reverberação · {Math.round(settings.reverb * 100)}%</span>
              <input type="range" min={0} max={1} step={0.05} value={settings.reverb} onChange={(e) => updateSettings({ reverb: Number(e.target.value) })} className="w-full accent-[var(--main)]" />
            </label>
            <label className="block space-y-1">
              <span className="text-gray-400">Brilho da câmera · {Math.round(settings.camBrightness * 100)}%</span>
              <input type="range" min={0} max={1} step={0.05} value={settings.camBrightness} onChange={(e) => updateSettings({ camBrightness: Number(e.target.value) })} className="w-full accent-[var(--main)]" />
            </label>

            <div className="space-y-1">
              <span className="text-gray-400">Dedos que tocam</span>
              <div className="grid grid-cols-2 gap-2">
                {(['all', 'index'] as PluckFingers[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => updateSettings({ fingers: f })}
                    className={`py-1.5 rounded-lg border ${settings.fingers === f ? 'bg-[var(--main)]/30 border-[var(--border)]' : 'bg-white/5 border-white/10'}`}
                  >
                    {f === 'all' ? 'Quatro dedos' : 'Só indicador'}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center justify-between">
              <span>Prévia sonora ao esticar</span>
              <input type="checkbox" checked={settings.preview} onChange={(e) => updateSettings({ preview: e.target.checked })} className="accent-[var(--main)]" />
            </label>
            <label className="flex items-center justify-between">
              <span>Mostrar esqueleto das mãos</span>
              <input type="checkbox" checked={settings.showSkeleton} onChange={(e) => updateSettings({ showSkeleton: e.target.checked })} className="accent-[var(--main)]" />
            </label>

            <div className="border-t border-white/10 pt-3 grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-gray-400">Câmera</span>
                <select value={selectedCameraId} onChange={(e) => handleCameraChange(e.target.value)} className="w-full bg-black/60 border border-white/15 rounded-lg px-2 py-1 truncate">
                  {cameras.length === 0
                    ? <option value="">Câmera padrão</option>
                    : cameras.map((d, i) => <option key={d.deviceId || i} value={d.deviceId} className="bg-gray-900">{d.label || `Câmera ${i + 1}`}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-gray-400">Resolução</span>
                <select value={selectedResId} onChange={(e) => handleResolutionChange(e.target.value)} className="w-full bg-black/60 border border-white/15 rounded-lg px-2 py-1">
                  {RESOLUTION_PRESETS.map((p) => <option key={p.id} value={p.id} className="bg-gray-900">{p.label}</option>)}
                </select>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AirHarpApp;
