import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { cjGetOrderDetail } from '@/lib/cj/client';

export const maxDuration = 60;

/**
 * Cron quotidien : remonte automatiquement le numero de tracking CJ.
 * Cherche les commandes Mode 3 (cj_order_id rempli) pas encore expediees,
 * interroge CJ, et si un trackNumber existe → marque la commande 'shipped'.
 * Declenche par Vercel Cron (securise par CRON_SECRET).
 */
export async function GET(req: NextRequest) {
  // Securite : seul Vercel (avec le bon secret) peut declencher
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Commandes en attente de tracking : commande CJ creee, pas encore expediee
  const { data: orders } = await supabaseAdmin
    .from('shop_orders')
    .select('id, site_id, cj_order_id')
    .not('cj_order_id', 'is', null)
    .is('tracking_number', null)
    .neq('status', 'shipped')
    .limit(200);

  if (!orders || orders.length === 0) {
    return NextResponse.json({ done: true, checked: 0, shipped: 0 });
  }

  // Regroupe les commandes par site (pour charger les identifiants CJ une seule fois)
  const bySite = new Map<string, typeof orders>();
  for (const o of orders) {
    if (!o.site_id) continue;
    const arr = bySite.get(o.site_id) || [];
    arr.push(o);
    bySite.set(o.site_id, arr);
  }

  let checked = 0;
  let shipped = 0;

  for (const [siteId, siteOrders] of bySite) {
    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('cj_email, cj_api_key')
      .eq('id', siteId)
      .maybeSingle();
    if (!site?.cj_email || !site?.cj_api_key) continue;

    for (const order of siteOrders) {
      checked++;
      try {
        const detail = await cjGetOrderDetail(site.cj_email, site.cj_api_key, order.id);
        const trackNumber = detail?.trackNumber || null;
        if (trackNumber) {
          await supabaseAdmin
            .from('shop_orders')
            .update({ status: 'shipped', tracking_number: trackNumber })
            .eq('id', order.id);
          shipped++;
        }
      } catch (e) {
        console.error(`CJ tracking: echec pour ${order.id}:`, e);
        // On laisse la commande : le prochain passage reessaiera.
      }
    }
  }

  return NextResponse.json({ done: true, checked, shipped });
}
