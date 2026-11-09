import 'server-only';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let admin: SupabaseClient | null = null;

/** Client Supabase avec la clé service (contourne RLS) — uniquement côté serveur. */
export function supabaseAdmin(): SupabaseClient {
  if (!admin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis');
    admin = createClient(url, key, { auth: { persistSession: false } });
  }
  return admin;
}

/**
 * Autorise une requête API si :
 *  - elle vient du cron (Authorization: Bearer CRON_SECRET), ou
 *  - elle porte le jeton d'un utilisateur admin/staff.
 */
export async function authorize(req: Request): Promise<{ ok: true; userId: string | null } | { ok: false; status: number; error: string }> {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return { ok: false, status: 401, error: 'Non authentifié' };

  if (process.env.CRON_SECRET && token === process.env.CRON_SECRET) return { ok: true, userId: null };

  const db = supabaseAdmin();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return { ok: false, status: 401, error: 'Session invalide' };

  const { data: roles } = await db
    .from('memberships')
    .select('role')
    .eq('user_id', data.user.id)
    .in('role', ['admin', 'staff'])
    .limit(1);
  if (!roles?.length) return { ok: false, status: 403, error: 'Réservé à l’équipe (admin/staff)' };

  return { ok: true, userId: data.user.id };
}
