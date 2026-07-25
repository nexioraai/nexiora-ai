import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { cjGetVariants, cjCalculateFreight } from '@/lib/cj/client';
import { startCronRun, finishCronRun } from '@/lib/cron-tracker';

export const maxDuration = 300;

/**
 * Pre-calcule le shipping CJ (produit x pays) et le stocke dans shipping_cache.
 * But : le checkout lit ce cache au lieu d'appeler CJ en direct, donc aucun
 * acheteur n'attend et le quota CJ 1req/s n'est jamais sature au paiement.
 *
 * STOCKE LE PRIX BRUT CJ (logisticPrice), sans marge. Le +20% est applique
 * a l'affichage, jamais en base : une seule source de verite, un seul endroit
 * pour changer la marge.
 *
 * Paires calculees a la volee : produits reellement vendus (site_catalog_selections)
 * croises avec les pays reellement commandes (shop_orders.country_code). Aucune
 * liste maintenue a la main.
 */

const BATCH_SIZE = 40;           // 40 paires x 2 appels x 1.1s = ~88s (marge sous 300s)
const RATE_LIMIT_MS = 1100;      // CJ : 1 requete/seconde stricte
const ABORT_ERROR_RATIO = 0.3;   // au-dela, panne API probable : on arrete
const STALE_HOURS = 168;         // recalcul si plus vieux que 7 jours

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** CJ renvoie logisticAging "2-5" : on extrait les deux bornes. */
function parseAging(aging: unknown): { min: number | null; max: number | null } {
  if (typeof aging !== 'string') return { min: null, max: null };
  const parts = aging.split('-').map((p) => Number(p.trim()));
  const min = Number.isFinite(parts[0]) ? parts[0] : null;
  const max = Number.isFinite(parts[1]) ? parts[1] : (Number.isFinite(parts[0]) ? parts[0] : null);
  return { min, max };
}

/** Borne basse des options logistiques (la moins chere). */
function lowestPrice(options: unknown): { price: number; aging: string } | null {
  const list = Array.isArray(options) ? options : [];
  let best: { price: number; aging: string } | null = null;
  for (const o of list) {
    const p = Number((o as any)?.logisticPrice ?? (o as any)?.price ?? (o as any)?.freightAmount);
    if (!Number.isFinite(p) || p < 0) continue;
    if (!best || p < best.price) {
      best = { price: p, aging: String((o as any)?.logisticAging ?? '') };
    }
  }
  return best;
}

/** Regroupe les options logistiques CJ en 3 tiers : eco / standard / express.
 *  - eco     : le moins cher
 *  - express : le plus rapide (borne haute la plus basse), a prix raisonnable
 *  - standard: meilleur compromis prix + delai, distinct des deux autres
 *  Un plafond (3x le moins cher) ecarte les aberrations (DHL, fret maritime). */
