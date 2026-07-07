import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { cjAdapter } from '@/lib/suppliers/cj-adapter';
import type { CatalogProduct } from '@/lib/suppliers/supplier-adapter';

export const maxDuration = 60;

/**
 * Cron : synchronise les catalogues fournisseurs dans catalog_products.
 * Ne sync que les niches des sites mode 3 actifs.
 * Clés Nexiora globales (pas celles des marchands).
 * Fréquence recommandée : toutes les 6h.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 1. Récupère les niches actives (sites mode 3 uniquement)
  const { data: sites } = await supabaseAdmin
    .from('sites')
    .select('type')
    .eq('mode', 3)
    .not('type', 'is', null);

  if (!sites || sites.length === 0) {
    return NextResponse.json({ done: true, synced: 0, message: 'Aucun site mode 3' });
  }

  // 2. Extrait les mots-clés uniques des niches
  const niches = [...new Set(
    sites
      .map(s => extractNicheKeyword(s.type))
      .filter(Boolean)
  )] as string[];

  if (niches.length === 0) {
    return NextResponse.json({ done: true, synced: 0, message: 'Aucune niche exploitable' });
  }

  // 3. Sync chaque fournisseur
  let totalSynced = 0;
  const errors: string[] = [];

  // --- CJ ---
  try {
    const result = await cjAdapter.syncCatalog({ categories: niches, page: 1, page_size: 50 });
    const upserted = await upsertProducts(result.products);
    totalSynced += upserted;
  } catch (e: any) {
    errors.push(`CJ: ${e.message}`);
  }

  // --- Spocket (futur) ---
  // try {
  //   const result = await spocketAdapter.syncCatalog({ categories: niches });
  //   const upserted = await upsertProducts(result.products);
  //   totalSynced += upserted;
  // } catch (e: any) {
  //   errors.push(`Spocket: ${e.message}`);
  // }

  return NextResponse.json({
    done: true,
    niches,
    synced: totalSynced,
    errors: errors.length > 0 ? errors : undefined,
  });
}

/** Extrait un mot-clé de recherche depuis le type du site. */
function extractNicheKeyword(type: string | null): string | null {
  if (!type) return null;
  // Nettoie : enlève "Dropshipping", "Retailer", "Store", "Shop", etc.
  const cleaned = type
    .replace(/\b(dropshipping|retailer|store|shop|boutique|online|e-commerce|ecommerce)\b/gi, '')
    .replace(/[&.]/g, ' ')
    .trim();
  return cleaned || null;
}

/** Upsert batch dans catalog_products (ON CONFLICT update). */
async function upsertProducts(products: CatalogProduct[]): Promise<number> {
  if (products.length === 0) return 0;

  const rows = products.map(p => ({
    supplier_id: p.supplier_id,
    supplier_product_id: p.supplier_product_id,
    name: p.name,
    description: p.description,
    category: p.category,
    images: p.images,
    price: p.price,
    currency: p.currency,
    variants: JSON.stringify(p.variants),
    shipping_days_min: p.shipping_days_min,
    shipping_days_max: p.shipping_days_max,
    warehouse_country: p.warehouse_country,
    in_stock: p.in_stock,
    last_synced_at: p.last_synced_at,
  }));

  const { error } = await supabaseAdmin
    .from('catalog_products')
    .upsert(rows, { onConflict: 'supplier_id,supplier_product_id' });

  if (error) throw new Error(`Upsert catalog_products: ${error.message}`);
  return rows.length;
}
