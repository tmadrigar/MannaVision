// src/App.tsx

import React, { useState } from 'react';
import './index.css';

import HomeHub from './components/HomeHub';
import HandDrawingApp from './components/HandDrawingApp';
import ControlTimeApp from './components/ControlTimeApp';
import FluidApp from './components/FluidApp';

type ThemeColor = 'purple' | 'blue' | 'green' | 'pink';
type AppMode = 'hub' | 'draw' | 'control_time' | 'fluid';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  onReset: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorMessage: error?.message || 'Erro inesperado' };
  }

  componentDidCatch(error: any, info: any) {
    console.error('MannaVision ErrorBoundary capturou erro:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="bg-red-950/80 border border-red-500/50 p-6 rounded-2xl max-w-lg shadow-2xl">
            <h2 className="text-xl font-bold text-red-300 mb-2">Ops! Ocorreu um erro no módulo</h2>
            <p className="text-xs text-red-200 mb-4 font-mono bg-black/60 p-3 rounded-lg text-left overflow-auto max-h-48">
              {this.state.errorMessage}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, errorMessage: '' });
                this.props.onReset();
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition-all"
            >
              Voltar ao Início
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [currentMode, setCurrentMode] = useState<AppMode>('hub');
  const [themeColor, setThemeColor] = useState<ThemeColor>('purple');

  const themeClasses = {
    purple: "theme-purple",
    blue: "theme-blue",
    green: "theme-green",
    pink: "theme-pink",
  };

  return (
    <ErrorBoundary onReset={() => setCurrentMode('hub')}>
      <div className={`app-container ${themeClasses[themeColor]} h-screen w-screen overflow-hidden`}>
        <style>{`
          .theme-purple { --bg-from: #3b0764; --bg-to: #2c0547; --main: #8B5CF6; --light: #a78bfa; --dark: #5b21b6; --text: #c4b5fd; --border: #7c3aed; }
          .theme-blue { --bg-from: #1e3a8a; --bg-to: #1c3d7e; --main: #3B82F6; --light: #60a5fa; --dark: #1e40af; --text: #93c5fd; --border: #2563eb; }
          .theme-green { --bg-from: #064e3b; --bg-to: #054232; --main: #22C55E; --light: #4ade80; --dark: #047857; --text: #86efac; --border: #16a34a; }
          .theme-pink { --bg-from: #831843; --bg-to: #7a153d; --main: #EC4899; --light: #f472b6; --dark: #be185d; --text: #f9a8d4; --border: #db2777; }
        `}</style>

        {/* Hub Inicial com seleção dos 3 modos */}
        {currentMode === 'hub' && (
          <HomeHub
            onSelectMode={(mode) => setCurrentMode(mode)}
            themeColor={themeColor}
            setThemeColor={setThemeColor}
          />
        )}

        {/* Modo 1: MannaVision Paint (Desenho e IA) */}
        {currentMode === 'draw' && (
          <HandDrawingApp
            onBackToHub={() => setCurrentMode('hub')}
            themeColor={themeColor}
            setThemeColor={setThemeColor}
          />
        )}

        {/* Modo 2: Control Time (Linha do Tempo Gestual) */}
        {currentMode === 'control_time' && (
          <ControlTimeApp
            onBackToHub={() => setCurrentMode('hub')}
            themeColor={themeColor}
            setThemeColor={setThemeColor}
          />
        )}

        {/* Modo 3: Manipular o Fluido (Simulação WebGL controlada pelos dedos) */}
        {currentMode === 'fluid' && (
          <FluidApp
            onBackToHub={() => setCurrentMode('hub')}
            themeColor={themeColor}
            setThemeColor={setThemeColor}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}

export default App;