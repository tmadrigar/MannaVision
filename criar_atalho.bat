@echo off
setlocal
cd /d "%~dp0"
echo ========================================================
echo  MannaVision - Criando Atalho na Area de Trabalho
echo ========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\create_shortcut.ps1"

if errorlevel 1 (
    echo.
    echo [ERRO] Nao foi possivel criar o atalho.
    pause
    exit /b 1
)

echo.
echo [SUCESSO] Atalho criado na sua Area de Trabalho!
echo.
pause
