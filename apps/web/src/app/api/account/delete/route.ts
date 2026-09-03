import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logAnomaly } from '@/lib/anomaly';

/**
 * DELETE /api/account/delete — suppression de compte marchand.
 *
 * N'effectue plus JAMAIS de DELETE physique sur `sites` (audit ownership/RLS :
 * sites -> shop_orders -> shop_order_items -> order_item_designs cascadait
 * intégralement, détruisant l'historique transactionnel et fulfillment).
 *
 * Tous les sites du marchand sont archivés en une seule fois (archived_at)
 * via archive_sites_if_no_blocking_orders (supabase/sql/sites_archive_rpc.sql)
 * -- RPC tout-ou-rien : verrouille tous les sites, bloque l'archivage
 * entier si un seul a des commandes dans un statut non sûr
 * (liste blanche fail-closed : canceled/refunded/shipped), sans jamais
 * archiver certains sites et pas d'autres.
 * shop_orders.site_id est en ON DELETE RESTRICT : même en cas de bug futur
 * dans ce fichier ou un autre, Postgres refuse structurellement toute
 * suppression physique d'un site ayant des commandes.
 *
 * auth.admin.deleteUser() n'est appelé QUE si tous les sites du marchand
 * ont été archivés avec succès. Pas d'atomicité Postgres<->GoTrue possible :
 * un échec de deleteUser() après archivage laisse les sites archivés
 * (état sûr, aucune perte) et le compte actif -- l'opération entière est
 * rejouable sans effet de bord (ré-archiver un site déjà archived_at
 * non-null est un no-op côté RPC).
 */
export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    // Résolution par owner_id (auth.uid), jamais owner_email -- l'email peut
    // diverger de auth.users si l'utilisateur l'a changé, ce qui laisserait
    // un site non résolu et donc non archivé.
    const { data: sites, error: sitesError } = await supabaseAdmin
      .from('sites')
      .select('id, slug')
      .eq('owner_id', user.id)
      .is('archived_at', null);

    if (sitesError) {
      return NextResponse.json({ error: sitesError.message }, { status: 500 });
    }

    // Un seul appel, tout-ou-rien : la RPC verrouille tous les sites du
    // marchand avant de décider, jamais de site archivé isolément pendant
    // qu'un autre bloque l'opération.
    const { data: result, error: rpcError } = await supabaseAdmin.rpc(
      'archive_sites_if_no_blocking_orders',
      { p_site_ids: (sites || []).map((s) => s.id), p_owner_id: user.id }
    );

    if (rpcError) {
      return NextResponse.json(
        { error: `Archivage impossible : ${rpcError.message}` },
        { status: 500 }
      );
    }

    const slugById = new Map((sites || []).map((s) => [s.id, s.slug]));
    const rows = Array.isArray(result) ? result : result ? [result] : [];
    const blocked = rows
      .filter((row: any) => !row.all_archived)
      .map((row: any) => ({
        slug: slugById.get(row.blocked_site_id) || row.blocked_site_id,
        blockingStatuses: row.blocking_statuses || [],
      }));

    if (blocked.length > 0) {
      // Suppression de compte refusée : au moins un site a des commandes
      // non résolues. Rien n'a été détruit, rien n'a été laissé dans un état
      // incohérent -- les sites déjà archivés (le cas échéant) le restent,
      // le compte n'est pas supprimé.
      return NextResponse.json(
        {
          error: 'account_deletion_blocked',
          message: 'Certains de vos sites ont des commandes non résolues. Résolvez-les ou contactez le support.',
          blockedSites: blocked,
        },
        { status: 409 }
      );
    }

    // Tous les sites du marchand sont archivés (ou l'étaient déjà) -- sûr
    // d'appeler deleteUser().
    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (deleteUserError) {
      await logAnomaly({
        type: 'account_delete_deleteuser_failed',
        severity: 'blocked',
        details: { userId: user.id, error: deleteUserError.message },
      });
      return NextResponse.json(
        { error: 'Vos sites ont été archivés mais la suppression du compte a échoué. Réessayez ou contactez le support.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete account error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
