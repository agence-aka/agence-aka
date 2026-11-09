import { NextResponse } from 'next/server';
import { authorize, supabaseAdmin } from '@/lib/server/supabaseAdmin';

export const runtime = 'nodejs';

/** POST { subject, body } — envoie le courriel approuvé via Resend et passe le lead à « contacté ». */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { RESEND_API_KEY, RESEND_FROM, REPLY_TO } = process.env;
  if (!RESEND_API_KEY || !RESEND_FROM) {
    return NextResponse.json({ error: 'Envoi non configuré (RESEND_API_KEY / RESEND_FROM)' }, { status: 501 });
  }

  const db = supabaseAdmin();
  const { data: lead } = await db.from('leads').select('*').eq('id', params.id).single();
  if (!lead) return NextResponse.json({ error: 'Lead introuvable' }, { status: 404 });
  if (!lead.email) return NextResponse.json({ error: 'Ce lead n’a pas de courriel' }, { status: 400 });

  const { data: supp } = await db.from('lead_suppressions').select('email').eq('email', lead.email).maybeSingle();
  if (supp) return NextResponse.json({ error: 'Adresse désabonnée — envoi bloqué' }, { status: 409 });

  const { subject, body } = await req.json().catch(() => ({}));
  const finalSubject = (subject ?? lead.email_subject ?? '').trim();
  const finalBody = (body ?? lead.email_body ?? '').trim();
  if (!finalSubject || !finalBody) return NextResponse.json({ error: 'Objet et message requis' }, { status: 400 });

  const unsubscribe = REPLY_TO ?? RESEND_FROM.replace(/^.*</, '').replace(/>$/, '');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [lead.email],
      reply_to: REPLY_TO || undefined,
      subject: finalSubject,
      text: finalBody,
      headers: { 'List-Unsubscribe': `<mailto:${unsubscribe}?subject=STOP>` },
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json({ error: out?.message ?? 'Échec de l’envoi' }, { status: 502 });

  await db
    .from('leads')
    .update({ status: 'contacte', contacted_at: new Date().toISOString(), email_subject: finalSubject, email_body: finalBody })
    .eq('id', lead.id);
  await db.from('lead_events').insert({
    lead_id: lead.id,
    type: 'email_sent',
    detail: { subject: finalSubject, provider_id: out?.id, by: auth.userId },
  });
  return NextResponse.json({ ok: true });
}
