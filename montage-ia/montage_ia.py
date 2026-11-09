#!/usr/bin/env python3
"""
Montage IA — Agence AKA
=======================

Dépose une vidéo dans le dossier « entree » (ou glisse-la sur le lanceur) et
le script fait le montage tout seul :

  1. Transcription de la voix (Whisper, en local, gratuit).
  2. Coupe des silences et des « euh / hum ».
  3. Format vertical 9:16 pour Reels / TikTok / Shorts (ou format d'origine).
  4. Sous-titres animés mot par mot incrustés dans la vidéo (+ fichier .srt).
  5. Logo et musique de fond (optionnels, dans le dossier « assets »).
  6. Volume de la voix normalisé pour les réseaux sociaux.
  7. Avec une clé API Claude : l'IA choisit les meilleurs moments et crée des
     clips courts, avec titre, description et hashtags.

Fonctionne sur Windows, Mac et Linux. Réglages dans config.json.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ICI = Path(__file__).resolve().parent
EXTENSIONS_VIDEO = {".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm", ".mts"}

CONFIG_PAR_DEFAUT = {
    "dossier_entree": "entree",
    "dossier_sortie": "sortie",
    "dossier_termine": "entree/traitees",
    "langue": "fr",
    "modele_whisper": "small",
    "appareil_whisper": "cpu",
    "format": "vertical_flou",
    "couper_silences": True,
    "silence_max_secondes": 0.6,
    "marge_secondes": 0.12,
    "retirer_mots_parasites": True,
    "mots_parasites": ["euh", "heu", "hum", "hmm", "bah", "ben", "euhm", "mmh"],
    "sous_titres": True,
    "sous_titres_majuscules": True,
    "sous_titres_mots_par_ligne": 3,
    "sous_titres_police": "Arial Black",
    "sous_titres_taille": 0,
    "sous_titres_couleur": "#FFFFFF",
    "sous_titres_couleur_mot_actif": "#FFD400",
    "sous_titres_position_hauteur": 0.70,
    "logo": True,
    "logo_largeur_pourcent": 16,
    "musique": True,
    "musique_volume": 0.10,
    "normaliser_volume": True,
    "qualite_crf": 20,
    "images_par_seconde": 30,
    "version_complete": True,
    "clips_ia": True,
    "nombre_clips": 3,
    "duree_clip_secondes": 45,
    "modele_claude": "claude-opus-5-5",
    "contexte_marque": "Agence AKA, agence marketing au Québec. Ton dynamique, proche des commerçants locaux.",
    "deplacer_videos_traitees": True,
}


# --------------------------------------------------------------------------- #
#  Utilitaires
# --------------------------------------------------------------------------- #

def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def charger_config() -> dict:
    cfg = dict(CONFIG_PAR_DEFAUT)
    chemin = ICI / "config.json"
    if chemin.exists():
        with open(chemin, encoding="utf-8") as f:
            cfg.update({k: v for k, v in json.load(f).items() if not k.startswith("_")})
    return cfg


def chemin_relatif(valeur: str) -> Path:
    p = Path(valeur)
    return p if p.is_absolute() else ICI / p


def trouver_programme(nom: str) -> str:
    """Trouve ffmpeg / ffprobe, y compris les emplacements winget sous Windows."""
    trouve = shutil.which(nom)
    if trouve:
        return trouve
    candidats = [ICI / "outils" / f"{nom}.exe", ICI / "outils" / nom]
    local = os.environ.get("LOCALAPPDATA")
    if local:
        candidats.append(Path(local) / "Microsoft" / "WinGet" / "Links" / f"{nom}.exe")
        paquets = Path(local) / "Microsoft" / "WinGet" / "Packages"
        if paquets.exists():
            candidats += sorted(paquets.glob(f"Gyan.FFmpeg*/**/bin/{nom}.exe"))
    for dossier in ("/opt/homebrew/bin", "/usr/local/bin"):
        candidats.append(Path(dossier) / nom)
    for c in candidats:
        if c.exists():
            return str(c)
    raise SystemExit(
        f"\n❌ {nom} est introuvable.\n"
        "   Windows : lance « Installer-Windows.bat » (ou : winget install Gyan.FFmpeg)\n"
        "   Mac     : brew install ffmpeg\n"
    )


FFMPEG = ""
FFPROBE = ""


def executer(cmd: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess:
    res = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True,
                         encoding="utf-8", errors="replace")
    if res.returncode != 0:
        fin = "\n".join(res.stderr.strip().splitlines()[-25:])
        raise RuntimeError(f"Commande en échec : {Path(cmd[0]).name}\n{fin}")
    return res


def version_ffmpeg() -> int:
    sortie = executer([FFMPEG, "-version"]).stdout
    m = re.search(r"ffmpeg version n?(\d+)", sortie)
    return int(m.group(1)) if m else 6


def infos_video(chemin: Path) -> dict:
    res = executer([FFPROBE, "-v", "error", "-print_format", "json",
                    "-show_streams", "-show_format", str(chemin)])
    data = json.loads(res.stdout)
    video = next((s for s in data["streams"] if s.get("codec_type") == "video"), None)
    audio = next((s for s in data["streams"] if s.get("codec_type") == "audio"), None)
    if video is None:
        raise RuntimeError("Aucune piste vidéo dans ce fichier.")
    w, h = int(video["width"]), int(video["height"])
    rotation = 0
    for sd in video.get("side_data_list", []) or []:
        if "rotation" in sd:
            rotation = int(float(sd["rotation"]))
    rotation = rotation or int(video.get("tags", {}).get("rotate", 0) or 0)
    if abs(rotation) % 180 == 90:
        w, h = h, w
    return {"largeur": w, "hauteur": h, "audio": audio is not None,
            "duree": float(data["format"].get("duration", 0) or 0)}


# --------------------------------------------------------------------------- #
#  1. Transcription (Whisper local)
# --------------------------------------------------------------------------- #

_modele_whisper = None


def transcrire(video: Path, cfg: dict) -> list[dict]:
    global _modele_whisper
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise SystemExit("\n❌ faster-whisper n'est pas installé. Lance d'abord l'installateur.\n")

    if _modele_whisper is None:
        log(f"Chargement du modèle Whisper « {cfg['modele_whisper']} » "
            "(le premier lancement télécharge le modèle, ça peut prendre quelques minutes)…")
        appareil = cfg["appareil_whisper"]
        _modele_whisper = WhisperModel(cfg["modele_whisper"], device=appareil,
                                       compute_type="int8" if appareil == "cpu" else "default")

    log("Transcription de la voix…")
    segments, _ = _modele_whisper.transcribe(
        str(video), language=cfg["langue"] or None, word_timestamps=True,
        vad_filter=True, beam_size=5,
    )
    resultat = []
    for i, seg in enumerate(segments):
        mots = [{"debut": float(m.start), "fin": float(m.end), "mot": m.word.strip()}
                for m in (seg.words or []) if m.word.strip()]
        if mots:
            resultat.append({"id": i, "debut": float(seg.start), "fin": float(seg.end),
                             "texte": seg.text.strip(), "mots": mots})
    for i, s in enumerate(resultat):
        s["id"] = i
    log(f"  {sum(len(s['mots']) for s in resultat)} mots transcrits.")
    return resultat


# --------------------------------------------------------------------------- #
#  2. Coupe des silences et mots parasites
# --------------------------------------------------------------------------- #

def nettoyer_mot(mot: str) -> str:
    return re.sub(r"[^\w']", "", mot.lower())


def filtrer_mots(mots: list[dict], cfg: dict) -> list[dict]:
    if not cfg["retirer_mots_parasites"]:
        return list(mots)
    parasites = {nettoyer_mot(p) for p in cfg["mots_parasites"]}
    return [m for m in mots if nettoyer_mot(m["mot"]) not in parasites]


def construire_plages(mots: list[dict], cfg: dict, duree_totale: float) -> list[tuple[float, float]]:
    """Regroupe les mots en plages continues ; un trou plus long que
    silence_max_secondes est coupé."""
    if not mots:
        return []
    if not cfg["couper_silences"]:
        return [(max(0.0, mots[0]["debut"] - 0.3), min(duree_totale, mots[-1]["fin"] + 0.5))]
    marge = cfg["marge_secondes"]
    silence_max = cfg["silence_max_secondes"]
    plages: list[list[float]] = []
    for m in mots:
        debut = max(0.0, m["debut"] - marge)
        fin = min(duree_totale, m["fin"] + marge)
        if plages and debut - plages[-1][1] <= silence_max:
            plages[-1][1] = max(plages[-1][1], fin)
        else:
            plages.append([debut, fin])
    # fusionne les chevauchements et enlève les micro-plages
    propres: list[list[float]] = []
    for d, f in plages:
        if propres and d <= propres[-1][1]:
            propres[-1][1] = max(propres[-1][1], f)
        elif f - d >= 0.15:
            propres.append([d, f])
    return [(round(d, 3), round(f, 3)) for d, f in propres]


def recaler_mots(mots: list[dict], plages: list[tuple[float, float]]) -> list[dict]:
    """Convertit le temps des mots vers la nouvelle timeline (après coupes)."""
    sortie, decalage, j = [], 0.0, 0
    for d, f in plages:
        while j < len(mots) and mots[j]["fin"] <= f + 1e-3:
            m = mots[j]
            if m["debut"] >= d - 1e-3:
                sortie.append({"mot": m["mot"],
                               "debut": decalage + max(0.0, m["debut"] - d),
                               "fin": decalage + min(f, m["fin"]) - d})
            j += 1
        decalage += f - d
    return sortie


# --------------------------------------------------------------------------- #
#  3. Sous-titres (ASS animé + SRT)
# --------------------------------------------------------------------------- #

def couleur_ass(hex_couleur: str) -> str:
    h = hex_couleur.lstrip("#")
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H00{b}{g}{r}".upper()


def temps_ass(t: float) -> str:
    cs = int(round(max(0.0, t) * 100))
    return f"{cs // 360000}:{cs // 6000 % 60:02d}:{cs // 100 % 60:02d}.{cs % 100:02d}"


def temps_srt(t: float) -> str:
    ms = int(round(max(0.0, t) * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def grouper_lignes(mots: list[dict], par_ligne: int) -> list[list[dict]]:
    lignes, courante = [], []
    for m in mots:
        if courante and (len(courante) >= par_ligne or m["debut"] - courante[-1]["fin"] > 0.5):
            lignes.append(courante)
            courante = []
        courante.append(m)
        if re.search(r"[.!?]$", m["mot"]):
            lignes.append(courante)
            courante = []
    if courante:
        lignes.append(courante)
    return lignes


def echapper_ass(texte: str) -> str:
    return texte.replace("\\", "").replace("{", "(").replace("}", ")")


def ecrire_sous_titres(mots: list[dict], dossier: Path, largeur: int, hauteur: int,
                       cfg: dict) -> tuple[Path, str]:
    taille = cfg["sous_titres_taille"] or max(28, int(min(largeur, hauteur) * 0.075))
    marge_v = int(hauteur * (1 - cfg["sous_titres_position_hauteur"]))
    blanc = couleur_ass(cfg["sous_titres_couleur"])
    actif = couleur_ass(cfg["sous_titres_couleur_mot_actif"])
    maj = cfg["sous_titres_majuscules"]
    lignes = grouper_lignes(mots, max(1, int(cfg["sous_titres_mots_par_ligne"])))

    ass = [
        "[Script Info]", "ScriptType: v4.00+", f"PlayResX: {largeur}", f"PlayResY: {hauteur}",
        "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, "
        "BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, "
        "BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: AKA,{cfg['sous_titres_police']},{taille},{blanc},{blanc},&H00000000,&H64000000,"
        f"-1,0,0,0,100,100,0,0,1,{max(2, taille // 10)},{max(1, taille // 25)},2,"
        f"{int(largeur * 0.08)},{int(largeur * 0.08)},{marge_v},1",
        "", "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    srt, n = [], 0
    for ligne in lignes:
        textes = [echapper_ass(m["mot"].upper() if maj else m["mot"]) for m in ligne]
        for i, m in enumerate(ligne):
            fin = ligne[i + 1]["debut"] if i + 1 < len(ligne) else m["fin"] + 0.15
            morceaux = [
                (f"{{\\c{actif}\\fscx108\\fscy108}}{t}{{\\c{blanc}\\fscx100\\fscy100}}" if k == i else t)
                for k, t in enumerate(textes)
            ]
            ass.append(f"Dialogue: 0,{temps_ass(m['debut'])},{temps_ass(fin)},AKA,,0,0,0,,"
                       + " ".join(morceaux))
        n += 1
        srt += [str(n), f"{temps_srt(ligne[0]['debut'])} --> {temps_srt(ligne[-1]['fin'] + 0.15)}",
                " ".join(m["mot"] for m in ligne), ""]

    fichier_ass = dossier / "sous-titres.ass"
    fichier_ass.write_text("\n".join(ass) + "\n", encoding="utf-8")
    return fichier_ass, "\n".join(srt)


# --------------------------------------------------------------------------- #
#  4. Rendu ffmpeg
# --------------------------------------------------------------------------- #

def dimensions_sortie(info: dict, cfg: dict) -> tuple[int, int]:
    if cfg["format"] in ("vertical", "vertical_flou"):
        return 1080, 1920
    if cfg["format"] == "carre":
        return 1080, 1080
    w, h = info["largeur"], info["hauteur"]
    if max(w, h) > 1920:  # limite à 1080p
        ratio = 1920 / max(w, h)
        w, h = w * ratio, h * ratio
    return int(w) // 2 * 2, int(h) // 2 * 2


def trouver_asset(noms: list[str]) -> Path | None:
    dossier = ICI / "assets"
    for nom in noms:
        for p in sorted(dossier.glob(nom)):
            if p.is_file():
                return p
    return None


def rendre(source: Path, plages: list[tuple[float, float]], sortie: Path,
           info: dict, cfg: dict, ass: Path | None, travail: Path) -> None:
    W, H = dimensions_sortie(info, cfg)
    fps = int(cfg["images_par_seconde"])
    selection = "+".join(f"between(t,{d:.3f},{f:.3f})" for d, f in plages)

    entrees = ["-i", str(source.resolve())]
    idx = 1
    logo = trouver_asset(["logo.png", "logo.*"]) if cfg["logo"] else None
    musique = trouver_asset(["musique.mp3", "musique.*", "*.mp3", "*.m4a", "*.wav"]) if cfg["musique"] else None
    idx_logo = idx_musique = None
    if logo:
        entrees += ["-i", str(logo.resolve())]
        idx_logo, idx = idx, idx + 1
    if musique:
        entrees += ["-stream_loop", "-1", "-i", str(musique.resolve())]
        idx_musique, idx = idx, idx + 1

    f = []
    # Vidéo : cadence fixe -> sélection des plages -> horodatage recalculé
    f.append(f"[0:v]fps={fps},select='{selection}',setpts=N/{fps}/TB,setsar=1[vsel]")
    if cfg["format"] == "vertical_flou":
        f.append("[vsel]split[fond][avant]")
        f.append(f"[fond]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
                 f"boxblur=25:3,eq=brightness=-0.08[fondflou]")
        f.append(f"[avant]scale={W}:{H}:force_original_aspect_ratio=decrease[premier]")
        f.append("[fondflou][premier]overlay=(W-w)/2:(H-h)/2[vfmt]")
    elif cfg["format"] in ("vertical", "carre"):
        f.append(f"[vsel]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}[vfmt]")
    else:
        f.append(f"[vsel]scale={W}:{H}[vfmt]")
    courant = "vfmt"
    if ass:
        f.append(f"[{courant}]subtitles={ass.name}[vsub]")
        courant = "vsub"
    if idx_logo is not None:
        lw = int(W * cfg["logo_largeur_pourcent"] / 100) // 2 * 2
        marge = int(W * 0.04)
        f.append(f"[{idx_logo}:v]scale={lw}:-1,format=rgba,colorchannelmixer=aa=0.9[logo]")
        f.append(f"[{courant}][logo]overlay=W-w-{marge}:{marge}[vlogo]")
        courant = "vlogo"
    f.append(f"[{courant}]format=yuv420p[vout]")

    # Audio
    f.append(f"[0:a]aselect='{selection}',asetpts=N/SR/TB[asel]")
    voix = "asel"
    if cfg["normaliser_volume"]:
        f.append("[asel]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[anorm]")
        voix = "anorm"
    if idx_musique is not None:
        f.append(f"[{idx_musique}:a]volume={cfg['musique_volume']},aresample=48000[mus]")
        f.append(f"[{voix}][mus]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]")
    else:
        f.append(f"[{voix}]anull[aout]")

    script = travail / "filtres.txt"
    script.write_text(";\n".join(f), encoding="utf-8")
    option_script = ["-/filter_complex", script.name] if version_ffmpeg() >= 7 \
        else ["-filter_complex_script", script.name]

    cmd = [FFMPEG, "-y", "-hide_banner", "-loglevel", "error", *entrees, *option_script,
           "-map", "[vout]", "-map", "[aout]",
           "-c:v", "libx264", "-preset", "medium", "-crf", str(cfg["qualite_crf"]),
           "-r", str(fps), "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
           "-movflags", "+faststart", "-shortest", str(sortie.resolve())]
    executer(cmd, cwd=travail)


# --------------------------------------------------------------------------- #
#  5. Clips IA (Claude choisit les meilleurs moments)
# --------------------------------------------------------------------------- #

def lire_cle_api() -> str | None:
    cle = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    fichier = ICI / "cle-api-anthropic.txt"
    if not cle and fichier.exists():
        cle = fichier.read_text(encoding="utf-8").strip()
    return cle or None


def choisir_clips_ia(segments: list[dict], cfg: dict, nom_video: str) -> dict | None:
    cle = lire_cle_api()
    if not cle:
        log("Pas de clé API Claude → clips IA ignorés (voir README pour l'ajouter).")
        return None
    try:
        import anthropic
        from pydantic import BaseModel
    except ImportError:
        log("Module « anthropic » manquant → relance l'installateur. Clips IA ignorés.")
        return None

    class Clip(BaseModel):
        titre: str
        accroche: str
        segments: list[int]
        description: str
        hashtags: list[str]

    class Resultat(BaseModel):
        titre_video_complete: str
        description_video_complete: str
        hashtags_video_complete: list[str]
        clips: list[Clip]

    transcription = "\n".join(
        f"[{s['id']}] ({s['debut']:.1f}s → {s['fin']:.1f}s) {s['texte']}" for s in segments
    )
    consigne = f"""Tu es monteur vidéo pour les réseaux sociaux (Reels, TikTok, Shorts).
