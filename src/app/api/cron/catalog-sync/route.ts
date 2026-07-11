import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { cjAdapter } from '@/lib/suppliers/cj-adapter';
import { printfulAdapter } from '@/lib/suppliers/printful-adapter';
import { printifyAdapter } from '@/lib/suppliers/printify-adapter';
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
  const rawNiches = [...new Set(
    sites
      .map(s => extractNicheKeyword(s.type))
      .filter(Boolean)
  )] as string[];
  const nicheArrays = await Promise.all(rawNiches.map(expandNiche));
  const niches = nicheArrays.flat();

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

  // --- Printful ---
  try {
    const pfResult = await printfulAdapter.syncCatalog({ categories: niches });
    const pfUpserted = await upsertProducts(pfResult.products);
    totalSynced += pfUpserted;
  } catch (e: any) {
    errors.push(`Printful: ${e.message}`);
  }

  // --- Printify ---
  try {
    const pyResult = await printifyAdapter.syncCatalog({ categories: niches });
    const pyUpserted = await upsertProducts(pyResult.products);
    totalSynced += pyUpserted;
  } catch (e: any) {
    errors.push(`Printify: ${e.message}`);
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

/** Expande une niche en mots-clés de recherche via Claude Haiku. */
async function expandNiche(niche: string): Promise<string[]> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `You are a product search keyword generator for dropshipping/POD suppliers (CJ Dropshipping, Printful, Printify).
Given this business type: "${niche}"
Return exactly 7 short English product search keywords that would find relevant products on these platforms.
Return ONLY a JSON array of strings, nothing else. Example: ["keyword1","keyword2","keyword3","keyword4","keyword5","keyword6","keyword7"]`,
        }],
      }),
    });
    const data = await res.json();
    const text = data?.content?.[0]?.text || '';
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      const keywords = JSON.parse(match[0]);
      if (Array.isArray(keywords) && keywords.length > 0) {
        console.log('[expandNiche]', niche, '->', keywords);
        return keywords.map((k: any) => String(k));
      }
    }
  } catch (err: any) {
    console.error('[expandNiche] Haiku failed:', err.message || err);
  }
  // Fallback: retourner la niche brute
  return [niche];
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

  const seen = new Set<string>();
  const rows = products
    .filter(p => {
      if (p.price <= 0 || !p.supplier_product_id || !p.name) return false;
      const key = p.supplier_id + ':' + p.supplier_product_id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(p => ({
    supplier_id: p.supplier_id,
    supplier_product_id: p.supplier_product_id,
    supplier_parent_id: p.supplier_parent_id || null,
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
