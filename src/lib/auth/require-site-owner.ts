import { NextResponse } from 'next/server';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';

type OwnerCheck =
  { ok: true; site: any; email: string } |
  { ok: false; response: NextResponse };

/**
 * Verifie que le porteur du token est bien proprietaire du site.
 * Retourne soit le site, soit la reponse d'erreur a renvoyer telle quelle.
 *
 * Sans ce controle, n'importe qui peut lire, modifier les prix ou supprimer
 * les produits d'une boutique qui ne lui appartient pas.
 */
export async function requireSiteOwner(
  req: Request,
  slug: string,
  columns = 'id'
): Promise<OwnerCheck> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: 'Non authentifie.' }, { status: 401 }) };
  }

  const { data: { user }, error: authErr } = await supabaseAnon.auth.getUser(token);
  if (authErr || !user?.email) {
    return { ok: false, response: NextResponse.json({ error: 'Non authentifie.' }, { status: 401 }) };
  }

  const select = columns.includes('owner_email') ? columns : columns + ', owner_email';
  const { data: site } = await supabaseAdmin
    .from('sites')
    .select(select)
    .eq('slug', slug)
    .maybeSingle();

  if (!site) {
    return { ok: false, response: NextResponse.json({ error: 'Site introuvable' }, { status: 404 }) };
  }

  if ((site as any).owner_email !== user.email) {
    return { ok: false, response: NextResponse.json({ error: 'Acces refuse.' }, { status: 403 }) };
  }

  return { ok: true, site, email: user.email };
}
