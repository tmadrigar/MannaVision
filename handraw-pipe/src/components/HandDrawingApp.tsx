// src/components/HandDrawingApp.tsx

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Camera } from '@mediapipe/camera_utils';
import { Hands, Results } from '@mediapipe/hands';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import {
  Palette, Eraser, Trash2, Download, Video, Square, Minus as MinusIcon, Plus,
  PenLine, Sparkles, SprayCan, Wand2, Camera as CameraIcon, X as XIcon, Save
} from 'lucide-react';

// Tipos
type ThemeColor = 'purple' | 'blue' | 'green' | 'pink';
type BrushStyle = 'solid' | 'glow' | 'dashed' | 'spray' | 'rainbow';

interface HandDrawingAppProps {
  themeColor: ThemeColor;
  setThemeColor: React.Dispatch<React.SetStateAction<ThemeColor>>;
}

interface Point {
  x: number;
  y: number;
}

const HandDrawingApp: React.FC<HandDrawingAppProps> = ({ themeColor, setThemeColor }) => {
  // Refs para os elementos do DOM
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);

  // Refs para MediaPipe
  const handsRef = useRef<Hands | null>(null); // Não usado na implementação atual, mas mantido
  const cameraRef = useRef<Camera | null>(null);
  const isMediaPipeInitialized = useRef(false);

  // Estados para o desenho com as mãos (TODOS ESTÃO DE VOLTA!)
  const [isDrawing, setIsDrawing] = useState(false);
  const [showWhiteBoard, setShowWhiteBoard] = useState(false);
  const [brushSize, setBrushSize] = useState(5);
  const [currentColor, setCurrentColor] = useState('#8B5CF6'); // Cor inicial padrão
  const [isEraser, setIsEraser] = useState(false);
  const [brushStyle, setBrushStyle] = useState<BrushStyle>('solid');
  const lastPointsRef = useRef<(Point | null)[]>([null, null]); // Para múltiplas mãos
  const rainbowHueRef = useRef(0); // Para o estilo "rainbow"

  // Refs para manter os valores atualizados dentro do useCallback do onResults
  const brushSizeRef = useRef(brushSize);
  const currentColorRef = useRef(currentColor);
  const isEraserRef = useRef(isEraser);
  const brushStyleRef = useRef(brushStyle);

  useEffect(() => {
    brushSizeRef.current = brushSize;
    currentColorRef.current = currentColor;
    isEraserRef.current = isEraser;
    brushStyleRef.current = brushStyle;
  }, [brushSize, currentColor, isEraser, brushStyle]);

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
    if (!drawingCtx) return;

    let anyHandIsDrawing = false;
    if (results.multiHandLandmarks) {
      results.multiHandLandmarks.forEach((landmarks, index) => {
        drawConnectors(ctx, landmarks, Hands.HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
        drawLandmarks(ctx, landmarks, { color: '#FF0000', lineWidth: 1, radius: 3 });

        const indexTip = landmarks[8];
        const thumbTip = landmarks[4];

        const distance = Math.sqrt(
          Math.pow((thumbTip.x - indexTip.x) * canvas.width, 2) +
          Math.pow((thumbTip.y - indexTip.y) * canvas.height, 2)
        );

        const currentPoint: Point = {
          x: indexTip.x * canvas.width,
          y: indexTip.y * canvas.height
        };

        if (distance < 40) { // Se os dedos estiverem juntos (desenhando)
          anyHandIsDrawing = true;
          const lastPoint = lastPointsRef.current[index];

          if (lastPoint) {
            // Configurações do pincel/borracha
            drawingCtx.globalCompositeOperation = isEraserRef.current ? 'destination-out' : 'source-over';
            drawingCtx.lineWidth = isEraserRef.current ? brushSizeRef.current * 2 : brushSizeRef.current;
            drawingCtx.strokeStyle = isEraserRef.current ? 'rgba(0,0,0,1)' : currentColorRef.current;
            drawingCtx.lineCap = 'round';
            drawingCtx.lineJoin = 'round';

            // Aplica o estilo de pincel
            switch (brushStyleRef.current) {
              case 'glow':
                drawingCtx.shadowBlur = brushSizeRef.current * 1.5;
                drawingCtx.shadowColor = currentColorRef.current;
                drawingCtx.setLineDash([]);
                break;
              case 'dashed':
                drawingCtx.shadowBlur = 0;
                drawingCtx.setLineDash([brushSizeRef.current * 2, brushSizeRef.current]);
                break;
              case 'rainbow':
                rainbowHueRef.current = (rainbowHueRef.current + 5) % 360;
                const rainbowColor = `hsl(${rainbowHueRef.current}, 100%, 50%)`;
                drawingCtx.strokeStyle = rainbowColor;
                drawingCtx.shadowBlur = brushSizeRef.current;
                drawingCtx.shadowColor = rainbowColor;
                drawingCtx.setLineDash([]);
                break;
              default: // solid
                drawingCtx.shadowBlur = 0;
                drawingCtx.setLineDash([]);
                break;
            }

            // Lógica de desenho para spray ou linha
            if (brushStyleRef.current === 'spray' && !isEraserRef.current) {
              const density = brushSizeRef.current * 4;
              for (let i = 0; i < density; i++) {
                const offsetX = (Math.random() - 0.5) * brushSizeRef.current * 4;
                const offsetY = (Math.random() - 0.5) * brushSizeRef.current * 4;
                drawingCtx.fillStyle = currentColorRef.current;
                drawingCtx.fillRect(currentPoint.x + offsetX, currentPoint.y + offsetY, 2, 2);
              }
            } else {
              drawingCtx.beginPath();
              drawingCtx.moveTo(lastPoint.x, lastPoint.y);
              drawingCtx.lineTo(currentPoint.x, currentPoint.y);
              drawingCtx.stroke();
            }
            // Reseta sombra e dash para não afetar futuros traços
            drawingCtx.shadowBlur = 0;
            drawingCtx.setLineDash([]);
          }
          lastPointsRef.current[index] = currentPoint;
        } else { // Se os dedos não estiverem juntos (não desenhando)
          lastPointsRef.current[index] = null;
        }
      });
    }

    setIsDrawing(anyHandIsDrawing);

    // Limpa pontos de mãos que não estão mais visíveis
    for (let i = results.multiHandLandmarks.length; i < lastPointsRef.current.length; i++) {
      lastPointsRef.current[i] = null;
    }
    ctx.restore();
  }, []);

  const initializeMediaPipe = useCallback(async () => {
    if (videoRef.current) {
      const hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });
      hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5
      });
      hands.onResults(onResults);
      handsRef.current = hands;

      const camera = new Camera(videoRef.current, {
        onFrame: async () => {
          if (videoRef.current) {
            await hands.send({ image: videoRef.current });
          }
        },
        width: 1280,
        height: 720,
      });
      cameraRef.current = camera;
      await camera.start();
    }
  }, [onResults]);

  useEffect(() => {
    if (!isMediaPipeInitialized.current) {
      initializeMediaPipe();
      isMediaPipeInitialized.current = true;
    }
  }, [initializeMediaPipe]);

  const clearCanvas = () => {
    const ctx = drawingCanvasRef.current?.getContext('2d');
    if (ctx && drawingCanvasRef.current) {
      ctx.clearRect(0, 0, drawingCanvasRef.current.width, drawingCanvasRef.current.height);
    }
  };

  const saveDrawing = () => {
    const link = document.createElement('a');
    link.download = `desenho-mannavision-${new Date().getTime()}.png`;
    link.href = drawingCanvasRef.current?.toDataURL() || '';
    link.click();
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

    const logoImg = new Image();
    logoImg.src = '/logo_manna_vision.png'; // Certifique-se de ter essa imagem na pasta public/

    logoImg.onload = () => {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.translate(-tempCanvas.width, 0);
      ctx.drawImage(videoCanvas, 0, 0);
      ctx.drawImage(drawingCanvas, 0, 0);
      ctx.restore();
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
      ctx.save();
      ctx.scale(-1, 1);
      ctx.translate(-tempCanvas.width, 0);
      ctx.drawImage(videoCanvas, 0, 0);
      ctx.drawImage(drawingCanvas, 0, 0);
      ctx.restore();
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

  // --- FUNÇÃO PARA SALVAR A IMAGEM GERADA PELA IA (Mantida) ---
  const handleSaveResult = () => {
    if (!resultImageUrl) return;
    const link = document.createElement('a');
    link.download = `ia-mannavision-${new Date().getTime()}.png`;
    link.href = resultImageUrl;
    link.click();
  };


  return (
    <div className="manna-vision-container">
      <div className="min-h-screen bg-gradient-to-br from-[var(--bg-from)] to-[var(--bg-to)] via-black text-white flex flex-col">
        {/* Header */}
        <header className="bg-black/30 backdrop-blur-md border-b border-[var(--border)]/20 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <img src="/logo_manna_vision.png" alt="MannaVision Logo" className="h-12" />
            </div>
            <div className="flex items-center space-x-2">
              <button onClick={() => setThemeColor('purple')} className={`w-6 h-6 rounded-full bg-purple-500 transition-transform duration-200 ${themeColor === 'purple' ? 'ring-2 ring-white scale-110' : 'hover:scale-110'}`}></button>
              <button onClick={() => setThemeColor('blue')} className={`w-6 h-6 rounded-full bg-blue-500 transition-transform duration-200 ${themeColor === 'blue' ? 'ring-2 ring-white scale-110' : 'hover:scale-110'}`}></button>
              <button onClick={() => setThemeColor('green')} className={`w-6 h-6 rounded-full bg-green-500 transition-transform duration-200 ${themeColor === 'green' ? 'ring-2 ring-white scale-110' : 'hover:scale-110'}`}></button>
              <button onClick={() => setThemeColor('pink')} className={`w-6 h-6 rounded-full bg-pink-500 transition-transform duration-200 ${themeColor === 'pink' ? 'ring-2 ring-white scale-110' : 'hover:scale-110'}`}></button>
            </div>
          </div>
        </header>

        {/* Conteúdo Principal: Sidebar e Área da Câmera */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar (TODAS AS FERRAMENTAS ESTÃO AQUI) */}
          <div className="w-80 bg-black/40 backdrop-blur-md border-r border-[var(--border)]/20 p-6 overflow-y-auto">
            <div className="space-y-6">

              {/* Modo de Visualização */}
              <div className="bg-[var(--dark)]/30 rounded-xl p-4 border border-[var(--border)]/20">
                <h3 className="font-semibold mb-3 flex items-center"><Video className="w-4 h-4 mr-2" />Modo de Visualização</h3>
                <div className="flex space-x-2">
                  <button onClick={() => setShowWhiteBoard(false)} className={`flex-1 px-3 py-2 rounded-lg transition-all duration-300 ${!showWhiteBoard ? 'bg-[var(--main)] shadow-lg shadow-[var(--light)]/25' : 'bg-[var(--dark)]/30 text-[var(--text)] hover:bg-[var(--main)]/30'}`}><Video className="w-4 h-4 mx-auto mb-1" /><span className="text-xs">Webcam</span></button>
                  <button onClick={() => setShowWhiteBoard(true)} className={`flex-1 px-3 py-2 rounded-lg transition-all duration-300 ${showWhiteBoard ? 'bg-[var(--main)] shadow-lg shadow-[var(--light)]/25' : 'bg-[var(--dark)]/30 text-[var(--text)] hover:bg-[var(--main)]/30'}`}><Square className="w-4 h-4 mx-auto mb-1" /><span className="text-xs">Lousa</span></button>
                </div>
              </div>

              {/* Ferramentas: Pincel/Borracha e Espessura */}
              <div className="bg-[var(--dark)]/30 rounded-xl p-4 border border-[var(--border)]/20">
                <h3 className="font-semibold mb-3">Ferramentas</h3>
                <div className="flex space-x-2 mb-4">
                  <button onClick={() => setIsEraser(false)} className={`flex-1 px-3 py-2 rounded-lg transition-all duration-300 ${!isEraser ? `bg-[var(--main)] shadow-lg shadow-[var(--light)]/25` : `bg-[var(--dark)]/30 text-[var(--text)] hover:bg-[var(--main)]/30`}`}><Palette className="w-4 h-4 mx-auto mb-1" /><span className="text-xs">Pincel</span></button>
                  <button onClick={() => setIsEraser(true)} className={`flex-1 px-3 py-2 rounded-lg transition-all duration-300 ${isEraser ? `bg-[var(--main)] shadow-lg shadow-[var(--light)]/25` : `bg-[var(--dark)]/30 text-[var(--text)] hover:bg-[var(--main)]/30`}`}><Eraser className="w-4 h-4 mx-auto mb-1" /><span className="text-xs">Borracha</span></button>
                </div>

                <div className="mb-4">
                  <label className="text-[var(--text)] text-sm mb-2 block">Espessura: {brushSize}px</label>
                  <div className="flex items-center space-x-3">
                    <button onClick={() => setBrushSize(s => Math.max(1, s - 1))} className="w-8 h-8 bg-[var(--main)]/50 hover:bg-[var(--light)]/50 rounded-lg flex items-center justify-center transition-colors"><MinusIcon className="w-3 h-3 text-[var(--text)]" /></button>
                    <div className="flex-1 bg-[var(--dark)]/30 rounded-lg h-2 relative"><div className="bg-gradient-to-r from-[var(--light)] to-pink-500 h-full rounded-lg transition-all duration-300" style={{ width: `${(brushSize / 20) * 100}%` }}/></div>
                    <button onClick={() => setBrushSize(s => Math.min(20, s + 1))} className="w-8 h-8 bg-[var(--main)]/50 hover:bg-[var(--light)]/50 rounded-lg flex items-center justify-center transition-colors"><Plus className="w-3 h-3 text-[var(--text)]" /></button>
                  </div>
                </div>
              </div>

              {/* Estilos */}
              <div className="bg-[var(--dark)]/30 rounded-xl p-4 border border-[var(--border)]/20">
                <h3 className="font-semibold mb-3 flex items-center">Estilos</h3>
                <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setBrushStyle('solid')} className={`px-3 py-2 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2 text-xs ${brushStyle === 'solid' ? `bg-[var(--main)] shadow-lg shadow-[var(--light)]/25` : `bg-[var(--dark)]/30 text-[var(--text)] hover:bg-[var(--main)]/30`}`}><PenLine className="w-4 h-4" /><span>Sólido</span></button>
                    <button onClick={() => setBrushStyle('glow')} className={`px-3 py-2 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2 text-xs ${brushStyle === 'glow' ? `bg-[var(--main)] shadow-lg shadow-[var(--light)]/25` : `bg-[var(--dark)]/30 text-[var(--text)] hover:bg-[var(--main)]/30`}`}><Sparkles className="w-4 h-4" /><span>Brilhante</span></button>
                    <button onClick={() => setBrushStyle('dashed')} className={`px-3 py-2 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2 text-xs ${brushStyle === 'dashed' ? `bg-[var(--main)] shadow-lg shadow-[var(--light)]/25` : `bg-[var(--dark)]/30 text-[var(--text)] hover:bg-[var(--main)]/30`}`}><MinusIcon className="w-4 h-4" /><span>Tracejado</span></button>
                    <button onClick={() => setBrushStyle('spray')} className={`px-3 py-2 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2 text-xs ${brushStyle === 'spray' ? `bg-[var(--main)] shadow-lg shadow-[var(--light)]/25` : `bg-[var(--dark)]/30 text-[var(--text)] hover:bg-[var(--main)]/30`}`}><SprayCan className="w-4 h-4" /><span>Spray</span></button>
                    <button onClick={() => setBrushStyle('rainbow')} className={`px-3 py-2 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2 text-xs ${brushStyle === 'rainbow' ? `bg-[var(--main)] shadow-lg shadow-[var(--light)]/25` : `bg-[var(--dark)]/30 text-[var(--text)] hover:bg-[var(--main)]/30`}`}><Wand2 className="w-4 h-4" /><span>Psicodélico</span></button>
                </div>
              </div>

              {/* Cores */}
              <div className="bg-[var(--dark)]/30 rounded-xl p-4 border border-[var(--border)]/20">
                <h3 className="font-semibold mb-3">Cores</h3>
                <div className="grid grid-cols-4 gap-2">
                  {colors.map((color) => (
                    <button key={color} onClick={() => { setCurrentColor(color); setIsEraser(false); }} className={`w-10 h-10 rounded-lg transition-all duration-300 ${currentColor === color && !isEraser ? `ring-2 ring-white ring-offset-2 ring-offset-black scale-110` : 'hover:scale-105'} ${color === '#FFFFFF' ? `border border-[var(--border)]/30` : ''}`} style={{ backgroundColor: color }} />
                  ))}
                </div>
              </div>

              {/* Ações: IA, Limpar, Salvar, Recordação */}
              <div className="space-y-3 pt-6 border-t border-[var(--border)]/20">
                {/* --- BOTÃO PARA ATIVAR A IA (AGORA COM WAND2) --- */}
                <button onClick={() => setIsPromptModalOpen(true)} className="w-full bg-gradient-to-r from-[var(--main)] to-[var(--light)] text-white font-bold py-3 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2 hover:shadow-lg hover:shadow-[var(--light)]/30">
                  <Sparkles className="w-5 h-5" />
                  <span>Gerar Imagem com IA</span>
                </button>
                <button onClick={clearCanvas} className="w-full bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-300 py-3 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2 hover:shadow-lg hover:shadow-red-500/25"><Trash2 className="w-4 h-4" /><span>Limpar Desenho</span></button>
                <button onClick={saveDrawing} className="w-full bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 text-green-300 py-3 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2 hover:shadow-lg hover:shadow-green-500/25"><Download className="w-4 h-4" /><span>Salvar Desenho</span></button>
                <button onClick={saveSouvenir} className="w-full bg-[var(--main)]/20 hover:bg-[var(--main)]/30 border border-[var(--border)]/30 text-[var(--text)] py-3 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2 hover:shadow-lg hover:shadow-[var(--light)]/25">
                  <CameraIcon className="w-4 h-4" />
                  <span>Salvar Recordação</span>
                </button>
              </div>
            </div>
          </div>

          {/* Área Principal: Câmera/Lousa e Canvas de Desenho */}
          <div className="flex-1 relative">
            <div className="absolute inset-4 rounded-2xl overflow-hidden border-2 shadow-2xl bg-black border-[var(--border)]/30">
              <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" autoPlay muted playsInline style={{ transform: 'scaleX(-1)' }} />
              <canvas ref={canvasRef} width={1280} height={720} className="absolute inset-0 w-full h-full object-cover" style={{ transform: 'scaleX(-1)', pointerEvents: 'none' }} />
              {showWhiteBoard && (<div className="absolute inset-0 bg-white" />)}
              <canvas ref={drawingCanvasRef} width={1280} height={720} className="absolute inset-0 w-full h-full object-cover" style={{ transform: 'scaleX(-1)', pointerEvents: 'none' }} />
              <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm rounded-lg p-3">
                <p className="text-sm font-medium mb-1">Como usar:</p>
                <p className={`text-xs text-[var(--text)]`}>👆 Una o polegar e indicador para desenhar</p>
                <p className={`text-xs text-[var(--text)]`}>✋ Afaste os dedos para parar</p>
              </div>
              {isDrawing && (
                <div className="absolute top-4 right-4 bg-green-600/80 backdrop-blur-sm rounded-full px-3 py-1 text-sm font-medium animate-pulse">✏️ Desenhando...</div>
              )}
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