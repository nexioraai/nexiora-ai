import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { cjFetch } from '@/lib/cj/client';
import { NEXIORA_COMMISSION_PERCENT } from '@/lib/pricing';
import { Resend } from 'resend';
import { startCronRun, finishCronRun } from '@/lib/cron-tracker';

export const maxDuration = 300;

/**
 * Lit l'etat reel chez le fournisseur, le compare a notre cache, produit un
 * rapport (checkout_anomalies + email si bloquant).
 *
 * ECRITURES AUTORISEES, strictement limitees a :
 *   - last_checked_at : rotation des lots
 *   - in_stock : la vitrine et la recherche filtrent dessus, un produit epuise
 *     doit disparaitre de l'affichage plutot que d'etre refuse au paiement
 *
 * Ne modifie NI les prix, NI les selections marchands. Un ecart de prix est
 * signale, jamais corrige automatiquement : la decision revient au marchand.
 */

const BATCH_SIZE = 170;          // mesure : 170 produits = 239s (maxDuration 300s)
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

/** disappeared et manual_price_underwater exigent une action : email immediat.
 *  out_of_stock et price_spike sont informatifs : visibles sur /admin seulement. */
const SEVERITY: Record<Finding['kind'], 'blocked' | 'warning'> = {
  disappeared: 'blocked',
  out_of_stock: 'warning',
  manual_price_underwater: 'blocked',
  price_spike: 'warning',
};

const ADMIN_EMAIL = 'issayamiyoussouf@gmail.com';

/** CJ renvoie une fourchette "0.58-93.24" : on retient la borne basse. */
function parseLowPrice(sellPrice: unknown): number | null {
  if (typeof sellPrice !== 'string') return null;
  const first = sellPrice.split('-')[0]?.trim();
  const n = Number(first);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// LOT K (Mode 3 global, F-CRON-01) -- cette route n'avait AUCUN controle
// CRON_SECRET (le parametre `req` n'etait meme pas lu). N'importe qui
// pouvait la declencher : appels CJ reels consommant le quota/points de
// l'API (ressource limitee et partagee avec le checkout/fulfillment reel),
// ecritures reelles sur catalog_products (in_stock, last_checked_at), et
// declenchement d'emails d'alerte admin. Meme pattern fail-closed que
// toutes les autres routes cron du depot (cf. cj-tracking/route.ts,
// pod-reconciliation/route.ts -- deja identifie et corrige partout ailleurs,
// cette route avait ete manquee).
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== 'Bearer ' + secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runId = await startCronRun('supplier-watch');
  try {
    const res = await runWatch();
    let checked = 0;
    try {
      checked = Number((await res.clone().json())?.checked ?? 0);
    } catch (e) {
      console.error('watchdog: failed to parse checked count', e);
    }
    await finishCronRun(runId, { itemsProcessed: checked });
    return res;
  } catch (e: any) {
    await finishCronRun(runId, { itemsProcessed: 0, status: 'error', errorMessage: e?.message || String(e) });
    throw e;
  }
}

async function runWatch() {
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
  const outOfStockIds: string[] = [];
  const backInStockIds: string[] = [];
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

    // Rupture de stock. listedNum absent => -1 : donnee non fiable, on n'ecrit rien.
    const listed = Number(raw?.listedNum ?? -1);
    if (listed === 0) {
      outOfStockIds.push(p.id);
      findings.push({
        kind: 'out_of_stock',
        supplier_product_id: p.supplier_product_id,
        name: p.name,
        detail: 'Stock epuise chez le fournisseur',
      });
    } else if (listed > 0) {
      backInStockIds.push(p.id);
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

  // La vitrine et la recherche filtrent sur in_stock : un produit epuise
  // disparait de l'affichage au lieu d'etre refuse au moment du paiement.
  if (outOfStockIds.length > 0) {
    const { error } = await supabaseAdmin
      .from('catalog_products')
      .update({ in_stock: false })
      .in('id', outOfStockIds);
    if (error) console.error('[supplier-watch] update in_stock=false', error.message);
  }

  if (backInStockIds.length > 0) {
    const { error } = await supabaseAdmin
      .from('catalog_products')
      .update({ in_stock: true })
      .in('id', backInStockIds);
    if (error) console.error('[supplier-watch] update in_stock=true', error.message);
  }

  // 5. Persistance des findings (visibles sur /admin)
  if (findings.length > 0) {
    const rows = findings.map((f) => ({
      type: 'sw_' + f.kind,
      severity: SEVERITY[f.kind],
      site_id: null,
      slug: null,
      details: {
        supplier_product_id: f.supplier_product_id,
        name: f.name,
        detail: f.detail,
        supplier: 'cj',
      },
    }));
    const { error: insErr } = await supabaseAdmin.from('checkout_anomalies').insert(rows);
    if (insErr) console.error('[supplier-watch] insert anomalies failed', insErr.message);
  }

  // 6. Un seul email, uniquement si action requise
  const blocking = findings.filter((f) => SEVERITY[f.kind] === 'blocked');
  if (blocking.length > 0 && process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const lines = blocking
        .map((f) => '<tr><td>' + f.kind + '</td><td>' + f.name + '</td><td>' + f.detail + '</td></tr>')
        .join('');
      await resend.emails.send({
        from: 'Deribfy Alerts <no-reply@deribfy.com>',
        to: ADMIN_EMAIL,
        subject: '\u26a0\ufe0f Surveillance fournisseur : ' + blocking.length + ' produit(s) a verifier',
        html:
          '<p><strong>' + blocking.length + '</strong> anomalie(s) bloquante(s) sur ' +
          checkedIds.length + ' produits verifies.</p>' +
          '<table cellpadding="6" border="1" style="border-collapse:collapse">' +
          '<tr><th>Type</th><th>Produit</th><th>Detail</th></tr>' + lines + '</table>' +
          '<p style="color:#888;font-size:12px">' +
          (findings.length - blocking.length) + ' anomalie(s) non bloquante(s) consultables dans /admin.</p>',
      });
    } catch (e) {
      console.error('[supplier-watch] alert failed', e);
    }
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
