import { NextResponse } from 'next/server';
import { authorize, supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { runCampaign } from '@/lib/server/prospecting/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** Appelé par le cron (vercel.json) : exécute les campagnes actives, la plus ancienne d'abord. */
export async function GET(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = supabaseAdmin();
  const { data: campaigns } = await db
    .from('prospect_campaigns')
    .select('id')
    .eq('active', true)
    .order('last_run_at', { ascending: true, nullsFirst: true })
    .limit(Number(process.env.CRON_MAX_CAMPAIGNS ?? 1));

  const results = [];
  for (const c of campaigns ?? []) {
    try {
      results.push(await runCampaign(c.id));
    } catch (e: any) {
      results.push({ campaign: c.id, error: String(e?.message ?? e) });
    }
  }
  return NextResponse.json({ ran: results.length, results });
}
