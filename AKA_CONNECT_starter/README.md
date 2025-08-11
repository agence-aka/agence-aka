
# AKA CONNECT — starter (Next.js + Supabase)

Un MVP prêt à l’emploi pour **AKA CONNECT**, la plateforme tout‑en‑un d'une agence marketing : portail client, calendrier personnalisé, chat temps réel, partage de fichiers et fils de discussion.

## Démarrage rapide
1) Crée un projet sur [Supabase](https://supabase.com) et copie `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` vers un `.env.local` (à la racine).
2) Dans Supabase > SQL, exécute `supabase/seed.sql` pour créer les tables, politiques RLS et canaux de temps réel.
3) Installe et démarre :
```bash
pnpm i   # ou npm i / yarn
pnpm dev
```
4) Ouvre http://localhost:3000

## Fonctionnalités incluses
- Authentification prête via Supabase Auth (magic link ou email+mot de passe).
- Multi‑client (tenants) : chaque **client** possède son espace, son calendrier, ses fichiers et ses fils de discussion.
- **Calendrier** par client (FullCalendar) + événements privés/partagés.
- **Chat** en temps réel par fil (messages table + Realtime).
- **Fichiers** : upload dans un bucket par client + aperçu liste.
- **Rôles**: `admin`, `staff`, `client` (scopés par tenant).
- UI FR minimaliste + logo fourni.

> Ce repo est un squelette propre et extensible. Ajoute les workflows dont tu as besoin (facturation, briefs, campagnes, etc.).

## Structure
- `src/app/` — App Router Next.js
- `src/components/` — UI composables
- `src/lib/supabaseClient.ts` — client Supabase côté navigateur et serveur

## Licence
MIT — fais‑en bon usage 🤝
