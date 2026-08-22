import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logAnomaly } from '@/lib/anomaly';

// Même pattern d'autorisation admin que ai-usage/cron-runs/system-health/stats
// -- pas de nouveau mécanisme d'autorisation parallèle.
const ADMIN_EMAILS = ['issayamiyoussouf@gmail.com'];

/**
 * POST /api/admin/site-archive-override — archive un site en ignorant les
 * commandes non résolues (litige, commande réellement bloquée). Réservé
 * aux comptes ADMIN_EMAILS. Journalisé via logAnomaly (motif obligatoire),
 * jamais de suppression physique.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user?.email || !ADMIN_EMAILS.includes(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { siteId, reason } = await req.json().catch(() => ({}));
  if (!siteId || typeof siteId !== 'string') {
    return NextResponse.json({ error: 'siteId requis' }, { status: 400 });
  }
  if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
    return NextResponse.json({ error: 'Motif requis (5 caractères minimum)' }, { status: 400 });
  }

  const { data: archived, error } = await supabaseAdmin.rpc('admin_force_archive_site', {
    p_site_id: siteId,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAnomaly({
    type: 'admin_site_archive_override',
    severity: 'warning',
    siteId,
    details: { adminEmail: user.email, reason: reason.trim(), archived: !!archived },
  });

  if (!archived) {
    return NextResponse.json({ error: 'Site introuvable ou déjà archivé' }, { status: 409 });
  }

  return NextResponse.json({ success: true });
}
