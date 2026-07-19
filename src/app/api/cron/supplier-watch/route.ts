import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { cjFetch } from '@/lib/cj/client';
import { NEXIORA_COMMISSION_PERCENT } from '@/lib/pricing';

export const maxDuration = 60;

/**
 * OBSERVATION SEULE - ce cron ne modifie NI les prix, NI in_stock, NI les
 * selections marchands. Il lit l'etat reel chez le fournisseur, le compare
 * a notre cache, et produit un rapport. Seule ecriture : last_checked_at,
 * qui sert uniquement a faire tourner les lots.
 *
 * Une fois la fiabilite des detections verifiee sur plusieurs jours, on
 * pourra decider quelles actions automatiser.
 */

const BATCH_SIZE = 35;          // mesure : 45 produits = 64s, au-dela de maxDuration
const RATE_LIMIT_MS = 1100;     // CJ : 1 requete/seconde stricte
const ABORT_ERROR_RATIO = 0.2;  // au-dela, on suppose une panne API et on arrete
const PRICE_SPIKE_FACTOR = 2;   // hausse consideree comme brutale

type Finding = {
  kind: 'disappeared' | 'out_of_stock' | 'manual_price_underwater' | 'price_spike';
  supplier_product_id: string;
  name: string;
  detail: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** CJ renvoie une fourchette "0.58-93.24" : on retient la borne basse. */
function parseLowPrice(sellPrice: unknown): number | null {
  if (typeof sellPrice !== 'string') return null;
  const first = sellPrice.split('-')[0]?.trim();
  const n = Number(first);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(req: NextRequest) {
  const started = Date.now();

  const email = process.env.CJ_EMAIL;
  const apiKey = process.env.CJ_API_KEY;
  if (!email || !apiKey) {
    return NextResponse.json({ error: 'Identifiants CJ absents' }, { status: 500 });
  }

  // 1. Produits reellement vendus par au moins un marchand
  const { data: sels, error: selErr } = await supabaseAdmin
    .from('site_catalog_selections')
    .select('catalog_product_id, sell_price, sites(slug, cj_margin_percent)');

  if (selErr) {
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }
  if (!sels || sels.length === 0) {
    return NextResponse.json({ done: true, checked: 0, message: 'Aucun produit vendu' });
  }

  // Un produit peut etre vendu par plusieurs marchands : on regroupe.
  const byProduct = new Map<string, { manualPrices: number[] }>();
  for (const s of sels as any[]) {
    const entry = byProduct.get(s.catalog_product_id) || { manualPrices: [] };
    if (s.sell_price != null && Number(s.sell_price) > 0) {
      entry.manualPrices.push(Number(s.sell_price));
    }
    byProduct.set(s.catalog_product_id, entry);
  }

  // 2. Lot le plus anciennement verifie (nulls d'abord)
  const { data: products, error: prodErr } = await supabaseAdmin
    .from('catalog_products')
    .select('id, supplier_product_id, name, price, in_stock, last_checked_at')
    .eq('supplier_id', 'cj')
    .in('id', [...byProduct.keys()])
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE);

  if (prodErr) {
    return NextResponse.json({ error: prodErr.message }, { status: 500 });
  }
  if (!products || products.length === 0) {
    return NextResponse.json({ done: true, checked: 0, message: 'Rien a verifier' });
  }

  // 3. Interrogation du fournisseur
  const findings: Finding[] = [];
  const checkedIds: string[] = [];
  let apiErrors = 0;
  let aborted = false;

  for (const p of products) {
    // Panne API probable : on arrete plutot que de conclure a tort.
    if (apiErrors >= Math.ceil(products.length * ABORT_ERROR_RATIO)) {
      aborted = true;
      break;
    }

    await sleep(RATE_LIMIT_MS);

    let raw: any = null;
    try {
      raw = await cjFetch(email, apiKey, `/product/query?pid=${encodeURIComponent(p.supplier_product_id)}`);
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (/product not found/i.test(msg)) {
        findings.push({
          kind: 'disappeared',
          supplier_product_id: p.supplier_product_id,
          name: p.name,
          detail: 'Produit introuvable chez le fournisseur',
        });
        checkedIds.push(p.id);
      } else {
        // Rate limit, timeout, panne : ce n'est PAS une disparition.
        apiErrors++;
        console.warn(`[supplier-watch] ${p.supplier_product_id}: ${msg.slice(0, 120)}`);
      }
      continue;
    }

    checkedIds.push(p.id);

    // Rupture de stock
    const listed = Number(raw?.listedNum ?? -1);
    if (listed === 0) {
      findings.push({
        kind: 'out_of_stock',
        supplier_product_id: p.supplier_product_id,
        name: p.name,
        detail: 'Stock epuise chez le fournisseur',
      });
    }

    // Comparaison de prix
    const livePrice = parseLowPrice(raw?.sellPrice);
    const cachedPrice = Number(p.price) || 0;
    if (livePrice && cachedPrice > 0) {
      if (livePrice > cachedPrice * PRICE_SPIKE_FACTOR) {
        findings.push({
          kind: 'price_spike',
          supplier_product_id: p.supplier_product_id,
          name: p.name,
          detail: `Cout ${cachedPrice}$ -> ${livePrice}$ (x${(livePrice / cachedPrice).toFixed(1)})`,
        });
      }

      // Prix fixes manuellement : la marge en % ne protege plus.
      const breakeven = livePrice * (1 + NEXIORA_COMMISSION_PERCENT / 100);
      const manual = byProduct.get(p.id)?.manualPrices || [];
      for (const mp of manual) {
        if (mp < breakeven) {
          findings.push({
            kind: 'manual_price_underwater',
            supplier_product_id: p.supplier_product_id,
            name: p.name,
            detail: `Prix fixe ${mp}$ sous le seuil ${breakeven.toFixed(2)}$ (cout ${livePrice}$ + commission)`,
          });
        }
      }
    }
  }

  // 4. Rotation des lots : seule ecriture de ce cron
  if (checkedIds.length > 0) {
    await supabaseAdmin
      .from('catalog_products')
      .update({ last_checked_at: new Date().toISOString() })
      .in('id', checkedIds);
  }

  const elapsed = Math.round((Date.now() - started) / 1000);
  const summary = {
    done: true,
    mode: 'observation',
    batch: products.length,
    checked: checkedIds.length,
    api_errors: apiErrors,
    aborted,
    elapsed_s: elapsed,
    findings_count: findings.length,
    findings,
  };

  console.log('[supplier-watch]', JSON.stringify({ ...summary, findings: findings.length }));
  return NextResponse.json(summary);
}
