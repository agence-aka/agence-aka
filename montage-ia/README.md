# Montage IA — Agence AKA

Tu déposes une vidéo brute (face caméra, entrevue, témoignage…) et tu récupères une vidéo montée, prête pour Reels, TikTok et Shorts.

| Étape | Ce que fait le système |
|---|---|
| 🎙️ Transcription | Whisper reconnaît la voix en français. Ça tourne sur ton ordi, sans abonnement. |
| ✂️ Coupes | Il enlève les silences et les « euh », « hum », « ben ». |
| 📱 Format | Il passe la vidéo en vertical 9:16 avec un fond flou (ou en recadré, en carré ou au format d'origine). |
| 💬 Sous-titres | Il incruste des sous-titres animés mot par mot, le mot prononcé en jaune, et fournit aussi un fichier `.srt`. |
| 🏷️ Logo + musique | Il ajoute ton logo en haut à droite et une musique de fond à bas volume. |
| 🔊 Son | Il normalise le volume de la voix au niveau des réseaux sociaux (-14 LUFS). |
| 🤖 Clips IA | Claude lit la transcription, choisit les 3 meilleurs moments et en fait des clips d'environ 45 s, avec titre, accroche, description et hashtags. |

Le système fonctionne sur **Windows** et **Mac**.

---

## Installation sur Windows (une seule fois)

1. Copie le dossier `montage-ia` sur ton ordi. Par exemple : télécharge le dépôt GitHub en ZIP avec **Code → Download ZIP**, puis décompresse-le.
2. Double-clique sur **`Installer-Windows.bat`**. Le script :
   - installe Python et FFmpeg avec `winget` s'ils manquent (si Python vient d'être installé, ferme la fenêtre et relance l'installateur) ;
   - installe les modules nécessaires ;
   - télécharge le modèle de transcription ;
   - te demande ta clé API Claude. Elle est optionnelle et ne sert qu'aux clips IA.

> Si Windows affiche « Windows a protégé votre ordinateur », clique sur **Informations complémentaires → Exécuter quand même**.
> Si `winget` est introuvable (vieux Windows 10), installe « App Installer » depuis le Microsoft Store, ou installe à la main [Python 3.12](https://www.python.org/downloads/) (coche « Add python.exe to PATH ») et [FFmpeg](https://www.gyan.dev/ffmpeg/builds/).

## Utilisation

- **Option 1 :** mets tes vidéos dans le dossier `entree`, puis double-clique sur **`Lancer-Montage-Windows.bat`**.
- **Option 2 :** glisse une ou plusieurs vidéos directement sur **`Lancer-Montage-Windows.bat`**.

Les résultats arrivent dans `sortie\<nom-de-la-video>\` :

```
sortie/ma-video/
├── ma-video_monte.mp4        ← vidéo complète montée
├── ma-video_monte.srt
├── clip1_<titre>.mp4         ← clips choisis par l'IA
├── clip2_<titre>.mp4
├── descriptions.txt          ← titres, descriptions et hashtags prêts à copier
└── transcription.txt
```

Une fois traitées, les vidéos d'origine sont déplacées dans `entree\traitees`.

Sur Mac, double-clique sur `Lancer-Montage-Mac.command`. FFmpeg doit être installé (`brew install ffmpeg`).

## Logo et musique

Mets les fichiers dans le dossier `assets` :
- `logo.png` : de préférence un PNG avec fond transparent ;
- `musique.mp3` : la musique tourne en boucle, à 10 % du volume par défaut.

Si un fichier est absent, l'étape correspondante est sautée.

## Clé API Claude (pour les clips IA)

1. Crée une clé sur https://platform.claude.com (section API Keys).
2. Mets-la dans un fichier `cle-api-anthropic.txt` dans le dossier `montage-ia`, ou dans la variable d'environnement `ANTHROPIC_API_KEY`.

Ce fichier n'est **jamais** envoyé sur GitHub : il est dans le `.gitignore`. Sans clé, le montage marche quand même, mais sans les clips IA.

Le système utilise Claude Opus 5.5. Une vidéo de 10 minutes coûte en général environ 5 à 15 cents US. Si Claude refuse une demande, l'API la relance automatiquement sur un autre modèle Claude (option `fallbacks`).

## Réglages (`config.json`)

| Réglage | Par défaut | Description |
|---|---|---|
| `format` | `vertical_flou` | `vertical_flou`, `vertical` (recadré), `carre`, `original` |
| `modele_whisper` | `small` | `base` est plus rapide, `medium` ou `large-v3` plus précis |
| `appareil_whisper` | `cpu` | `cuda` si tu as une carte NVIDIA (beaucoup plus rapide) |
| `silence_max_secondes` | `0.6` | Une pause plus longue est coupée |
| `retirer_mots_parasites` | `true` | Coupe les mots de la liste `mots_parasites` |
| `sous_titres_mots_par_ligne` | `3` | Nombre de mots affichés à la fois |
| `sous_titres_couleur_mot_actif` | `#FFD400` | Couleur du mot prononcé |
| `sous_titres_position_hauteur` | `0.70` | `0.5` = milieu, `0.85` = bas |
| `clips_ia` / `nombre_clips` / `duree_clip_secondes` | `true` / `3` / `45` | Réglages des clips IA |
| `contexte_marque` | Agence AKA… | Indique à l'IA le ton à adopter |

## Problèmes fréquents

- **« ffmpeg est introuvable »** : relance `Installer-Windows.bat`, ou ferme et rouvre la fenêtre après l'installation.
- **Le premier lancement est long** : c'est normal, le modèle Whisper se télécharge (environ 500 Mo pour `small`).
- **C'est trop lent** : mets `"modele_whisper": "base"`, ou `"appareil_whisper": "cuda"` si tu as une carte NVIDIA.
- **Erreur « cuda » / DLL** : remets `"appareil_whisper": "cpu"`.
