import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { researchCall } from '../claude';

export type Candidate = {
  company: string;
  website: string;
  facebook_url: string;
  instagram_url: string;
  email: string;
  phone: string;
  city: string;
  category: string;
  evidence: string;
  source_urls: string[];
};

export type Campaign = {
  id: string;
  name: string;
  query: string;
  location: string;
  icp: string;
  sources: string[];
  max_leads: number;
};

const str = { type: 'string' } as const;

const deliverTool: Anthropic.Beta.BetaTool = {
  name: 'save_candidates',
  description:
    'Enregistre la liste finale des entreprises trouvées. Appelle cet outil une seule fois, à la fin de ta recherche. Mets une chaîne vide pour tout champ inconnu — n’invente jamais une coordonnée.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['candidates'],
    properties: {
      candidates: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['company', 'website', 'facebook_url', 'instagram_url', 'email', 'phone', 'city', 'category', 'evidence', 'source_urls'],
          properties: {
            company: { type: 'string', description: 'Nom de l’entreprise' },
            website: { type: 'string', description: 'URL du site officiel, ou ""' },
            facebook_url: { type: 'string', description: 'URL de la page Facebook publique, ou ""' },
            instagram_url: str,
            email: { type: 'string', description: 'Courriel professionnel publié publiquement, ou ""' },
            phone: str,
            city: str,
            category: { type: 'string', description: 'Secteur / type d’entreprise' },
            evidence: { type: 'string', description: 'En 1-2 phrases : ce que tu as observé qui en fait un bon prospect' },
            source_urls: { type: 'array', items: str, description: 'Pages où l’information a été trouvée' },
          },
        },
      },
    },
  },
};

const SYSTEM = `Tu es chercheur·e en développement des affaires pour une agence marketing québécoise.
Ta tâche : trouver de VRAIES entreprises qui correspondent à une recherche, avec leurs coordonnées publiques.
Règles :
- Uniquement des entreprises réelles et actives, vérifiées dans tes résultats de recherche. Aucune invention.
- Coordonnées : seulement ce qui est publié publiquement par l'entreprise (site, page Facebook, annuaire). Pas de courriels personnels devinés.
- Pas de grandes chaînes / franchises nationales, sauf si le profil recherché le demande.
- Évite les doublons et les annuaires eux-mêmes (on veut l'entreprise, pas Pages Jaunes).
- Termine TOUJOURS en appelant save_candidates.`;

function location(c: Campaign): Anthropic.Beta.BetaUserLocation {
  return { type: 'approximate', country: 'CA', region: 'Quebec', city: c.location.split(',')[0]?.trim() || undefined };
}

/** Recherche sur le web ouvert (sites, annuaires, Google Maps indexé, articles). */
export async function discoverWeb(c: Campaign, exclude: string[]): Promise<Candidate[]> {
  const res = await researchCall<{ candidates: Candidate[] }>({
    system: SYSTEM,
    prompt: `Recherche : « ${c.query} » à/près de ${c.location}.
Profil recherché : ${c.icp || '(aucun précisé)'}
Trouve jusqu'à ${c.max_leads} entreprises. Pour chacune, visite son site pour confirmer qu'elle existe et relever courriel, téléphone et liens vers ses réseaux sociaux.
Déjà connues (à ignorer) : ${exclude.slice(0, 200).join(', ') || 'aucune'}`,
    serverTools: [
      { type: 'web_search_20260209', name: 'web_search', max_uses: 8, user_location: location(c) },
      { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 15, blocked_domains: ['facebook.com', 'instagram.com'] },
    ],
    deliverTool,
  });
  return res.candidates ?? [];
}

/**
 * Recherche de pages Facebook d'entreprises publiques via le moteur de recherche
 * (on ne se connecte pas à Facebook et on ne le « scrape » pas — conforme aux conditions de Meta).
 */
export async function discoverFacebook(c: Campaign, exclude: string[]): Promise<Candidate[]> {
  const res = await researchCall<{ candidates: Candidate[] }>({
    system: SYSTEM,
    prompt: `Trouve des pages Facebook PUBLIQUES d'entreprises pour : « ${c.query} » à/près de ${c.location}.
Profil recherché : ${c.icp || '(aucun précisé)'}
Utilise web_search (résultats limités à facebook.com) pour repérer les pages. Si la page ou l'extrait de recherche mentionne le site officiel, note-le dans "website".
Note dans "evidence" ce que révèle la page (activité récente ou non, nombre d'abonnés si visible, publicité, avis…).
Jusqu'à ${c.max_leads} entreprises. Déjà connues (à ignorer) : ${exclude.slice(0, 200).join(', ') || 'aucune'}`,
    serverTools: [
      { type: 'web_search_20260209', name: 'web_search', max_uses: 8, user_location: location(c), allowed_domains: ['facebook.com'] },
    ],
    deliverTool,
  });
  return res.candidates ?? [];
}
