#!/usr/bin/env bash
# MannaVision - lançador para macOS / Linux
# Uso: ./iniciar.sh   (na primeira vez: chmod +x iniciar.sh)
set -e
cd "$(dirname "$0")/handraw-pipe"

echo
echo " ============================================="
echo "  MannaVision - Interação Gestual & IA"
echo " ============================================="
echo

# 1) Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "[ERRO] Node.js não encontrado. Instale a versão LTS em https://nodejs.org"
  exit 1
fi

# 2) Dependências do frontend (apenas na primeira execução)
if [ ! -d node_modules ]; then
  echo "[1/3] Instalando dependências (primeira execução, pode levar alguns minutos)..."
  npm install
else
  echo "[1/3] Dependências já instaladas."
fi
[ -f public/mediapipe/hands/hands.js ] || npm run setup:mediapipe

# 3) Servidor de IA generativa (opcional - precisa de .env com HUGGING_FACE_TOKEN)
AI_PID=""
if [ -f .env ] && command -v python3 >/dev/null 2>&1; then
  if [ ! -x .venv/bin/python ]; then
    echo "[2/3] Preparando ambiente Python da IA (primeira execução)..."
    python3 -m venv .venv
    .venv/bin/python -m pip install --quiet -r requirements.txt
  fi
  echo "[2/3] Iniciando servidor de IA em http://127.0.0.1:5000 ..."
  .venv/bin/python app.py &
  AI_PID=$!
  trap '[ -n "$AI_PID" ] && kill "$AI_PID" 2>/dev/null' EXIT
else
  echo "[2/3] IA generativa desativada (crie handraw-pipe/.env a partir de .env.example para ativar)."
fi

# 4) Aplicação (o navegador abre sozinho quando estiver pronta)
echo "[3/3] Iniciando o MannaVision em http://localhost:5173 ..."
echo "       Para encerrar, pressione Ctrl+C."
echo
npx vite --open --port 5173 --strictPort
