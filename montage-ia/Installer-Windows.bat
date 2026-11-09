@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Installation - Montage IA AKA
echo ==================================================
echo    Installation du Montage IA - Agence AKA
echo ==================================================
echo.

REM ---------- 1. Python ----------
set "PY="
py -3 --version >nul 2>nul && set "PY=py -3"
if not defined PY (python --version >nul 2>nul && set "PY=python")
if not defined PY (
  echo [1/4] Python n'est pas installe. Installation avec winget...
  winget install -e --id Python.Python.3.12 --scope user --accept-source-agreements --accept-package-agreements
  echo.
  echo Python vient d'etre installe.
  echo FERME cette fenetre et relance Installer-Windows.bat
  pause
  exit /b 0
)
echo [1/4] Python OK

REM ---------- 2. FFmpeg ----------
where ffmpeg >nul 2>nul && goto ffmpeg_ok
if exist "%LOCALAPPDATA%\Microsoft\WinGet\Links\ffmpeg.exe" goto ffmpeg_ok
echo [2/4] Installation de FFmpeg avec winget...
winget install -e --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements
:ffmpeg_ok
echo [2/4] FFmpeg OK

REM ---------- 3. Environnement Python + modules ----------
if not exist ".venv\Scripts\python.exe" (
  echo [3/4] Creation de l'environnement Python...
  %PY% -m venv .venv
)
".venv\Scripts\python.exe" -m pip install --upgrade pip >nul
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 (
  echo.
  echo ERREUR pendant l'installation des modules Python.
  pause
  exit /b 1
)
echo [3/4] Modules OK

echo [4/4] Telechargement du modele de transcription (une seule fois)...
".venv\Scripts\python.exe" -c "import json;from faster_whisper import WhisperModel;c=json.load(open('config.json',encoding='utf-8'));WhisperModel(c.get('modele_whisper','small'),device='cpu',compute_type='int8')"

REM ---------- Cle API Claude (optionnelle) ----------
if exist "cle-api-anthropic.txt" goto fin
echo.
echo Pour les clips IA (Claude choisit les meilleurs moments), colle ta cle API Claude.
echo Tu la trouves sur https://platform.claude.com  (sinon appuie juste sur Entree)
set "CLE="
set /p "CLE=Cle API : "
if defined CLE (
  > "cle-api-anthropic.txt" echo %CLE%
  echo Cle enregistree.
)

:fin
echo.
echo ==================================================
echo  Installation terminee !
echo  Depose tes videos dans le dossier "entree" puis
echo  double-clique sur Lancer-Montage-Windows.bat
echo  (ou glisse une video directement dessus)
echo ==================================================
pause
