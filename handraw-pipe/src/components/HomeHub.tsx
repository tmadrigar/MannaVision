// src/components/HomeHub.tsx

import React from 'react';
import { Palette, Clock, ArrowRight, Zap, Waves, Box, Music, ScanFace } from 'lucide-react';

type ThemeColor = 'purple' | 'blue' | 'green' | 'pink';

interface HomeHubProps {
  onSelectMode: (mode: 'draw' | 'control_time' | 'fluid' | 'timecube' | 'harp' | 'xray') => void;
  themeColor: ThemeColor;
  setThemeColor: React.Dispatch<React.SetStateAction<ThemeColor>>;
}

const HomeHub: React.FC<HomeHubProps> = ({ onSelectMode, themeColor, setThemeColor }) => {
  return (
    <div className="h-screen w-screen max-h-screen overflow-hidden flex flex-col bg-gradient-to-br from-[var(--bg-from)] via-black to-[var(--bg-to)] text-white select-none">
      {/* Seletor de Temas (Canto Superior Direito) */}
      <div className="absolute top-4 right-6 flex items-center space-x-2 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 z-20">
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

      {/* Conteúdo Central */}
      <main className="flex-1 overflow-y-auto custom-scrollbar flex flex-col items-center justify-center p-6 sm:p-10 max-w-7xl mx-auto w-full relative z-10">
        {/* Logo Centralizada (200% de tamanho, apenas a logo no centro) */}
        <div className="flex flex-col items-center justify-center mb-8 sm:mb-10 animate-fade-in">
          <img
            src="/logo_manna_vision1.png"
            alt="MannaVision Logo"
            className="h-20 sm:h-28 md:h-32 w-auto object-contain filter drop-shadow-[0_0_35px_var(--main)]/35 transition-transform duration-300 hover:scale-105"
          />
        </div>

        {/* Grade dos Modos Principais */}
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
                  <Zap className="w-3 h-3 mr-1 text-cyan-400 animate-pulse" />
                  <span>Anime.js + Vídeo</span>
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 group-hover:text-cyan-300 transition-colors">
                Control Time
              </h2>
              <p className="text-xs sm:text-sm text-gray-300 mb-6 leading-relaxed">
                Segure o tempo entre os seus dedos. Abra e feche a pinça das mãos para avançar e retroceder livremente na linha do tempo de fenômenos naturais, espaciais, vídeos e animações vetoriais Anime.js.
              </p>

              {/* Destaques */}
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-300 mb-6">
                <div className="flex items-center space-x-2 bg-cyan-500/20 border border-cyan-400/40 p-2 rounded-lg text-cyan-200 font-medium">
                  <span className="text-base">⚡</span>
                  <span>Cronógrafo 3D</span>
                </div>
                <div className="flex items-center space-x-2 bg-cyan-500/20 border border-cyan-400/40 p-2 rounded-lg text-cyan-200 font-medium">
                  <span className="text-base">🚀</span>
                  <span>Foguete CAD 3D</span>
                </div>
                <div className="flex items-center space-x-2 bg-cyan-500/20 border border-cyan-400/40 p-2 rounded-lg text-cyan-200 font-medium">
                  <span className="text-base">🏛️</span>
                  <span>Blueprint Laser</span>
                </div>
                <div className="flex items-center space-x-2 bg-cyan-500/20 border border-cyan-400/40 p-2 rounded-lg text-cyan-200 font-medium">
                  <span className="text-base">🧬</span>
                  <span>Escala Cósmica</span>
                </div>
                <div className="flex items-center space-x-2 bg-cyan-500/20 border border-cyan-400/40 p-2 rounded-lg text-cyan-200 font-medium">
                  <span className="text-base">⌚</span>
                  <span>Tourbillon Suíço</span>
                </div>
                <div className="flex items-center space-x-2 bg-cyan-500/20 border border-cyan-400/40 p-2 rounded-lg text-cyan-200 font-medium">
                  <span className="text-base">🤖</span>
                  <span>JARVIS HUD 3D</span>
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
            className="group relative bg-black/40 hover:bg-black/60 backdrop-blur-xl border border-[var(--border)]/30 hover:border-emerald-400 rounded-2xl p-6 sm:p-8 transition-all duration-300 hover:shadow-2xl hover:shadow-emerald-500/20 cursor-pointer flex flex-col justify-between overflow-hidden"
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

          {/* CARD 4: CUBO DO TEMPO */}
          <div
            onClick={() => onSelectMode('timecube')}
            className="group relative bg-black/40 hover:bg-black/60 backdrop-blur-xl border border-[var(--border)]/30 hover:border-sky-400 rounded-2xl p-6 sm:p-8 transition-all duration-300 hover:shadow-2xl hover:shadow-sky-500/20 cursor-pointer flex flex-col justify-between overflow-hidden"
          >
            {/* Efeito sutil de iluminação de fundo */}
            <div className="absolute -top-20 -right-20 w-48 h-48 bg-sky-500/15 rounded-full blur-3xl group-hover:bg-sky-500/25 transition-all" />

            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-sky-500/30 group-hover:scale-110 transition-transform">
                  <Box className="w-7 h-7 text-white" />
                </div>
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center space-x-1">
                  <Zap className="w-3 h-3 mr-1" />
                  <span>Novo Modo</span>
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 group-hover:text-sky-300 transition-colors">
                Cubo do Tempo
              </h2>
              <p className="text-xs sm:text-sm text-gray-300 mb-6 leading-relaxed">
                Um vídeo inteiro empilhado num cubo 3D: largura, altura e tempo. Gire-o com as duas mãos para ver o movimento virar fitas no espaço e use a pinça para levar o presente ao passado e ao futuro.
              </p>

              {/* Destaques */}
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-300 mb-6">
                <div className="flex items-center space-x-2 bg-white/5 p-2 rounded-lg">
                  <span className="text-base">🧊</span>
                  <span>Volume X·Y·T na GPU</span>
                </div>
                <div className="flex items-center space-x-2 bg-white/5 p-2 rounded-lg">
                  <span className="text-base">🖐️🖐️</span>
                  <span>Duas Mãos Giram</span>
                </div>
                <div className="flex items-center space-x-2 bg-white/5 p-2 rounded-lg">
                  <span className="text-base">🤏</span>
                  <span>Pinça Viaja no Tempo</span>
                </div>
                <div className="flex items-center space-x-2 bg-white/5 p-2 rounded-lg">
                  <span className="text-base">🎬</span>
                  <span>Seus Vídeos + Gravação</span>
                </div>
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelectMode('timecube');
              }}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 text-white font-bold text-sm flex items-center justify-center space-x-2 group-hover:shadow-lg group-hover:shadow-sky-500/25 transition-all"
            >
              <span>Entrar no Cubo do Tempo</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          {/* CARD 5: HARPA DE LUZ */}
          <div
            onClick={() => onSelectMode('harp')}
            className="group relative bg-black/40 hover:bg-black/60 backdrop-blur-xl border border-[var(--border)]/30 hover:border-amber-400 rounded-2xl p-6 sm:p-8 transition-all duration-300 hover:shadow-2xl hover:shadow-amber-500/20 cursor-pointer flex flex-col justify-between overflow-hidden"
          >
            {/* Efeito sutil de iluminação de fundo */}
            <div className="absolute -top-20 -right-20 w-48 h-48 bg-amber-500/15 rounded-full blur-3xl group-hover:bg-amber-500/25 transition-all" />

            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-amber-400 to-rose-600 flex items-center justify-center shadow-lg shadow-amber-500/30 group-hover:scale-110 transition-transform">
                  <Music className="w-7 h-7 text-white" />
                </div>
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center space-x-1">
                  <Zap className="w-3 h-3 mr-1" />
                  <span>Novo Modo</span>
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 group-hover:text-amber-300 transition-colors">
                Harpa de Luz
              </h2>
              <p className="text-xs sm:text-sm text-gray-300 mb-6 leading-relaxed">
                Estique cordas de luz no ar com a pinça e toque-as com a ponta dos dedos. O comprimento de cada corda define a nota: curta é aguda, longa é grave, sempre afinada na escala escolhida.
              </p>

              {/* Destaques */}
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-300 mb-6">
                <div className="flex items-center space-x-2 bg-white/5 p-2 rounded-lg">
                  <span className="text-base">🤏</span>
                  <span>Pinça Estica Cordas</span>
                </div>
                <div className="flex items-center space-x-2 bg-white/5 p-2 rounded-lg">
                  <span className="text-base">🎵</span>
                  <span>Tamanho = Nota</span>
                </div>
                <div className="flex items-center space-x-2 bg-white/5 p-2 rounded-lg">
                  <span className="text-base">🪕</span>
                  <span>Harpa, Koto, Cristal</span>
                </div>
                <div className="flex items-center space-x-2 bg-white/5 p-2 rounded-lg">
                  <span className="text-base">🎬</span>
                  <span>Grava Vídeo com Som</span>
                </div>
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelectMode('harp');
              }}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 text-white font-bold text-sm flex items-center justify-center space-x-2 group-hover:shadow-lg group-hover:shadow-amber-500/25 transition-all"
            >
              <span>Entrar na Harpa de Luz</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
          {/* CARD 6: ESPELHO RAIO-X */}
          <div
            onClick={() => onSelectMode('xray')}
            className="group relative bg-black/40 hover:bg-black/60 backdrop-blur-xl border border-[var(--border)]/30 hover:border-sky-300 rounded-2xl p-6 sm:p-8 transition-all duration-300 hover:shadow-2xl hover:shadow-sky-400/20 cursor-pointer flex flex-col justify-between overflow-hidden"
          >
            {/* Efeito sutil de iluminação de fundo */}
            <div className="absolute -top-20 -right-20 w-48 h-48 bg-sky-400/15 rounded-full blur-3xl group-hover:bg-sky-400/25 transition-all" />

            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-sky-300 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-sky-400/30 group-hover:scale-110 transition-transform">
                  <ScanFace className="w-7 h-7 text-white" />
                </div>
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-sky-400/20 text-sky-200 border border-sky-400/30 flex items-center space-x-1">
                  <Zap className="w-3 h-3 mr-1" />
                  <span>Novo Modo</span>
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 group-hover:text-sky-200 transition-colors">
                Espelho Raio-X
              </h2>
              <p className="text-xs sm:text-sm text-gray-300 mb-6 leading-relaxed">
                Veja o crânio, o cérebro e os músculos dentro da sua cabeça, presos ao seu rosto em tempo real. Abra a boca e a mandíbula abre junto; levante a mão e veja os ossos dela.
              </p>

              {/* Destaques */}
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-300 mb-6">
                <div className="flex items-center space-x-2 bg-white/5 p-2 rounded-lg">
                  <span className="text-base">💀</span>
                  <span>Crânio & Cérebro 3D</span>
                </div>
                <div className="flex items-center space-x-2 bg-white/5 p-2 rounded-lg">
                  <span className="text-base">🦴</span>
                  <span>Ossos da Mão</span>
                </div>
                <div className="flex items-center space-x-2 bg-white/5 p-2 rounded-lg">
                  <span className="text-base">🔍</span>
                  <span>Lente no Dedo</span>
                </div>
                <div className="flex items-center space-x-2 bg-white/5 p-2 rounded-lg">
                  <span className="text-base">🏷️</span>
                  <span>Nomes em Português</span>
                </div>
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelectMode('xray');
              }}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-sky-400 to-fuchsia-600 text-white font-bold text-sm flex items-center justify-center space-x-2 group-hover:shadow-lg group-hover:shadow-sky-400/25 transition-all"
            >
              <span>Entrar no Espelho Raio-X</span>
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
