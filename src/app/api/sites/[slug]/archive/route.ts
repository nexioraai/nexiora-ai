import { NextResponse } from 'next/server';
import { requireSiteOwner } from '@/lib/auth/require-site-owner';
import { detacherDomaine } from '@/lib/domains/detach';
import { logAnomaly } from '@/lib/anomaly';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * POST /api/sites/[slug]/archive — archive un site (remplace le DELETE
 * physique de dashboard/page.tsx). Bloque tant qu'une commande n'est pas
 * dans un statut sûr -- cf. archive_sites_if_no_blocking_orders,
 * supabase/sql/sites_archive_rpc.sql, même RPC (tout-ou-rien, appelée ici
 * avec un seul site) que /api/account/delete.
 *
 * La RPC est réservée à service_role (REVOKE anon/authenticated dans le
 * SQL) -- le client ne peut pas l'appeler directement, d'où cette route
 * dédiée avec requireSiteOwner en frontière d'autorisation.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  // D-06 -- `custom_domain` est PROJETE, sinon le detachement serait aveugle.
  const auth = await requireSiteOwner(req, slug, 'id, owner_id, custom_domain');
  if (!auth.ok) return auth.response;

  const { data: result, error } = await supabaseAdmin.rpc(
    'archive_sites_if_no_blocking_orders',
    { p_site_ids: [(auth.site as any).id], p_owner_id: (auth.site as any).owner_id }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = Array.isArray(result) ? result : result ? [result] : [];
  const blockedRow = rows.find((row: any) => !row.all_archived);
  if (blockedRow) {
    return NextResponse.json(
      { error: 'site_archive_blocked', blockingStatuses: blockedRow.blocking_statuses || [] },
      { status: 409 }
    );
  }

  // ============================================================
  // D-06 -- UN SITE ARCHIVE NE DOIT RIEN LAISSER DERRIERE LUI.
  //
  // L'archivage ne touchait AUCUN domaine. Consequences mesurees :
  //   * le rattachement restait actif chez l'hebergeur, pour un site que la
  //     vue publique refuse desormais de servir -- une adresse qui repond
  //     encore, pour ne montrer qu'une erreur ;
  //   * le domaine restait vu par les deux controles d'unicite, donc
  //     IRREVENDICABLE par quiconque, y compris par son proprietaire.
  //
  // APRES l'archivage, jamais avant : si l'archivage est refuse (commandes
  // en cours), le domaine ne doit surtout pas avoir bouge.
  //
  // L'ECHEC DU DETACHEMENT NE FAIT PAS ECHOUER L'ARCHIVAGE. Le site EST
  // archive ; revenir en arriere serait pire. Le residu est signale par
  // `detacherDomaine`, jamais avale, et l'operation est idempotente : une
  // reprise ou un archivage rejoue la termine.
  // ============================================================
  const site = auth.site as { id: string; custom_domain: string | null };
  const detachement = await detacherDomaine(site.id, slug, site.custom_domain);

  if (!detachement.ok) {
    await logAnomaly({
      type: 'domain_detach_on_archive_failed',
      severity: 'warning',
      siteId: site.id,
      slug,
      details: { domain: site.custom_domain, statut: detachement.statut },
    });
  }

  return NextResponse.json({
    success: true,
    domaineDetache: detachement.ok && detachement.detache,
  });
}
