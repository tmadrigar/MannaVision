// src/App.tsx

import React, { useState } from 'react';
import './index.css';

import HandDrawingApp from './components/HandDrawingApp';

type ThemeColor = 'purple' | 'blue' | 'green' | 'pink';

function App() {
  const [themeColor, setThemeColor] = useState<ThemeColor>('purple');

  const themeClasses = {
    purple: "theme-purple",
    blue: "theme-blue",
    green: "theme-green",
    pink: "theme-pink",
  };

  return (
    <div className={`app-container ${themeClasses[themeColor]}`}>
      <style>{`
        .theme-purple { --bg-from: #3b0764; --bg-to: #2c0547; --main: #8B5CF6; --light: #a78bfa; --dark: #5b21b6; --text: #c4b5fd; --border: #7c3aed; }
        .theme-blue { --bg-from: #1e3a8a; --bg-to: #1c3d7e; --main: #3B82F6; --light: #60a5fa; --dark: #1e40af; --text: #93c5fd; --border: #2563eb; }
        .theme-green { --bg-from: #064e3b; --bg-to: #054232; --main: #22C55E; --light: #4ade80; --dark: #047857; --text: #86efac; --border: #16a34a; }
        .theme-pink { --bg-from: #831843; --bg-to: #7a153d; --main: #EC4899; --light: #f472b6; --dark: #be185d; --text: #f9a8d4; --border: #db2777; }
      `}</style>

      {/* Agora ele renderiza o HandDrawingApp diretamente e passa o controle do tema para ele */}
      <HandDrawingApp
        themeColor={themeColor}
        setThemeColor={setThemeColor}
      />
    </div>
  );
}

export default App;