import 'server-only';
import { jsonCall } from '../claude';
import type { SiteSignals } from './audit';

export const AGENCY_PROFILE =
  process.env.AGENCY_PROFILE ??
  `Agence AKA — agence marketing et média au Québec.
Services : stratégie de marque, gestion des réseaux sociaux, publicité Meta (Facebook/Instagram) et Google Ads,
création de contenu photo/vidéo, sites web et SEO local.
Clientèle cible : PME québécoises qui veulent plus de clients et une présence en ligne professionnelle.`;

export type QualInput = {
  company: string;
  category?: string | null;
  city?: string | null;
  website?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  email?: string | null;
  evidence?: string | null;
  signals?: SiteSignals | null;
  inbound_message?: string | null; // pour les leads entrants
};

export type Qualification = {
  score: number;
  tier: 'chaud' | 'tiede' | 'froid';
  fit_reasons: string[];
  red_flags: string[];
  recommended_services: string[];
  contact_name: string;
  email_subject: string;
  email_body: string;
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['results'],
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'score', 'tier', 'fit_reasons', 'red_flags', 'recommended_services', 'contact_name', 'email_subject', 'email_body'],
        properties: {
          index: { type: 'integer' },
          score: { type: 'integer', description: '0 à 100' },
          tier: { type: 'string', enum: ['chaud', 'tiede', 'froid'] },
          fit_reasons: { type: 'array', items: { type: 'string' } },
          red_flags: { type: 'array', items: { type: 'string' } },
          recommended_services: { type: 'array', items: { type: 'string' } },
          contact_name: { type: 'string', description: 'Nom du ou de la responsable si connu, sinon ""' },
          email_subject: { type: 'string' },
          email_body: { type: 'string' },
        },
      },
    },
  },
};

const SYSTEM = `Tu pré-qualifies des prospects pour l'agence suivante :
${AGENCY_PROFILE}

Pour chaque prospect, à partir UNIQUEMENT des faits fournis (audit du site, observations de recherche, message reçu) :
1. Score 0-100 = adéquation avec le profil client idéal × besoin visible de nos services × capacité probable à payer.
   chaud ≥ 70, tiède 40-69, froid < 40.
   Indices de besoin : pas de pixel Meta / Analytics, site non mobile, copyright ancien, Facebook inactif, pas de site du tout.
   Indices de budget : entreprise établie, plusieurs employés/succursales, réservation ou boutique en ligne, publicité déjà active.
   Signaux négatifs : entreprise fermée, chaîne nationale, déjà une agence visible, aucun moyen de contact.
2. Raisons concrètes (fit_reasons) et drapeaux rouges, en phrases courtes.
3. Rédige un premier courriel en français québécois professionnel et chaleureux (vouvoiement) :
   - 90 à 140 mots, objet court et spécifique (pas de clickbait).
   - Mentionne UNE observation précise et vérifiable tirée des faits (jamais inventée).
   - Propose une valeur claire et un petit appel à l'action (appel de 15 min).
   - Signe « L'équipe AKA ». Termine par la ligne : « Vous ne souhaitez plus recevoir nos messages ? Répondez simplement STOP. »
   - Pour un lead entrant, réponds à sa demande au lieu de prospecter.
N'invente aucun chiffre, nom ou fait.`;

export async function qualifyBatch(items: QualInput[], icp: string): Promise<Map<number, Qualification>> {
  const out = new Map<number, Qualification>();
  if (!items.length) return out;

  const res = await jsonCall<{ results: (Qualification & { index: number })[] }>({
    system: SYSTEM,
    effort: 'medium',
    schema: SCHEMA,
    prompt: `Profil client idéal de cette campagne : ${icp || '(général — PME locales)'}

Prospects (JSON) :
${JSON.stringify(items.map((it, index) => ({ index, ...it })), null, 1)}

Renvoie un résultat par prospect, avec le même index.`,
  });

  for (const r of res.results ?? []) {
    const { index, ...q } = r;
    out.set(index, { ...q, score: Math.max(0, Math.min(100, Math.round(q.score))) });
  }
  return out;
}
