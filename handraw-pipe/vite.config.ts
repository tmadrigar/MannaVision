import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

/**
 * Os pacotes @mediapipe/* são compilados com o Closure Compiler e exportam seus
 * símbolos dinamicamente (goog.exportSymbol). O Rollup não detecta esses
 * exports no build de produção, resultando em "Hands is not a constructor".
 * Este plugin anexa exports estáticos para que o bundle os enxergue.
 */
function mediapipeWorkaround(): Plugin {
  const patches: Record<string, string[]> = {
    'hands.js': ['Hands', 'HAND_CONNECTIONS', 'VERSION'],
    'drawing_utils.js': ['drawConnectors', 'drawLandmarks', 'drawRectangle', 'lerp', 'clamp'],
  };
  return {
    name: 'mediapipe-workaround',
    load(id) {
      const name = basename(id);
      if (!id.includes('@mediapipe') || !patches[name]) return null;
      let code = readFileSync(id, 'utf-8');
      code += '\n' + patches[name].map((s) => `exports.${s} = ${s};`).join('\n') + '\n';
      return { code };
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [mediapipeWorkaround(), react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
