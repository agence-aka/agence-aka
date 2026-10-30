#!/bin/bash
# Double-clique ce fichier pour ouvrir la carte de prospection (Mac).
cd "$(dirname "$0")"
PORT=8765
( sleep 1; open "http://localhost:$PORT/index.html" ) &
python3 -m http.server $PORT --bind 127.0.0.1
