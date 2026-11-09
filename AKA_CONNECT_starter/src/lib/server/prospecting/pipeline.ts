import 'server-only';
import { supabaseAdmin } from '../supabaseAdmin';
import { auditSite, normalizeDomain, normalizeFacebook, type SiteSignals } from './audit';
import { discoverFacebook, discoverWeb, type Campaign, type Candidate } from './discover';
import { qualifyBatch, type QualInput } from './qualify';

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

const clean = (s?: string | null) => (s && s.trim() ? s.trim() : null);

type LeadRow = { id: string; input: QualInput };

/** Audit + pré-qualification IA + brouillon de courriel, puis mise à jour des leads. */
export async function qualifyLeads(rows: LeadRow[], icp: string) {
  const db = supabaseAdmin();
  const { data: supp } = await db.from('lead_suppressions').select('email');
  const suppressed = new Set((supp ?? []).map(s => s.email.toLowerCase()));

  for (let start = 0; start < rows.length; start += 10) {
    const chunk = rows.slice(start, start + 10);
    try {
      const results = await qualifyBatch(chunk.map(r => r.input), icp);
      await Promise.all(
        chunk.map(async (row, idx) => {
          const q = results.get(idx);
          if (!q) return;
          const email = row.input.email?.toLowerCase() ?? null;
          const isSuppressed = email ? suppressed.has(email) : false;
          await db
            .from('leads')
            .update({
              score: q.score,
              tier: q.tier,
              fit_reasons: q.fit_reasons,
              red_flags: isSuppressed ? [...q.red_flags, 'Adresse désabonnée — ne pas contacter'] : q.red_flags,
              recommended_services: q.recommended_services,
              contact_name: clean(q.contact_name),
              email_subject: q.email_subject,
              email_body: q.email_body,
              status: isSuppressed ? 'exclu' : 'a_contacter',
              error: null,
            })
            .eq('id', row.id);
          await db.from('lead_events').insert({ lead_id: row.id, type: 'qualified', detail: { score: q.score, tier: q.tier } });
        }),
      );
    } catch (e: any) {
      const msg = String(e?.message ?? e).slice(0, 300);
      await db.from('leads').update({ error: msg }).in('id', chunk.map(r => r.id));
    }
  }
}

export async function runCampaign(campaignId: string) {
  const db = supabaseAdmin();
  const { data: campaign, error } = await db.from('prospect_campaigns').select('*').eq('id', campaignId).single();
  if (error || !campaign) throw new Error('Campagne introuvable');
  const c = campaign as Campaign;

  // 1. Ce qu'on connaît déjà (pour dédoublonner et ne pas re-chercher les mêmes)
  const { data: known } = await db.from('leads').select('company, domain, facebook_url').order('created_at', { ascending: false }).limit(2000);
  const knownDomains = new Set((known ?? []).map(k => k.domain).filter(Boolean));
  const knownFb = new Set((known ?? []).map(k => k.facebook_url).filter(Boolean));
  const knownNames = new Set((known ?? []).map(k => k.company.toLowerCase()));
  const exclude = (known ?? []).map(k => k.domain ?? k.company);

  // 2. Découverte (web + Facebook en parallèle)
  const jobs: Promise<{ source: string; items: Candidate[] }>[] = [];
  if (c.sources.includes('web')) jobs.push(discoverWeb(c, exclude).then(items => ({ source: 'web', items })));
  if (c.sources.includes('facebook')) jobs.push(discoverFacebook(c, exclude).then(items => ({ source: 'facebook', items })));
  const settled = await Promise.allSettled(jobs);
  const errors = settled.filter((s): s is PromiseRejectedResult => s.status === 'rejected').map(s => String(s.reason?.message ?? s.reason));

  // 3. Normalisation + dédoublonnage
  const fresh: (Candidate & { source: string; domain: string | null; fb: string | null })[] = [];
  for (const s of settled) {
    if (s.status !== 'fulfilled') continue;
    for (const cand of s.value.items) {
      if (!clean(cand.company)) continue;
      const domain = normalizeDomain(clean(cand.website));
      const fb = normalizeFacebook(clean(cand.facebook_url));
      const name = cand.company.trim().toLowerCase();
      if ((domain && knownDomains.has(domain)) || (fb && knownFb.has(fb)) || knownNames.has(name)) continue;
      if (domain && /facebook\.com|instagram\.com|pagesjaunes|yelp|google\./.test(domain)) continue;
      if (domain) knownDomains.add(domain);
      if (fb) knownFb.add(fb);
      knownNames.add(name);
      fresh.push({ ...cand, source: s.value.source, domain, fb });
    }
  }
  const limited = fresh.slice(0, c.max_leads * 2);

  // 4. Insertion immédiate (le dashboard les voit arriver en temps réel)
  const inserted: { id: string; cand: (typeof limited)[number] }[] = [];
  for (const cand of limited) {
    const { data, error: insErr } = await db
      .from('leads')
      .insert({
        campaign_id: c.id,
        origin: 'prospection',
        source: cand.source,
        status: 'nouveau',
        company: cand.company.trim(),
        email: clean(cand.email)?.toLowerCase() ?? null,
        phone: clean(cand.phone),
        website: cand.domain ? clean(cand.website) : null,
        domain: cand.domain,
        facebook_url: cand.fb,
        instagram_url: clean(cand.instagram_url),
        city: clean(cand.city),
        category: clean(cand.category),
        evidence: clean(cand.evidence),
        source_urls: cand.source_urls ?? [],
      })
      .select('id')
      .single();
    if (insErr || !data) continue; // doublon concurrent → ignoré
    inserted.push({ id: data.id, cand });
    await db.from('lead_events').insert({ lead_id: data.id, type: 'created', detail: { source: cand.source, campaign: c.name } });
  }

  // 5. Audit des sites
  const audits = await mapLimit(inserted, 5, async ({ id, cand }) => {
    if (!cand.domain || !cand.website) return { id, signals: null as SiteSignals | null };
    const signals = await auditSite(cand.website);
    const patch: Record<string, unknown> = { signals };
    if (!cand.email && signals.emails?.length) patch.email = signals.emails[0];
    if (!cand.fb && signals.socials?.facebook) patch.facebook_url = normalizeFacebook(signals.socials.facebook);
    if (!cand.instagram_url && signals.socials?.instagram) patch.instagram_url = signals.socials.instagram;
    const { error: upErr } = await db.from('leads').update(patch).eq('id', id);
    if (upErr) await db.from('leads').update({ signals }).eq('id', id); // ex. page Facebook déjà connue
    return { id, signals };
  });

  // 6. Pré-qualification + brouillons
  const { data: rows } = await db.from('leads').select('*').in('id', inserted.map(i => i.id));
  await qualifyLeads(
    (rows ?? []).map(r => ({
      id: r.id,
      input: {
        company: r.company,
        category: r.category,
        city: r.city,
        website: r.website,
        facebook_url: r.facebook_url,
        instagram_url: r.instagram_url,
        email: r.email,
        evidence: r.evidence,
        signals: audits.find(a => a.id === r.id)?.signals ?? null,
      },
    })),
    c.icp,
  );

  await db.from('prospect_campaigns').update({ last_run_at: new Date().toISOString() }).eq('id', c.id);
  return { campaign: c.name, found: fresh.length, inserted: inserted.length, errors };
}
