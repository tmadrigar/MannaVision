// src/components/HomeHub.tsx

import React from 'react';
import { Palette, Clock, Sparkles, ArrowRight, Zap, Waves } from 'lucide-react';

type ThemeColor = 'purple' | 'blue' | 'green' | 'pink';

interface HomeHubProps {
  onSelectMode: (mode: 'draw' | 'control_time' | 'fluid') => void;
  themeColor: ThemeColor;
  setThemeColor: React.Dispatch<React.SetStateAction<ThemeColor>>;
}

const HomeHub: React.FC<HomeHubProps> = ({ onSelectMode, themeColor, setThemeColor }) => {
  return (
    <div className="h-screen w-screen max-h-screen overflow-hidden flex flex-col bg-gradient-to-br from-[var(--bg-from)] via-black to-[var(--bg-to)] text-white select-none">
      {/* Header Superior */}
      <header className="h-14 min-h-[56px] bg-black/40 backdrop-blur-md border-b border-[var(--border)]/20 px-6 flex items-center justify-between z-20 flex-shrink-0">
        <div className="flex items-center space-x-3">
          <img src="/logo_manna_vision.png" alt="MannaVision Logo" className="h-8 object-contain" />
          <span className="text-xs text-[var(--text)] border-l border-white/20 pl-3 font-medium">
            Interação Gestual & IA
          </span>
        </div>

        {/* Seletor de Temas */}
        <div className="flex items-center space-x-2 bg-black/50 px-3 py-1.5 rounded-full border border-white/10">
          <span className="text-[11px] text-gray-400 mr-1 hidden sm:inline">Tema:</span>
          <button
            onClick={() => setThemeColor('purple')}
            className={`w-4 h-4 rounded-full bg-purple-500 transition-transform ${themeColor === 'purple' ? 'ring-2 ring-white scale-125' : 'hover:scale-110'}`}
            title="Tema Roxo"
          />
          <button
            onClick={() => setThemeColor('blue')}
            className={`w-4 h-4 rounded-full bg-blue-500 transition-transform ${themeColor === 'blue' ? 'ring-2 ring-white scale-125' : 'hover:scale-110'}`}
            title="Tema Azul"
          />
          <button
            onClick={() => setThemeColor('green')}
            className={`w-4 h-4 rounded-full bg-green-500 transition-transform ${themeColor === 'green' ? 'ring-2 ring-white scale-125' : 'hover:scale-110'}`}
            title="Tema Verde"
          />
          <button
            onClick={() => setThemeColor('pink')}
            className={`w-4 h-4 rounded-full bg-pink-500 transition-transform ${themeColor === 'pink' ? 'ring-2 ring-white scale-125' : 'hover:scale-110'}`}
            title="Tema Rosa"
          />
        </div>
      </header>

      {/* Conteúdo Central */}
      <main className="flex-1 overflow-y-auto custom-scrollbar flex flex-col items-center justify-center p-6 sm:p-10 max-w-7xl mx-auto w-full">
        {/* Banner Hero */}
        <div className="text-center mb-8 sm:mb-10 max-w-2xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[var(--main)]/15 border border-[var(--border)]/30 text-[var(--light)] text-xs font-semibold mb-4 animate-fade-in">
            <Sparkles className="w-3.5 h-3.5" />
            <span>MannaVision v2.1 • Escolha uma experiência</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white via-[var(--light)] to-[var(--text)] bg-clip-text text-transparent mb-3">
            O poder dos seus gestos
          </h1>
          <p className="text-sm sm:text-base text-gray-300 leading-relaxed">
            Selecione como deseja interagir com a visão computacional em tempo real:
          </p>
        </div>

        {/* Grade dos 3 Modos Principais */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 w-full">
          {/* CARD 1: PINTURA E IA */}
          <div
            onClick={() => onSelectMode('draw')}
            className="group relative bg-black/40 hover:bg-black/60 backdrop-blur-xl border border-[var(--border)]/30 hover:border-[var(--main)] rounded-2xl p-6 sm:p-8 transition-all duration-300 hover:shadow-2xl hover:shadow-[var(--main)]/20 cursor-pointer flex flex-col justify-between overflow-hidden"
          >
            {/* Efeito sutil de iluminação de fundo */}
            <div className="absolute -top-20 -right-20 w-48 h-48 bg-[var(--main)]/15 rounded-full blur-3xl group-hover:bg-[var(--main)]/25 transition-all" />

            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[var(--main)] to-purple-800 flex items-center justify-center shadow-lg shadow-[var(--main)]/30 group-hover:scale-110 transition-transform">
                  <Palette className="w-7 h-7 text-white" />
                </div>
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Modo Criativo
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 group-hover:text-[var(--light)] transition-colors">
                MannaVision Paint
              </h2>
              <p className="text-xs sm:text-sm text-gray-300 mb-6 leading-relaxed">
                Pinte no ar juntando o polegar e indicador. Traços suaves em neon, fita, caligrafia e fagulhas, caleidoscópio de até 12 eixos, tinta que evapora e geração de arte com IA.
              </p>

              {/* Destaques */}
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-300 mb-6">
                <div className="flex items-center space-x-2 bg-white/5 p-2 rounded-lg">
                  <span className="text-base">✨</span>
                  <span>Neon & Fagulhas</span>
                </div>
                <div className="flex items-center space-x-2 bg-white/5 p-2 rounded-lg">
                  <span className="text-base">🪷</span>
                  <span>Caleidoscópio</span>
                </div>
                <div className="flex items-center space-x-2 bg-white/5 p-2 rounded-lg">
                  <span className="text-base">🎨</span>
                  <span>8 Pincéis & Desfazer</span>
                </div>
                <div className="flex items-center space-x-2 bg-white/5 p-2 rounded-lg">
                  <span className="text-base">📸</span>
                  <span>Salvar Recordação</span>
                </div>
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelectMode('draw');
              }}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[var(--main)] to-[var(--light)] text-white font-bold text-sm flex items-center justify-center space-x-2 group-hover:shadow-lg group-hover:shadow-[var(--light)]/25 transition-all"
            >
              <span>Entrar no MannaVision Paint</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          {/* CARD 2: CONTROL TIME */}
          <div
            onClick={() => onSelectMode('control_time')}
            className="group relative bg-black/40 hover:bg-black/60 backdrop-blur-xl border border-[var(--border)]/30 hover:border-cyan-400 rounded-2xl p-6 sm:p-8 transition-all duration-300 hover:shadow-2xl hover:shadow-cyan-500/20 cursor-pointer flex flex-col justify-between overflow-hidden"
          >
            {/* Efeito sutil de iluminação de fundo */}
            <div className="absolute -top-20 -right-20 w-48 h-48 bg-cyan-500/15 rounded-full blur-3xl group-hover:bg-cyan-500/25 transition-all" />

            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-700 flex items-center justify-center shadow-lg shadow-cyan-500/30 group-hover:scale-110 transition-transform">
                  <Clock className="w-7 h-7 text-white" />
                </div>
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center space-x-1">
                  <Zap className="w-3 h-3 mr-1" />
                  <span>Novo Modo</span>
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 group-hover:text-cyan-300 transition-colors">
                Control Time
              </h2>
              <p className="text-xs sm:text-sm text-gray-300 mb-6 leading-relaxed">
                Segure o tempo entre os seus dedos. Abra e feche a pinça das mãos para avançar e retroceder livremente na linha do tempo de fenômenos naturais, espaciais e vídeos.
              </p>

              {/* Destaques */}
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-300 mb-6">
                <div className="flex items-center space-x-2 bg-white/5 p-2 rounded-lg">
                  <span className="text-base">🌺</span>
                  <span>Flor Fantasia</span>
                </div>
                <div className="flex items-center space-x-2 bg-white/5 p-2 rounded-lg">
                  <span className="text-base">🎸</span>
                  <span>Som & Guitarra</span>
                </div>
                <div className="flex items-center space-x-2 bg-white/5 p-2 rounded-lg">
                  <span className="text-base">🪐</span>
                  <span>Sistema Solar</span>
                </div>
                <div className="flex items-center space-x-2 bg-white/5 p-2 rounded-lg">
                  <span className="text-base">🔍</span>
                  <span>Zoom Infinito</span>
                </div>
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelectMode('control_time');
              }}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-sm flex items-center justify-center space-x-2 group-hover:shadow-lg group-hover:shadow-cyan-500/25 transition-all"
            >
              <span>Entrar no Control Time</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
          {/* CARD 3: MANIPULAR O FLUIDO */}
          <div
            onClick={() => onSelectMode('fluid')}
            className="group relative bg-black/40 hover:bg-black/60 backdrop-blur-xl border border-[var(--border)]/30 hover:border-emerald-400 rounded-2xl p-6 sm:p-8 transition-all duration-300 hover:shadow-2xl hover:shadow-emerald-500/20 cursor-pointer flex flex-col justify-between overflow-hidden md:col-span-2 xl:col-span-1"
          >
            {/* Efeito sutil de iluminação de fundo */}
            <div className="absolute -top-20 -right-20 w-48 h-48 bg-emerald-500/15 rounded-full blur-3xl group-hover:bg-emerald-500/25 transition-all" />

            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-500/30 group-hover:scale-110 transition-transform">
                  <Waves className="w-7 h-7 text-white" />
                </div>
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1">
                  <Zap className="w-3 h-3 mr-1" />
                  <span>Novo Modo</span>
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 group-hover:text-emerald-300 transition-colors">
                Manipular o Fluido
              </h2>
              <p className="text-xs sm:text-sm text-gray-300 mb-6 leading-relaxed">
                Mergulhe as mãos em um fluido vivo simulado na GPU. Cada dedo empurra, agita e pinta a tinta em tempo real, criando redemoinhos e cores que reagem aos seus movimentos.
              </p>

              {/* Destaques */}
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-300 mb-6">
                <div className="flex items-center space-x-2 bg-white/5 p-2 rounded-lg">
                  <span className="text-base">🖐️</span>
                  <span>10 Dedos Simultâneos</span>
                </div>
                <div className="flex items-center space-x-2 bg-white/5 p-2 rounded-lg">
                  <span className="text-base">🌊</span>
                  <span>Física Navier-Stokes</span>
                </div>
                <div className="flex items-center space-x-2 bg-white/5 p-2 rounded-lg">
                  <span className="text-base">🤏</span>
                  <span>Pinça, Palma & Indicador</span>
                </div>
                <div className="flex items-center space-x-2 bg-white/5 p-2 rounded-lg">
                  <span className="text-base">✨</span>
                  <span>Bloom & Raios de Luz</span>
                </div>
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelectMode('fluid');
              }}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm flex items-center justify-center space-x-2 group-hover:shadow-lg group-hover:shadow-emerald-500/25 transition-all"
            >
              <span>Entrar no Fluido</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>

        {/* Rodapé do Hub */}
        <div className="mt-8 text-center text-xs text-gray-400 flex items-center justify-center space-x-4">
          <span>Rastreamento em tempo real por Google MediaPipe Hands</span>
          <span>•</span>
          <span>Zero Latência</span>
          <span>•</span>
          <span>Controle Bidirecional</span>
        </div>
      </main>
    </div>
  );
};

export default HomeHub;