Marque : {cfg['contexte_marque']}
Vidéo : « {nom_video} »

Voici la transcription, découpée en segments numérotés avec leur minutage :
<transcription>
{transcription}
</transcription>

1. Écris un titre, une description (2-3 phrases, en français québécois naturel) et 5 à 8 hashtags pour la vidéo complète.
2. Choisis jusqu'à {cfg['nombre_clips']} clips courts d'environ {cfg['duree_clip_secondes']} secondes chacun (entre {int(cfg['duree_clip_secondes'] * 0.6)} et {int(cfg['duree_clip_secondes'] * 1.4)} s).
   - Chaque clip doit se comprendre seul et commencer par une phrase qui accroche dès la première seconde.
   - Donne les numéros des segments à garder, dans l'ordre chronologique. Tu peux sauter des segments faibles à l'intérieur d'un clip si la phrase reste fluide.
   - Évite que deux clips se répètent. Si la vidéo est trop courte, propose moins de clips.
   - Pour chaque clip : titre court, accroche (texte à l'écran), description et 5 à 8 hashtags."""

    log(f"Claude analyse la transcription pour choisir les meilleurs moments…")
    client = anthropic.Anthropic(api_key=cle)
    try:
        rep = client.beta.messages.parse(
            model=cfg["modele_claude"],
            max_tokens=16000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "medium"},
            messages=[{"role": "user", "content": consigne}],
            output_format=Resultat,
        )
    except anthropic.AuthenticationError:
        log("❌ Clé API Claude refusée. Vérifie la clé. Clips IA ignorés.")
        return None
    except anthropic.APIConnectionError:
        log("❌ Pas de connexion à Claude (internet ?). Clips IA ignorés.")
        return None
    except anthropic.APIStatusError as e:
        log(f"❌ Erreur Claude ({e.status_code}). Clips IA ignorés.")
        return None

    if rep.stop_reason == "refusal" or rep.parsed_output is None:
        log("Claude n'a pas pu proposer de clips pour cette vidéo. Clips IA ignorés.")
        return None
    return rep.parsed_output.model_dump()


