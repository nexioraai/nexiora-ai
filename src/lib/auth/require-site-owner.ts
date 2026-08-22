import { NextResponse } from 'next/server';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';

type OwnerCheck =
  { ok: true; site: any; email?: string } |
  { ok: false; response: NextResponse };

/**
 * Verifie que le porteur du token est bien proprietaire du site.
 * Retourne soit le site, soit la reponse d'erreur a renvoyer telle quelle.
 *
 * Sans ce controle, n'importe qui peut lire, modifier les prix ou supprimer
 * les produits d'une boutique qui ne lui appartient pas.
 *
 * Audit Mode 3/POD BRAND, perfectionnement -- cause racine : `sites.owner_id`
 * (supabase/sql/sites_owner_id_step1_add_column.sql) est une colonne
 * additive SANS backfill -- seuls les sites crees APRES ce chantier
 * (src/app/api/chat/route.ts) l'ont renseignee ; aucun fichier de migration
 * "step2" n'existe dans supabase/sql/ pour les sites reels preexistants.
 * Comparer uniquement sur owner_id (comme avant ce correctif) aurait donc
 * renvoye 403 a TOUT proprietaire legitime d'un site preexistant sur TOUTES
 * les routes qui appellent ce garde-fou (generate-mockups, catalog/curate,
 * catalog/enhance, catalog/selections, sites/[slug]/archive, stripe/portal)
 * -- une regression fonctionnelle reelle, pas seulement theorique, sur le
 * coeur de POD BRAND. owner_id reste la verification stricte et prioritaire
 * (identite stable, insensible a un changement d'email) ; le repli sur
 * owner_email ne s'applique QUE quand owner_id est encore null cote DB (site
 * pas encore backfille), jamais quand owner_id est renseigne mais different
 * de l'utilisateur courant -- aucun affaiblissement de la garde pour les
 * sites deja migres. Voir sites_owner_id_step2_backfill.sql : une fois ce
 * backfill execute et verifie, tous les sites ont owner_id non-null et ce
 * repli ne s'exerce plus jamais en pratique (code inchange requis).
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
  if (authErr || !user?.id) {
    return { ok: false, response: NextResponse.json({ error: 'Non authentifie.' }, { status: 401 }) };
  }

  let select = columns.includes('owner_id') ? columns : columns + ', owner_id';
  if (!select.includes('owner_email')) select += ', owner_email';
  const { data: site } = await supabaseAdmin
    .from('sites')
    .select(select)
    .eq('slug', slug)
    .maybeSingle();

  if (!site) {
    return { ok: false, response: NextResponse.json({ error: 'Site introuvable' }, { status: 404 }) };
  }

  const siteOwnerId = (site as any).owner_id;
  const isOwner = siteOwnerId != null
    ? siteOwnerId === user.id
    : !!user.email && (site as any).owner_email === user.email;
  if (!isOwner) {
    return { ok: false, response: NextResponse.json({ error: 'Acces refuse.' }, { status: 403 }) };
  }

  return { ok: true, site, email: user.email };
}
