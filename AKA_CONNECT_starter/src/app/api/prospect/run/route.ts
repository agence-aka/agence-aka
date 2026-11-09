import { NextResponse } from 'next/server';
import { authorize } from '@/lib/server/supabaseAdmin';
import { runCampaign } from '@/lib/server/prospecting/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 300; // recherche web + qualification : quelques minutes

/** POST { campaignId } — lance une campagne de prospection maintenant. */
export async function POST(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { campaignId } = await req.json().catch(() => ({}));
  if (!campaignId) return NextResponse.json({ error: 'campaignId requis' }, { status: 400 });

  try {
    return NextResponse.json(await runCampaign(campaignId));
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
