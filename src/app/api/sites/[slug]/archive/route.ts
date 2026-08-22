import { NextResponse } from 'next/server';
import { requireSiteOwner } from '@/lib/auth/require-site-owner';
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
  const auth = await requireSiteOwner(req, slug, 'id, owner_id');
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

  return NextResponse.json({ success: true });
}
