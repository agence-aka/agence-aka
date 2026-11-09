import { NextResponse } from 'next/server';
import { ingestInbound } from '@/lib/server/inbound';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Webhook pour leads entrants (formulaire du site, Typeform, Zapier/Make…).
 * POST /api/leads?key=LEADS_WEBHOOK_SECRET
 * { "name", "email", "phone", "company", "website", "city", "message", "source" }
 */
export async function POST(req: Request) {
  const key = new URL(req.url).searchParams.get('key') ?? req.headers.get('x-webhook-secret');
  if (!process.env.LEADS_WEBHOOK_SECRET || key !== process.env.LEADS_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Clé invalide' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body || (!body.email && !body.phone)) {
    return NextResponse.json({ error: 'email ou phone requis' }, { status: 400 });
  }
  try {
    const id = await ingestInbound({ ...body, source: body.source ?? 'formulaire' });
    return NextResponse.json({ id });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