# --------------------------------------------------------------------------- #
#  Traitement d'une vidéo
# --------------------------------------------------------------------------- #

def nom_fichier(texte: str) -> str:
    texte = re.sub(r"[^\w\- ]", "", texte, flags=re.UNICODE).strip().replace(" ", "-")
    return texte[:60] or "clip"


def produire(source: Path, mots: list[dict], sortie: Path, info: dict, cfg: dict,
             travail: Path) -> float:
    plages = construire_plages(mots, cfg, info["duree"])
    if not plages:
        raise RuntimeError("Aucune parole détectée à garder.")
    ass = None
    if cfg["sous_titres"]:
        W, H = dimensions_sortie(info, cfg)
        mots_recales = recaler_mots(mots, plages)
        ass, srt = ecrire_sous_titres(mots_recales, travail, W, H, cfg)
        sortie.with_suffix(".srt").write_text(srt, encoding="utf-8")
    rendre(source, plages, sortie, info, cfg, ass, travail)
    return sum(f - d for d, f in plages)


def traiter(video: Path, cfg: dict) -> None:
    log(f"▶ {video.name}")
    info = infos_video(video)
    if not info["audio"]:
        raise RuntimeError("Cette vidéo n'a pas de son : le montage IA a besoin de la voix.")

    dossier_sortie = chemin_relatif(cfg["dossier_sortie"]) / video.stem
    dossier_sortie.mkdir(parents=True, exist_ok=True)

    segments = transcrire(video, cfg)
    if not segments:
        raise RuntimeError("Aucune parole détectée dans la vidéo.")
    (dossier_sortie / "transcription.txt").write_text(
        "\n".join(f"[{s['debut']:.1f}s] {s['texte']}" for s in segments), encoding="utf-8")

    with tempfile.TemporaryDirectory(prefix="montage_ia_") as tmp:
        travail = Path(tmp)

        if cfg["version_complete"]:
            log("Montage de la version complète…")
            mots = filtrer_mots([m for s in segments for m in s["mots"]], cfg)
            sortie = dossier_sortie / f"{video.stem}_monte.mp4"
            duree = produire(video, mots, sortie, info, cfg, travail)
            log(f"  ✔ {sortie.name}  ({info['duree']:.0f}s → {duree:.0f}s)")

        ia = choisir_clips_ia(segments, cfg, video.stem) if cfg["clips_ia"] else None
        if ia:
            textes = [f"VIDÉO COMPLÈTE\nTitre : {ia['titre_video_complete']}\n\n"
                      f"{ia['description_video_complete']}\n\n{' '.join(ia['hashtags_video_complete'])}\n"]
            par_id = {s["id"]: s for s in segments}
            for n, clip in enumerate(ia["clips"], 1):
                ids = sorted(i for i in set(clip["segments"]) if i in par_id)
                if not ids:
                    continue
                mots = filtrer_mots([m for i in ids for m in par_id[i]["mots"]], cfg)
                sortie = dossier_sortie / f"clip{n}_{nom_fichier(clip['titre'])}.mp4"
                log(f"Montage du clip {n} : « {clip['titre']} »…")
                try:
                    duree = produire(video, mots, sortie, info, cfg, travail)
                except RuntimeError as e:
                    log(f"  ⚠ clip {n} ignoré : {e}")
                    continue
                log(f"  ✔ {sortie.name}  ({duree:.0f}s)")
                textes.append(f"CLIP {n} — {sortie.name}\nTitre : {clip['titre']}\n"
                              f"Accroche : {clip['accroche']}\n\n{clip['description']}\n\n"
                              f"{' '.join(clip['hashtags'])}\n")
            (dossier_sortie / "descriptions.txt").write_text(
                ("\n" + "-" * 50 + "\n\n").join(textes), encoding="utf-8")

    if cfg["deplacer_videos_traitees"] and video.parent == chemin_relatif(cfg["dossier_entree"]):
        termine = chemin_relatif(cfg["dossier_termine"])
        termine.mkdir(parents=True, exist_ok=True)
        shutil.move(str(video), str(termine / video.name))
    log(f"✅ Terminé → {dossier_sortie}")


