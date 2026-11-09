@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Montage IA - Agence AKA
if not exist ".venv\Scripts\python.exe" (
  echo Lance d'abord Installer-Windows.bat
  pause
  exit /b 1
)
".venv\Scripts\python.exe" montage_ia.py %*
echo.
start "" "%~dp0sortie"
pause
