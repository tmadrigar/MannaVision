// scripts/setup-mediapipe.mjs
//
// 1) Copia os arquivos do MediaPipe Hands (WASM, modelos .tflite e loaders) de
//    node_modules para public/mediapipe/hands, de onde a aplicação os carrega
//    via `locateFile: (file) => /mediapipe/hands/${file}`.
// 2) Copia o WASM do MediaPipe Tasks Vision para public/mediapipe/tasks/wasm e baixa
//    (uma única vez) os modelos de rosto e mão usados pelo Espelho Raio-X.
//
// Executado automaticamente no `npm install` (postinstall) e disponível via
// `npm run setup:mediapipe`. A pasta de destino fica fora do git.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function copyDir(src, dest, label) {
  if (!existsSync(src)) {
    console.error(`[setup-mediapipe] ${label} não encontrado em node_modules. Rode \`npm install\` primeiro.`);
    return false;
  }
  mkdirSync(dest, { recursive: true });
  let copied = 0;
  for (const name of readdirSync(src)) {
    const from = join(src, name);
    const to = join(dest, name);
    if (!statSync(from).isFile()) continue;
    const fromSize = statSync(from).size;
    const toSize = existsSync(to) ? statSync(to).size : -1;
    if (toSize === fromSize) continue;
    // Arquivo menor em node_modules = provavelmente cortado (pasta copiada/movida pela metade).
    // Um modelo .tflite cortado faz o rastreamento falhar e pode travar o navegador; mantém o de public.
    if (toSize > fromSize) {
      console.warn(
        `[setup-mediapipe] AVISO: ${label}/${name} está menor em node_modules (${fromSize} bytes) que em public (${toSize} bytes); ` +
          'mantendo o de public. Se o problema persistir, apague node_modules e rode `npm install`.'
      );
      continue;
    }
    cpSync(from, to);
    copied++;
  }
  console.log(
    copied > 0
      ? `[setup-mediapipe] ${copied} arquivo(s) copiado(s) de ${label}`
      : `[setup-mediapipe] ${label} já está atualizado`
  );
  return true;
}

// --- 1. MediaPipe Hands (legado) ---
if (!copyDir(join(root, 'node_modules', '@mediapipe', 'hands'), join(root, 'public', 'mediapipe', 'hands'), '@mediapipe/hands')) {
  process.exit(1);
}

// --- 2. MediaPipe Tasks Vision (Espelho Raio-X) ---
const tasksDir = join(root, 'public', 'mediapipe', 'tasks');
copyDir(join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm'), join(tasksDir, 'wasm'), '@mediapipe/tasks-vision/wasm');

const MODELS = [
  {
    file: 'face_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  },
  {
    file: 'hand_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  },
];

for (const m of MODELS) {
  const to = join(tasksDir, m.file);
  if (existsSync(to) && statSync(to).size > 100_000) continue;
  try {
    console.log(`[setup-mediapipe] Baixando ${m.file}...`);
    const res = await fetch(m.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(to, buf);
    console.log(`[setup-mediapipe] ${m.file} baixado (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
  } catch (err) {
    // Sem internet o resto do MannaVision continua funcionando; só o Espelho Raio-X fica indisponível
    console.warn(`[setup-mediapipe] Não foi possível baixar ${m.file}: ${err.message}. O Espelho Raio-X precisa dele.`);
  }
}
