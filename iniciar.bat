@echo off
setlocal EnableExtensions
title MannaVision
cd /d "%~dp0handraw-pipe"

echo.
echo  =============================================
echo   MannaVision - Interacao Gestual ^& IA
echo  =============================================
echo.

REM ---------------------------------------------------------------
REM 1) Node.js
REM ---------------------------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Node.js nao encontrado.
    echo        Instale a versao LTS em https://nodejs.org e execute este arquivo novamente.
    echo.
    pause
    exit /b 1
)

REM ---------------------------------------------------------------
REM 2) Dependencias do frontend (apenas na primeira execucao)
REM ---------------------------------------------------------------
if not exist "node_modules\" (
    echo [1/3] Instalando dependencias ^(primeira execucao, pode levar alguns minutos^)...
    call npm install
    if errorlevel 1 (
        echo [ERRO] Falha ao instalar as dependencias. Verifique sua conexao e tente novamente.
        pause
        exit /b 1
    )
) else (
    echo [1/3] Dependencias ja instaladas.
)

REM Garante os arquivos do MediaPipe Hands em public\mediapipe\hands
if not exist "public\mediapipe\hands\hands.js" (
    call npm run setup:mediapipe
)

REM ---------------------------------------------------------------
REM 3) Servidor de IA generativa (opcional - precisa de .env com HUGGING_FACE_TOKEN)
REM ---------------------------------------------------------------
if not exist ".env" (
    echo [2/3] IA generativa desativada ^(crie handraw-pipe\.env a partir de .env.example para ativar^).
    goto :frontend
)

where python >nul 2>&1
if errorlevel 1 (
    echo [2/3] IA generativa desativada: Python nao encontrado ^(https://www.python.org/downloads/^).
    goto :frontend
)

if not exist ".venv\Scripts\python.exe" (
    echo [2/3] Preparando ambiente Python da IA ^(primeira execucao^)...
    python -m venv .venv
    if errorlevel 1 (
        echo [AVISO] Nao foi possivel criar o ambiente virtual. IA desativada.
        goto :frontend
    )
    ".venv\Scripts\python.exe" -m pip install --quiet -r requirements.txt
    if errorlevel 1 (
        echo [AVISO] Falha ao instalar as dependencias Python. IA desativada.
        goto :frontend
    )
)

echo [2/3] Iniciando servidor de IA em http://127.0.0.1:5000 ^(janela separada^)...
start "MannaVision - Servidor de IA" cmd /k ".venv\Scripts\python.exe app.py"

:frontend
REM ---------------------------------------------------------------
REM 4) Aplicacao (o navegador abre sozinho quando estiver pronta)
REM ---------------------------------------------------------------
echo [3/3] Iniciando o MannaVision em http://localhost:5173 ...
echo        O navegador sera aberto automaticamente.
echo        Para encerrar, feche esta janela ou pressione Ctrl+C.
echo.
call npx vite --open --port 5173 --strictPort

endlocal
