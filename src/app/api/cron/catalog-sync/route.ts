import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { cjAdapter } from '@/lib/suppliers/cj-adapter';
import { printfulAdapter } from '@/lib/suppliers/printful-adapter';
import { gelatoAdapter } from '@/lib/suppliers/gelato-adapter';
// import { printifyAdapter } from '@/lib/suppliers/printify-adapter'; // desactive : voir bloc SUPPLIERS
// import { zendropAdapter } from '@/lib/suppliers/zendrop-adapter'; // desactive : pas de variantes au catalogue
import type { CatalogProduct } from '@/lib/suppliers/supplier-adapter';
import { startCronRun, finishCronRun } from '@/lib/cron-tracker';

export const maxDuration = 300;

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

  const runId = await startCronRun('catalog-sync');
  try {
  // 1. Récupère les niches actives (sites mode 3 uniquement)
  const { data: sites } = await supabaseAdmin
    .from('sites')
    .select('type, niche_keywords')
    .eq('mode', 3)
    .not('type', 'is', null);

  if (!sites || sites.length === 0) {
    return NextResponse.json({ done: true, synced: 0, message: 'Aucun site mode 3' });
  }

  // 2. Mots-cles de recherche fournisseur.
  // niche_keywords est genere une fois a la creation du site : on le reutilise
  // au lieu de rappeler l'IA a chaque execution pour un resultat identique.
  // expandNiche ne sert plus que de repli pour les sites anterieurs a cette colonne.
  const keywordSet = new Set<string>();
  const needExpand: string[] = [];
  for (const site of sites as any[]) {
    if (Array.isArray(site.niche_keywords) && site.niche_keywords.length > 0) {
      for (const k of site.niche_keywords) keywordSet.add(String(k).toLowerCase());
    } else {
      const kw = extractNicheKeyword(site.type);
      if (kw) needExpand.push(kw);
    }
  }

  if (needExpand.length > 0) {
    const expanded = await Promise.all([...new Set(needExpand)].map(expandNiche));
    for (const k of expanded.flat()) keywordSet.add(String(k).toLowerCase());
  }

  // Rotation des mots-cles.
  // Mesure : ~18s par mot-cle sur les trois fournisseurs (CJ limite a 1 req/s).
  // Traiter tous les mots-cles d'un coup depasse maxDuration et le cron est tue
  // avant d'ecrire son resultat (5 executions bloquees en 'running' avant ce
  // correctif). On en traite donc quelques-uns par passage, en reprenant la ou
  // on s'etait arrete, position memorisee dans cron_state.
  const KEYWORDS_PER_RUN = 6;  // mesure : 3 mots-cles = 82s, au-dela de maxDuration
  const allKeywords = [...keywordSet].sort();

  const { data: stateRow } = await supabaseAdmin
    .from('cron_state')
    .select('value')
    .eq('key', 'catalog-sync-cursor')
    .maybeSingle();

  const cursor = Number((stateRow?.value as any)?.offset ?? 0);
  const start = allKeywords.length > 0 ? cursor % allKeywords.length : 0;

  // Fenetre glissante : on boucle sur le debut de la liste si besoin.
  const niches: string[] = [];
  for (let i = 0; i < Math.min(KEYWORDS_PER_RUN, allKeywords.length); i++) {
    niches.push(allKeywords[(start + i) % allKeywords.length]);
  }

  await supabaseAdmin
    .from('cron_state')
    .upsert({
      key: 'catalog-sync-cursor',
      value: { offset: start + niches.length },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });

  console.log(`[catalog-sync] mots-cles ${start}-${start + niches.length - 1} sur ${allKeywords.length} : ${niches.join(', ')}`);

  if (niches.length === 0) {
    return NextResponse.json({ done: true, synced: 0, message: 'Aucune niche exploitable' });
  }

  // 3. Sync des fournisseurs en parallele.
  // Trois API distinctes, aucun etat partage : le rate limit CJ (1 req/s) est
  // gere par le delay interne a cjAdapter.syncCatalog et reste sequentiel.
  // Sequentiellement, la duree etait la somme des trois (mesure : 47s, trop
  // proche de maxDuration=60). En parallele, c'est le maximum des trois.
  // allSettled et non all : un fournisseur en panne ne doit pas annuler les autres.
  const SUPPLIERS: { name: string; run: () => Promise<{ products: CatalogProduct[] }> }[] = [
    { name: 'CJ', run: () => cjAdapter.syncCatalog({ categories: niches, page: 1, page_size: 50 }) },
    { name: 'Printful', run: () => printfulAdapter.syncCatalog({ categories: niches }) },
    { name: 'Gelato', run: () => gelatoAdapter.syncCatalog({ categories: niches }) },
    // Printify DESACTIVE (2026-07-19) : 0 produit synchronise depuis toujours.
    // L'endpoint catalogue /variants.json ne renvoie ni 'cost' ni 'is_enabled'.
    // mapPrintifyVariant calculait donc price=0, et upsertProducts filtre price<=0.
    // Rebranchable une fois le bon endpoint de tarification identifie.
    // { name: 'Printify', run: () => printifyAdapter.syncCatalog({ categories: niches }) },
  ];

  const settled = await Promise.allSettled(SUPPLIERS.map((s) => s.run()));

  // Les upserts restent sequentiels : ils ecrivent tous dans catalog_products.
  let totalSynced = 0;
  const errors: string[] = [];

  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    const name = SUPPLIERS[i].name;
    if (outcome.status === 'rejected') {
      errors.push(`${name}: ${outcome.reason?.message || outcome.reason}`);
      continue;
    }
    try {
      totalSynced += await upsertProducts(outcome.value.products);
    } catch (e: any) {
      errors.push(`${name} (upsert): ${e.message}`);
    }
  }

  // --- Zendrop : DESACTIVE ---
  // Zendrop n'expose pas les variantes (taille/couleur) au niveau catalogue via son API.
  // Impossible de laisser un acheteur choisir sa variante -> risque de commande invalide.
  // Debranche de l'ingestion. Adapter conserve : rebranchable si leur API evolue.
  // try {
  //   const zdResult = await zendropAdapter.syncCatalog({ categories: niches });
  //   const zdUpserted = await upsertProducts(zdResult.products);
  //   totalSynced += zdUpserted;
  // } catch (e: any) {
  //   errors.push(`Zendrop: ${e.message}`);
  // }
  // --- Spocket (futur) ---
  // try {
  //   const result = await spocketAdapter.syncCatalog({ categories: niches });
  //   const upserted = await upsertProducts(result.products);
  //   totalSynced += upserted;
  // } catch (e: any) {
  //   errors.push(`Spocket: ${e.message}`);
  // }

  await finishCronRun(runId, { itemsProcessed: totalSynced });
  return NextResponse.json({
    done: true,
    niches,
    synced: totalSynced,
    errors: errors.length > 0 ? errors : undefined,
  });
  } catch (e: any) {
    await finishCronRun(runId, { itemsProcessed: 0, status: 'error', errorMessage: e.message });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
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