def main() -> int:
    global FFMPEG, FFPROBE
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    cfg = charger_config()
    FFMPEG, FFPROBE = trouver_programme("ffmpeg"), trouver_programme("ffprobe")

    entree = chemin_relatif(cfg["dossier_entree"])
    entree.mkdir(parents=True, exist_ok=True)
    chemin_relatif(cfg["dossier_sortie"]).mkdir(parents=True, exist_ok=True)

    if len(sys.argv) > 1:
        videos = [Path(a) for a in sys.argv[1:]]
    else:
        videos = sorted(p for p in entree.iterdir()
                        if p.is_file() and p.suffix.lower() in EXTENSIONS_VIDEO)
    videos = [v for v in videos if v.suffix.lower() in EXTENSIONS_VIDEO and v.exists()]
    if not videos:
        print(f"\nAucune vidéo à traiter. Dépose tes vidéos dans :\n  {entree}\n"
              "ou glisse-les directement sur le lanceur.\n")
        return 0

    log(f"{len(videos)} vidéo(s) à monter.")
    erreurs = 0
    for v in videos:
        try:
            traiter(v, cfg)
        except Exception as e:  # on continue avec les autres vidéos
            erreurs += 1
            log(f"❌ {v.name} : {e}")
    log(f"Fini : {len(videos) - erreurs} réussie(s), {erreurs} en erreur.")
    return 1 if erreurs else 0


if __name__ == "__main__":
    sys.exit(main())
