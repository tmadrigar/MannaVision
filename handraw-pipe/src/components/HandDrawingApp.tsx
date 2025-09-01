import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Camera } from '@mediapipe/camera_utils';
import { Hands, Results } from '@mediapipe/hands';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import {
  Palette,
  Eraser,
  Trash2,
  Download,
  Video,
  Square,
  Minus as MinusIcon,
  Plus,
  PenLine,
  Sparkles,
  SprayCan,
  Wand2,
  Camera as CameraIcon, // Ícone para o novo botão
} from 'lucide-react';

interface Point {
  x: number;
  y: number;
}

type BrushStyle = 'solid' | 'glow' | 'dashed' | 'spray' | 'rainbow';
type ThemeColor = 'purple' | 'blue' | 'green' | 'pink';

// Componente principal da aplicação MannaVision
const MannaVisionApp: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const handsRef = useRef<Hands | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const isMediaPipeInitialized = useRef(false);
  const lastPointsRef = useRef<(Point | null)[]>([null, null]);
  const rainbowHueRef = useRef(0);

  const [isDrawing, setIsDrawing] = useState(false);
  const [showWhiteBoard, setShowWhiteBoard] = useState(false);
  const [brushSize, setBrushSize] = useState(5);
  const [currentColor, setCurrentColor] = useState('#8B5CF6');
  const [isEraser, setIsEraser] = useState(false);
  const [brushStyle, setBrushStyle] = useState<BrushStyle>('solid');
  const [themeColor, setThemeColor] = useState<ThemeColor>('purple');

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

        if (distance < 40) {
          anyHandIsDrawing = true;
          const lastPoint = lastPointsRef.current[index];

          if (lastPoint) {
            drawingCtx.globalCompositeOperation = isEraserRef.current ? 'destination-out' : 'source-over';
            drawingCtx.lineWidth = isEraserRef.current ? brushSizeRef.current * 2 : brushSizeRef.current;
            drawingCtx.strokeStyle = isEraserRef.current ? 'rgba(0,0,0,1)' : currentColorRef.current;
            drawingCtx.lineCap = 'round';
            drawingCtx.lineJoin = 'round';

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
            drawingCtx.shadowBlur = 0;
            drawingCtx.setLineDash([]);
          }
          lastPointsRef.current[index] = currentPoint;
        } else {
          lastPointsRef.current[index] = null;
        }
      });
    }

    setIsDrawing(anyHandIsDrawing);

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

  // --- NOVA FUNÇÃO PARA SALVAR A RECORDAÇÃO ---
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
    logoImg.src = '/logo_manna_vision.png'; // A logo deve estar na pasta /public

    logoImg.onload = () => {
      // Espelha o contexto do canvas temporário para corresponder à visualização
      ctx.save();
      ctx.scale(-1, 1);
      ctx.translate(-tempCanvas.width, 0);

      // Desenha o canvas do vídeo e o canvas do desenho (ambos não espelhados)
      ctx.drawImage(videoCanvas, 0, 0);
      ctx.drawImage(drawingCanvas, 0, 0);

      // Restaura o contexto para desenhar a logo sem espelhamento
      ctx.restore();

      // Desenha a logo no canto inferior direito
      const logoHeight = 60;
      const logoWidth = logoImg.width * (logoHeight / logoImg.height);
      const margin = 20;
      ctx.drawImage(logoImg, tempCanvas.width - logoWidth - margin, tempCanvas.height - logoHeight - margin, logoWidth, logoHeight);

      // Inicia o download da imagem final
      const link = document.createElement('a');
      link.download = `recordacao-mannavision-${new Date().getTime()}.png`;
      link.href = tempCanvas.toDataURL('image/png');
      link.click();
    };

    logoImg.onerror = () => {
      console.error("Não foi possível carregar a logo para a recordação.");
      // Se a logo falhar, salva a imagem mesmo assim
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

  const themeClasses = {
    purple: "theme-purple",
    blue: "theme-blue",
    green: "theme-green",
    pink: "theme-pink",
  };

  return (
    <div className={`manna-vision-container ${themeClasses[themeColor]}`}>
      <style>{`
        .theme-purple { --bg-from: #3b0764; --bg-to: #2c0547; --main: #8B5CF6; --light: #a78bfa; --dark: #5b21b6; --text: #c4b5fd; --border: #7c3aed; }
        .theme-blue { --bg-from: #1e3a8a; --bg-to: #1c3d7e; --main: #3B82F6; --light: #60a5fa; --dark: #1e40af; --text: #93c5fd; --border: #2563eb; }
        .theme-green { --bg-from: #064e3b; --bg-to: #054232; --main: #22C55E; --light: #4ade80; --dark: #047857; --text: #86efac; --border: #16a34a; }
        .theme-pink { --bg-from: #831843; --bg-to: #7a153d; --main: #EC4899; --light: #f472b6; --dark: #be185d; --text: #f9a8d4; --border: #db2777; }
      `}</style>
      <div className="min-h-screen bg-gradient-to-br from-[var(--bg-from)] to-[var(--bg-to)] via-black text-white flex flex-col">
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

        <div className="flex flex-1 overflow-hidden">
          <div className="w-80 bg-black/40 backdrop-blur-md border-r border-[var(--border)]/20 p-6 overflow-y-auto">
            <div className="space-y-6">
              <div className="bg-[var(--dark)]/30 rounded-xl p-4 border border-[var(--border)]/20">
                <h3 className="font-semibold mb-3 flex items-center"><Video className="w-4 h-4 mr-2" />Modo de Visualização</h3>
                <div className="flex space-x-2">
                  <button onClick={() => setShowWhiteBoard(false)} className={`flex-1 px-3 py-2 rounded-lg transition-all duration-300 ${!showWhiteBoard ? 'bg-[var(--main)] shadow-lg shadow-[var(--light)]/25' : 'bg-[var(--dark)]/30 text-[var(--text)] hover:bg-[var(--main)]/30'}`}><Video className="w-4 h-4 mx-auto mb-1" /><span className="text-xs">Webcam</span></button>
                  <button onClick={() => setShowWhiteBoard(true)} className={`flex-1 px-3 py-2 rounded-lg transition-all duration-300 ${showWhiteBoard ? 'bg-[var(--main)] shadow-lg shadow-[var(--light)]/25' : 'bg-[var(--dark)]/30 text-[var(--text)] hover:bg-[var(--main)]/30'}`}><Square className="w-4 h-4 mx-auto mb-1" /><span className="text-xs">Lousa</span></button>
                </div>
              </div>

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

              <div className="bg-[var(--dark)]/30 rounded-xl p-4 border border-[var(--border)]/20">
                <h3 className="font-semibold mb-3">Cores</h3>
                <div className="grid grid-cols-4 gap-2">
                  {colors.map((color) => (
                    <button key={color} onClick={() => { setCurrentColor(color); setIsEraser(false); }} className={`w-10 h-10 rounded-lg transition-all duration-300 ${currentColor === color && !isEraser ? `ring-2 ring-white ring-offset-2 ring-offset-black scale-110` : 'hover:scale-105'} ${color === '#FFFFFF' ? `border border-[var(--border)]/30` : ''}`} style={{ backgroundColor: color }} />
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <button onClick={clearCanvas} className="w-full bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-300 py-3 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2 hover:shadow-lg hover:shadow-red-500/25"><Trash2 className="w-4 h-4" /><span>Limpar Tudo</span></button>
                <button onClick={saveDrawing} className="w-full bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 text-green-300 py-3 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2 hover:shadow-lg hover:shadow-green-500/25"><Download className="w-4 h-4" /><span>Salvar Desenho</span></button>
                {/* --- NOVO BOTÃO DE RECORDAÇÃO --- */}
                <button onClick={saveSouvenir} className="w-full bg-[var(--main)]/20 hover:bg-[var(--main)]/30 border border-[var(--border)]/30 text-[var(--text)] py-3 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2 hover:shadow-lg hover:shadow-[var(--light)]/25">
                  <CameraIcon className="w-4 h-4" />
                  <span>Salvar Recordação</span>
                </button>
              </div>
            </div>
          </div>

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
    </div>
  );
};

export default MannaVisionApp;



