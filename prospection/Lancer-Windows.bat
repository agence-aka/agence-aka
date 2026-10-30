@echo off
REM Double-clique ce fichier pour ouvrir la carte de prospection (Windows).
cd /d "%~dp0"
where python >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:8765/index.html"
  python -m http.server 8765 --bind 127.0.0.1
) else (
  start "" "%~dp0index.html"
)
