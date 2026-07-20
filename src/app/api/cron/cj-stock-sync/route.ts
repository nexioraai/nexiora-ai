import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { startCronRun, finishCronRun } from '@/lib/cron-tracker';
import { cjGetInventory } from '@/lib/cj/client';

export const maxDuration = 300;

/**
 * Cron quotidien : synchronise le stock CJ.
 * Produit epuise (stock CJ = 0) -> depublie automatiquement (unpublished_by = 'system').
 * Retour en stock -> republie SEULEMENT si le marchand a active cj_stock_auto_republish.
 * Ne touche jamais un produit depublie manuellement par le marchand (unpublished_by = 'merchant').
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runId = await startCronRun('cj-stock-sync');
  try {
  // Tous les produits CJ (cj_vid rempli)
  const { data: products } = await supabaseAdmin
    .from('shop_products')
    .select('id, site_id, cj_vid, published, unpublished_by, cj_stock_status')
    .not('cj_vid', 'is', null)
    .limit(500);

  if (!products || products.length === 0) {
    return NextResponse.json({ done: true, checked: 0, unpublished: 0, republished: 0 });
  }

  // Regroupe par site (charge les identifiants CJ une seule fois)
  const bySite = new Map<string, typeof products>();
  for (const p of products) {
    if (!p.site_id) continue;
    const arr = bySite.get(p.site_id) || [];
    arr.push(p);
    bySite.set(p.site_id, arr);
  }

  let checked = 0;
  let unpublished = 0;
  let republished = 0;

  for (const [siteId, siteProducts] of bySite) {
    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('cj_email, cj_api_key, cj_stock_auto_republish')
      .eq('id', siteId)
      .maybeSingle();
    if (!site?.cj_email || !site?.cj_api_key) continue;

    for (const product of siteProducts) {
      checked++;
      try {
        const stock = await cjGetInventory(site.cj_email, site.cj_api_key, product.cj_vid);

        if (stock <= 0) {
          // Epuise : depublier si actuellement publie. Marque la cause = systeme.
          if (product.published) {
            await supabaseAdmin
              .from('shop_products')
              .update({ published: false, unpublished_by: 'system', cj_stock_status: 'out_of_stock' })
              .eq('id', product.id);
            unpublished++;
          } else if (product.cj_stock_status !== 'out_of_stock') {
            await supabaseAdmin
              .from('shop_products')
              .update({ cj_stock_status: 'out_of_stock' })
              .eq('id', product.id);
          }
        } else {
          // En stock. Republier seulement si : depublie PAR LE SYSTEME + toggle marchand actif.
          const wasSystemUnpublished = !product.published && product.unpublished_by === 'system';
          if (wasSystemUnpublished && site.cj_stock_auto_republish) {
            await supabaseAdmin
              .from('shop_products')
              .update({ published: true, unpublished_by: null, cj_stock_status: 'in_stock' })
              .eq('id', product.id);
            republished++;
          } else if (product.cj_stock_status !== 'in_stock') {
            await supabaseAdmin
              .from('shop_products')
              .update({ cj_stock_status: 'in_stock' })
              .eq('id', product.id);
          }
        }
        // Respect du QPS CJ (1 appel/seconde)
        await new Promise((r) => setTimeout(r, 1000));
      } catch (e) {
        console.error(`CJ stock sync: echec pour ${product.id}:`, e);
        // On laisse le produit tel quel : le prochain passage reessaiera.
      }
    }
  }

  await finishCronRun(runId, { itemsProcessed: checked });
  return NextResponse.json({ done: true, checked, unpublished, republished });
  } catch (e: any) {
    await finishCronRun(runId, { itemsProcessed: 0, status: 'error', errorMessage: e.message });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
