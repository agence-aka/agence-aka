import { NextResponse } from 'next/server';
import { authorize, supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { auditSite } from '@/lib/server/prospecting/audit';
import { qualifyLeads } from '@/lib/server/prospecting/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** Refait l'audit du site et la pré-qualification d'un lead (ex. après correction de ses infos). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = supabaseAdmin();
  const { data: lead } = await db.from('leads').select('*, prospect_campaigns(icp)').eq('id', params.id).single();
  if (!lead) return NextResponse.json({ error: 'Lead introuvable' }, { status: 404 });

  const signals = lead.website ? await auditSite(lead.website) : lead.signals;
  if (lead.website) await db.from('leads').update({ signals }).eq('id', lead.id);

  await qualifyLeads(
    [{
      id: lead.id,
      input: {
        company: lead.company, category: lead.category, city: lead.city, website: lead.website,
        facebook_url: lead.facebook_url, instagram_url: lead.instagram_url, email: lead.email,
        evidence: lead.evidence, signals,
        inbound_message: lead.origin === 'entrant' ? lead.evidence : null,
      },
    }],
    (lead as any).prospect_campaigns?.icp ?? '',
  );
  return NextResponse.json({ ok: true });
}
