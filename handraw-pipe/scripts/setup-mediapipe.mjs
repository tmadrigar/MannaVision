// scripts/setup-mediapipe.mjs
//
// Copia os arquivos do MediaPipe Hands (WASM, modelos .tflite e loaders) de
// node_modules para public/mediapipe/hands, de onde a aplicação os carrega
// via `locateFile: (file) => /mediapipe/hands/${file}`.
//
// Executado automaticamente no `npm install` (postinstall) e disponível via
// `npm run setup:mediapipe`. A pasta de destino fica fora do git.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', '@mediapipe', 'hands');
const dest = join(root, 'public', 'mediapipe', 'hands');

if (!existsSync(src)) {
  console.error('[setup-mediapipe] Pacote @mediapipe/hands não encontrado. Rode `npm install` primeiro.');
  process.exit(1);
}

mkdirSync(dest, { recursive: true });

let copied = 0;
for (const name of readdirSync(src)) {
  const from = join(src, name);
  const to = join(dest, name);
  if (!statSync(from).isFile()) continue;
  const upToDate = existsSync(to) && statSync(to).size === statSync(from).size;
  if (upToDate) continue;
  cpSync(from, to);
  copied++;
}

console.log(
  copied > 0
    ? `[setup-mediapipe] ${copied} arquivo(s) copiado(s) para public/mediapipe/hands`
    : '[setup-mediapipe] public/mediapipe/hands já está atualizado'
);