function pickThreeTiers(options: unknown): {
  tier: 'eco' | 'standard' | 'express';
  name: string; cost: number; days_min: number | null; days_max: number | null;
}[] | null {
  const list = Array.isArray(options) ? options : [];
  const valid = list
    .map((o: any) => ({
      name: String(o?.logisticName ?? ''),
      cost: Number(o?.logisticPrice ?? o?.price ?? o?.freightAmount),
      aging: String(o?.logisticAging ?? ''),
    }))
    .filter((o) => Number.isFinite(o.cost) && o.cost >= 0);
  if (valid.length === 0) return null;

  const pmin = (a: string) => { const n = Number(a.split('-')[0]); return Number.isFinite(n) ? n : 999; };
  const pmax = (a: string) => { const parts = a.split('-'); const n = Number(parts[1] ?? parts[0]); return Number.isFinite(n) ? n : 999; };

  const eco = valid.reduce((a, b) => (b.cost < a.cost ? b : a));
  const cap = eco.cost * 3;
  const pool = valid.filter((o) => o.cost <= cap);

  const express = pool.reduce((a, b) => {
    const am = pmax(a.aging), bm = pmax(b.aging);
    if (bm !== am) return bm < am ? b : a;
    const amn = pmin(a.aging), bmn = pmin(b.aging);
    if (bmn !== amn) return bmn < amn ? b : a;
    return b.cost < a.cost ? b : a;
  });

  const rest = pool.filter((o) => o.name !== eco.name && o.name !== express.name);
  const standard = (rest.length ? rest : pool).reduce((a, b) => {
    const sa = a.cost + pmax(a.aging) * 0.5;
    const sb = b.cost + pmax(b.aging) * 0.5;
    return sb < sa ? b : a;
  });

  const build = (tier: 'eco' | 'standard' | 'express', o: typeof eco) => ({
    tier, name: o.name, cost: o.cost,
    days_min: parseAging(o.aging).min, days_max: parseAging(o.aging).max,
  });
  // Dedup : si standard == express (peu d'options), on ne garde que les distincts.
  const tiers = [build('eco', eco), build('standard', standard), build('express', express)];
  const seen = new Set<string>();
  return tiers.filter((t) => { const k = t.name + t.cost; if (seen.has(k)) return false; seen.add(k); return true; });
}

