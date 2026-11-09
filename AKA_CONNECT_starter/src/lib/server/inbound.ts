import 'server-only';
import { supabaseAdmin } from './supabaseAdmin';
import { auditSite, normalizeDomain, type SiteSignals } from './prospecting/audit';
import { qualifyLeads } from './prospecting/pipeline';

export type InboundLead = {
  company?: string;
  name?: string;
  email?: string;
  phone?: string;
  website?: string;
  city?: string;
  message?: string;
  source?: string; // formulaire | facebook_lead_ads | courriel | ...
};

/** Enregistre un lead entrant, l'audite et prépare une réponse personnalisée (à approuver). */
export async function ingestInbound(lead: InboundLead) {
  const db = supabaseAdmin();
  const domain = normalizeDomain(lead.website);
  const company = lead.company?.trim() || lead.name?.trim() || lead.email?.trim() || 'Lead sans nom';

  const { data, error } = await db
    .from('leads')
    .insert({
      origin: 'entrant',
      source: lead.source ?? 'formulaire',
      status: 'nouveau',
      company,
      contact_name: lead.name?.trim() || null,
      email: lead.email?.trim().toLowerCase() || null,
      phone: lead.phone?.trim() || null,
      website: lead.website?.trim() || null,
      domain: null, // un lead entrant ne bloque pas le dédoublonnage de prospection
      city: lead.city?.trim() || null,
      evidence: lead.message?.slice(0, 4000) || null,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Insertion impossible');
  await db.from('lead_events').insert({ lead_id: data.id, type: 'created', detail: { origin: 'entrant', source: lead.source } });

  let signals: SiteSignals | null = null;
  if (domain && lead.website) {
    signals = await auditSite(lead.website);
    await db.from('leads').update({ signals }).eq('id', data.id);
  }

  await qualifyLeads(
    [{ id: data.id, input: { company, website: lead.website, email: lead.email, city: lead.city, signals, inbound_message: lead.message ?? '' } }],
    'Lead entrant : la personne nous a contactés. Évalue son sérieux et son adéquation.',
  );
  return data.id as string;
}
