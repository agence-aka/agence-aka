
# AKA CONNECT — starter (Next.js + Supabase)

Un MVP prêt à l’emploi pour **AKA CONNECT**, la plateforme tout‑en‑un d'une agence marketing : portail client, calendrier personnalisé, chat temps réel, partage de fichiers et fils de discussion.

## Démarrage rapide
1) Crée un projet sur [Supabase](https://supabase.com), copie `.env.example` vers `.env.local` et remplis au minimum les clés Supabase et `ANTHROPIC_API_KEY`.
2) Dans Supabase > SQL, exécute `supabase/seed.sql`, puis `supabase/migrations/002_leads.sql` (prospection).
3) Donne-toi le rôle admin (Supabase > SQL) : `insert into memberships (user_id, client_id, role) values ('<ton user id>', (select id from clients limit 1), 'admin');` (crée d'abord un client dans l'app si la table est vide).
4) Installe et démarre :
```bash
pnpm i   # ou npm i / yarn
pnpm dev
```
5) Ouvre http://localhost:3000

## Fonctionnalités incluses
- Authentification prête via Supabase Auth (magic link ou email+mot de passe).
- Multi‑client (tenants) : chaque **client** possède son espace, son calendrier, ses fichiers et ses fils de discussion.
- **Calendrier** par client (FullCalendar) + événements privés/partagés.
- **Chat** en temps réel par fil (messages table + Realtime).
- **Fichiers** : upload dans un bucket par client + aperçu liste.
- **Rôles**: `admin`, `staff`, `client` (scopés par tenant).
- UI FR minimaliste + logo fourni.

- **Leads & prospection** (`/dashboard/leads`) — voir ci-dessous.

## Leads & prospection automatique

```
Campagne (« restaurants indépendants », Laval, profil client idéal)
  ├─ Recherche web    : l'IA cherche et visite les sites des entreprises
  ├─ Recherche Facebook : pages d'entreprises publiques trouvées via le moteur de recherche
  ▼
Dédoublonnage (domaine / page Facebook / nom) → insertion « En analyse » (visible en direct)
  ▼
Audit du site : pixel Meta, Google Analytics/Ads, mobile, HTTPS, CMS, © ancien, courriels, réseaux
  ▼
Pré-qualification IA : score 0-100, chaud/tiède/froid, raisons, drapeaux rouges, services à proposer
  + courriel personnalisé rédigé → colonne « À contacter »
  ▼
Tu relis → « Approuver & envoyer » (Resend) ou « Copier » pour Messenger → « Contacté »
```

**Sources de leads**
| Source | Comment | Route |
|---|---|---|
| Web | Recherche web de l'IA (Claude + `web_search`/`web_fetch`) | `POST /api/prospect/run` |
| Facebook (prospection) | Pages publiques trouvées par recherche limitée à facebook.com | idem |
| Facebook/Instagram Lead Ads | Webhook `leadgen` de Meta | `/api/webhooks/facebook` |
| Formulaire du site, Zapier, Make | `POST /api/leads?key=LEADS_WEBHOOK_SECRET` | `/api/leads` |

Les leads entrants reçoivent une **réponse personnalisée** prête à approuver.

**Automatisation** : `vercel.json` lance `/api/cron/prospect` les jours ouvrables (6 h 17, heure de l'Est en hiver)
sur les campagnes cochées « Auto ». Définis `CRON_SECRET` dans Vercel. `CRON_MAX_CAMPAIGNS` = campagnes par exécution
(une fonction est limitée à 300 s).

**Conformité (LCAP / Loi 25)**
- On ne se connecte pas à Facebook et on ne le « scrape » pas : seules les pages publiques indexées par les moteurs de recherche sont utilisées (conditions de Meta).
- Courriels de prospection B2B : seulement des adresses **publiées par l'entreprise**, message lié à son activité (consentement tacite LCAP), identification de l'agence et option de désabonnement (« STOP » + en-tête `List-Unsubscribe`).
- Désabonnements : ajoute l'adresse dans `lead_suppressions` → l'envoi est bloqué et le lead passe à « Exclu ».
- Rien n'est envoyé sans ton approbation.

**Variables d'environnement** : voir `.env.example`.

> Ce repo est un squelette propre et extensible. Ajoute les workflows dont tu as besoin (facturation, briefs, campagnes, etc.).

## Structure
- `src/app/` — App Router Next.js
- `src/components/` — UI composables
- `src/lib/supabaseClient.ts` — client Supabase côté navigateur et serveur

## Licence
MIT — fais‑en bon usage 🤝
