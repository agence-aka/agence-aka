import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { ingestInbound } from '@/lib/server/inbound';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Facebook / Instagram Lead Ads → AKA CONNECT.
 * Dans l'app Meta : Webhooks > Page > champ « leadgen », URL = https://<domaine>/api/webhooks/facebook
 * Variables : FB_VERIFY_TOKEN, FB_APP_SECRET, FB_PAGE_ACCESS_TOKEN (permission leads_retrieval).
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  if (p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') === process.env.FB_VERIFY_TOKEN) {
    return new Response(p.get('hub.challenge') ?? '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.FB_APP_SECRET;
  const sig = req.headers.get('x-hub-signature-256') ?? '';
  if (!secret) return NextResponse.json({ error: 'FB_APP_SECRET manquant' }, { status: 500 });
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return NextResponse.json({ error: 'Signature invalide' }, { status: 401 });
  }

  const payload = JSON.parse(raw);
  const ids: string[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field === 'leadgen' && change.value?.leadgen_id) ids.push(change.value.leadgen_id);
    }
  }

  for (const leadgenId of ids) {
    try {
      const r = await fetch(
        `https://graph.facebook.com/v21.0/${leadgenId}?fields=field_data,ad_name,form_id,created_time&access_token=${process.env.FB_PAGE_ACCESS_TOKEN}`,
      );
      const lead = await r.json();
      const f: Record<string, string> = {};
      for (const d of lead.field_data ?? []) f[d.name] = d.values?.[0] ?? '';
      await ingestInbound({
        source: 'facebook_lead_ads',
        name: f.full_name || [f.first_name, f.last_name].filter(Boolean).join(' '),
        email: f.email,
        phone: f.phone_number,
        company: f.company_name,
        city: f.city,
        website: f.website,
        message: Object.entries(f)
          .filter(([k]) => !['full_name', 'first_name', 'last_name', 'email', 'phone_number'].includes(k))
          .map(([k, v]) => `${k}: ${v}`)
          .concat(lead.ad_name ? [`Publicité : ${lead.ad_name}`] : [])
          .join('\n'),
      });
    } catch (e) {
      console.error('Lead Ads', leadgenId, e);
    }
  }
  return NextResponse.json({ received: ids.length });
}
