# AKA · Carte de prospection — Vaudreuil-Soulanges & Valleyfield

Application **100 % locale** (aucun compte, aucun serveur) pour planifier la tournée des commerces à visiter et proposer nos services marketing.

## Ouvrir l'application
- **Le plus simple :** double-clique sur `index.html` (Chrome, Edge, Firefox ou Safari).
- **Recommandé (Mac) :** double-clique sur `Lancer-Mac.command` → ouvre `http://localhost:8765`.
- **Recommandé (Windows) :** double-clique sur `Lancer-Windows.bat`.

> Les données (statuts, notes, tournée) sont enregistrées **dans le navigateur** utilisé. Garde toujours le même navigateur et la même méthode d'ouverture (fichier *ou* lanceur), et fais une sauvegarde régulière via le menu **⋯ → Sauvegarder mes données**.

## Premiers pas
1. Zoome sur une ville (ou appuie sur 📍) : les commerces du secteur affiché se **chargent automatiquement en temps réel** depuis OpenStreetMap (Internet requis). Pour importer une ville entière d'un coup : onglet **Zones** → **Charger**.
2. Onglet **Liste** → filtre par zone, secteur, statut ; coche **Sans site web** pour cibler les meilleures opportunités. Le tri par défaut met les prospects 🔥 en premier.
3. Appuie sur un commerce (liste ou point sur la carte) pour ouvrir sa fiche : statut, angles de pitch, coordonnées, notes, personne contact, date de relance.
4. **🚗 Ajouter à la tournée** → onglet **Tournée** → **⚡ Optimiser l'ordre** → **🧭 Google Maps** pour lancer la navigation.
5. Un commerce manque ? **＋ Ajouter** puis touche la carte à son emplacement.

## Zones couvertes
Vaudreuil-Dorion · Île-Perrot (Pincourt, L'Île-Perrot, NDIP, Terrasse-Vaudreuil) · Saint-Lazare & Hudson · Les Cèdres & Coteau-du-Lac · Les Coteaux, Saint-Zotique & Rivière-Beaudette · Rigaud · Soulanges rural (Saint-Clet, Saint-Polycarpe, Saint-Télesphore, Sainte-Justine) · Salaberry-de-Valleyfield.

Pour ajouter une zone, édite `data.js` (tableau `zones`, bbox = [sud, ouest, nord, est]).

## Pipeline
À visiter → Planifié → Visité → À relancer → Intéressé → Client ✓ (ou Pas intéressé). Chaque changement est historisé dans la fiche.

## Score de potentiel
- +3 si aucun site web (ou Facebook seulement), +1 si aucun réseau social répertorié, +0 à +2 selon le secteur.
- Les chaînes/franchises sont masquées par défaut (décision marketing prise au siège).

## Export
Menu **⋯** : sauvegarde complète `.json` (pour changer d'ordi ou de navigateur), restauration, et export **CSV** (ouvrable dans Excel, selon les filtres actifs).

## Fichiers
`index.html` · `app.js` (logique) · `data.js` (zones, statuts, catégories) · `style.css` · `vendor/leaflet` (carte, inclus localement).
Fonds de carte © OpenStreetMap et Esri (sans clé API). La vue « Satellite » se choisit avec le bouton des calques.
