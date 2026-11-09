#!/bin/bash
# Double-clic sur Mac (ou glisse des vidéos dessus).
cd "$(dirname "$0")"
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "FFmpeg manquant : installe-le avec  brew install ffmpeg"; read -r; exit 1
fi
if [ ! -x ".venv/bin/python" ]; then
  echo "Première utilisation : installation…"
  python3 -m venv .venv && .venv/bin/pip install -q --upgrade pip && .venv/bin/pip install -r requirements.txt || { read -r; exit 1; }
fi
.venv/bin/python montage_ia.py "$@"
open sortie
echo; echo "Appuie sur Entrée pour fermer."; read -r