export async function GET(req: NextRequest) {
  const runId = await startCronRun('shipping-cache');
  try {
    const result = await runShippingCache();
    await finishCronRun(runId, { itemsProcessed: result.checked ?? 0, status: 'success' });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    await finishCronRun(runId, { itemsProcessed: 0, status: 'error', errorMessage: String(e?.message || e) });
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

async function runShippingCache() {
  const email = process.env.CJ_EMAIL;
  const apiKey = process.env.CJ_API_KEY;
  if (!email || !apiKey) {
    throw new Error('CJ_EMAIL / CJ_API_KEY absents');
  }

  // 1. Produits reellement vendus (CJ uniquement)
  const { data: sels, error: selErr } = await supabaseAdmin
    .from('site_catalog_selections')
    .select('catalog_product_id, sites(id)');
  if (selErr) throw new Error(selErr.message);
  if (!sels || sels.length === 0) {
    return { checked: 0, message: 'Aucun produit vendu' };
  }

  // Map produit -> ensemble des site_id qui le vendent
  const productSites = new Map<string, Set<string>>();
  for (const s of sels as any[]) {
    const siteId = s.sites?.id;
    if (!siteId) continue;
    const set = productSites.get(s.catalog_product_id) || new Set<string>();
    set.add(siteId);
    productSites.set(s.catalog_product_id, set);
  }

  // 2. Resoudre les produits CJ (supplier_product_id)
  const { data: products, error: prodErr } = await supabaseAdmin
    .from('catalog_products')
    .select('id, supplier_product_id, supplier_id')
    .eq('supplier_id', 'cj')
    .in('id', [...productSites.keys()]);
  if (prodErr) throw new Error(prodErr.message);
  if (!products || products.length === 0) {
    return { checked: 0, message: 'Aucun produit CJ vendu' };
  }

  // 3. Pays reellement commandes, par site
  const allSiteIds = new Set<string>();
  for (const set of productSites.values()) for (const id of set) allSiteIds.add(id);

  const { data: orders, error: ordErr } = await supabaseAdmin
    .from('shop_orders')
    .select('site_id, country_code')
    .in('site_id', [...allSiteIds])
    .not('country_code', 'is', null);
  if (ordErr) throw new Error(ordErr.message);

  // Map site_id -> ensemble des pays commandes
  const siteCountries = new Map<string, Set<string>>();
  for (const o of (orders || []) as any[]) {
    if (!o.country_code) continue;
    const set = siteCountries.get(o.site_id) || new Set<string>();
    set.add(o.country_code);
    siteCountries.set(o.site_id, set);
  }

  // 4. Construire les paires produit x pays a calculer
  type Pair = { catalogId: string; supplierProductId: string; country: string };
  const pairs: Pair[] = [];
  for (const p of products as any[]) {
    const sites = productSites.get(p.id);
    if (!sites) continue;
    const countries = new Set<string>();
    for (const siteId of sites) {
      const cs = siteCountries.get(siteId);
      if (cs) for (const c of cs) countries.add(c);
    }
    for (const country of countries) {
      pairs.push({ catalogId: p.id, supplierProductId: p.supplier_product_id, country });
    }
  }

  if (pairs.length === 0) {
    return { checked: 0, message: 'Aucune paire produit x pays (pas encore de commandes)' };
  }

  // 5. Filtrer : ne garder que les paires absentes ou perimees
  const { data: cached } = await supabaseAdmin
    .from('shipping_cache')
    .select('supplier_product_id, country_code, updated_at')
    .eq('supplier_id', 'cj');

  const freshKey = new Set<string>();
  const staleMs = STALE_HOURS * 3600 * 1000;
  const now = Date.now();
  for (const c of (cached || []) as any[]) {
    const age = now - new Date(c.updated_at).getTime();
    if (age < staleMs) freshKey.add(`${c.supplier_product_id}::${c.country_code}`);
  }

  const todo = pairs.filter(
    (p) => !freshKey.has(`${p.supplierProductId}::${p.country}`)
  );

  if (todo.length === 0) {
    return { checked: 0, total_pairs: pairs.length, message: 'Cache a jour' };
  }

  // 6. Traiter un lot
  const batch = todo.slice(0, BATCH_SIZE);
  let written = 0;
  let apiErrors = 0;
  let aborted = false;

  for (const pair of batch) {
    if (apiErrors >= Math.ceil(batch.length * ABORT_ERROR_RATIO)) {
      aborted = true;
      break;
    }

    // Appel 1 : variantes (pour le vid)
    await sleep(RATE_LIMIT_MS);
    let vid: string | null = null;
    try {
      const variants: any = await cjGetVariants(email, apiKey, pair.supplierProductId);
      if (Array.isArray(variants) && variants.length > 0) {
        vid = variants[0].vid || variants[0].variantId || null;
      }
    } catch (e: any) {
      apiErrors++;
      console.warn(`[shipping-cache] variants ${pair.supplierProductId}: ${String(e?.message || e).slice(0, 100)}`);
      continue;
    }
    if (!vid) {
      // Produit sans variante exploitable : on saute, pas une erreur API
      continue;
    }

    // Appel 2 : freight
    await sleep(RATE_LIMIT_MS);
    let best: { price: number; aging: string } | null = null;
    let tiers: ReturnType<typeof pickThreeTiers> = null;
    try {
      const options = await cjCalculateFreight(email, apiKey, pair.country, [{ vid, quantity: 1 }]);
      best = lowestPrice(options);
      tiers = pickThreeTiers(options);
    } catch (e: any) {
      apiErrors++;
      console.warn(`[shipping-cache] freight ${pair.supplierProductId}/${pair.country}: ${String(e?.message || e).slice(0, 100)}`);
      continue;
    }

    if (!best) continue;

    const { min, max } = parseAging(best.aging);

    // Upsert (la contrainte unique garantit une seule ligne par paire)
    const { error: upErr } = await supabaseAdmin
      .from('shipping_cache')
      .upsert(
        {
          supplier_id: 'cj',
          supplier_product_id: pair.supplierProductId,
          country_code: pair.country,
          shipping_cost: best.price,
          days_min: min,
          days_max: max,
          tiers: tiers ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'supplier_id,supplier_product_id,country_code' }
      );
    if (!upErr) written++;
  }

  return {
    checked: batch.length,
    written,
    api_errors: apiErrors,
    aborted,
    total_pairs: pairs.length,
    remaining: todo.length - batch.length,
  };
}
