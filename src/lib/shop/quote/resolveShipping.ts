import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { roundMoney } from '@/lib/pricing';
import { suppliersWithCapability } from '@/lib/suppliers/registry';
import type { ShippingRequest } from '@/lib/suppliers/supplier-adapter';
import type { ShippingTier } from '@/lib/cj/shipping-tiers';

// ============================================================
// SOURCE CANONIQUE DU DEVIS DE LIVRAISON (LOT 2).
//
// CAUSE RACINE des divergences C3 et C4 : ce n'est PAS la marge, c'est
// l'ORDRE DE PREFERENCE DES SOURCES, qui differait entre les deux routes.
//   checkout/route.ts  : cache d'abord, live en repli.
//   shipping/calculate : live d'abord, avec un retour anticipe
//                        `unavailable` place AVANT le calcul des paliers.
//
//   C3 -- cache present mais sans paliers : `calculate` renvoyait le montant
//         LIVE (sans marge), `checkout` facturait depuis le CACHE (x1.20).
//         Deux sources differentes pour un meme panier -> 20 % d'ecart entre
//         le prix affiche et le prix debite.
//   C4 -- adaptateur live en echec : `calculate` sortait en `unavailable`
//         sans jamais consulter le cache, alors qu'un cache complet et
//         valide etait disponible et que le checkout, lui, savait le
//         facturer.
//
// Les deux routes passent desormais par ce module, donc par le MEME ordre :
// cache d'abord, live en repli. La divergence devient structurellement
// impossible, sans modifier aucun prix.
//
// CONTRAINTE METIER RESPECTEE : cache d'abord signifie MOINS d'appels CJ
// live, donc moins de contention sur acquireCjSlot() -- la file globale
// partagee avec la creation des commandes fournisseur. Ce module ne cree
// jamais de commande fournisseur et n'appelle CJ qu'en dernier recours,
// exactement comme le checkout le faisait deja.
//
// LA REGLE DE MARGE N'EST PAS MODIFIEE ICI : le cache stocke le prix brut
// CJ et recoit +20 % (marge de securite contre un cache perime) ; un devis
// live, exact par nature, n'en recoit pas. Unifier la marge changerait le
// prix paye par l'acheteur -- decision commerciale, hors LOT 2.
// ============================================================

const SHIPPING_MARGIN = 1.2;

/** Derive : fournisseurs implementant reellement calculateShipping. */
const SHIPPING_SUPPLIERS = new Map(
  suppliersWithCapability('calculateShipping').map((s) => [s.id, s])
);

const TIER_KEYS = ['eco', 'standard', 'express'] as const;
export type TierKey = (typeof TIER_KEYS)[number];

/** Libelles presentes a l'acheteur. Le `logisticName` CJ reel n'est jamais
 *  expose au navigateur -- il ne sert qu'au fulfillment. */
const TIER_LABELS: Record<TierKey, string> = {
  eco: 'Économique',
  standard: 'Standard',
  express: 'Express',
};

export type ShippingTierQuote = {
  tier: TierKey;
  label: string;
  /** Transporteur CJ reel. Usage interne (shop_orders), jamais renvoye tel quel au panier. */
  logisticName: string | null;
  amount: number;
  daysMin: number | null;
  daysMax: number | null;
};

export type ShippingQuote = {
  /** 'flat' aucun fournisseur · 'cache' shipping_cache · 'live' adaptateur · 'unavailable' aucune source */
  source: 'flat' | 'cache' | 'live' | 'unavailable';
  /** Montant retenu, marge incluse et arrondi au centime. */
  amount: number;
  /** Paliers proposables a l'acheteur, ou null si la source n'en fournit pas. */
  tiers: ShippingTierQuote[] | null;
  selectedTier: TierKey | null;
  logisticName: string | null;
  estimatedMinDays: number | null;
  estimatedMaxDays: number | null;
};

export type SupplierGroups = Record<string, ShippingRequest[]>;

/** Decode "catalog-{uuid}::{variantId}" -> uuid. */
function realCatalogId(cartId: string): string {
  return cartId.replace(/^catalog-/, '').split('::')[0];
}

/**
 * Regroupe les lignes du panier par fournisseur. Extrait des deux routes,
 * qui en avaient chacune leur copie : une divergence de regroupement
 * produirait exactement le meme symptome que C3 (deux devis pour un meme
 * panier), a un endroit plus difficile a diagnostiquer.
 */
export async function buildSupplierGroups(
  items: { id: string; quantity: number }[]
): Promise<SupplierGroups> {
  const groups: SupplierGroups = {};
  const shopItems = items.filter((i) => !i.id?.startsWith('catalog-'));
  const catalogItems = items.filter((i) => i.id?.startsWith('catalog-'));

  if (shopItems.length > 0) {
    const { data: prods } = await supabaseAdmin
      .from('shop_products')
      .select('id, cj_vid')
      .in('id', shopItems.map((i) => i.id));
    for (const p of prods || []) {
      if (!p.cj_vid) continue;
      const item = shopItems.find((i) => i.id === p.id);
      if (!item) continue;
      if (!groups['cj']) groups['cj'] = [];
      groups['cj'].push({ supplier_product_id: p.cj_vid, quantity: item.quantity });
    }
  }

  if (catalogItems.length > 0) {
    const realIds = catalogItems.map((i) => realCatalogId(i.id));
    const { data: catProds } = await supabaseAdmin
      .from('catalog_products')
      .select('id, supplier_id, supplier_product_id')
      .in('id', realIds);
    for (const cp of catProds || []) {
      if (!cp.supplier_product_id || !cp.supplier_id) continue;
      // CJ tarifie la livraison au PRODUIT, pas a la variante.
      const item = catalogItems.find((i) => realCatalogId(i.id) === cp.id);
      if (!item) continue;
      if (!groups[cp.supplier_id]) groups[cp.supplier_id] = [];
      groups[cp.supplier_id].push({
        supplier_product_id: cp.supplier_product_id,
        quantity: item.quantity,
      });
    }
  }

  return groups;
}

type CacheRow = {
  supplier_product_id: string;
  shipping_cost: number;
  days_min: number | null;
  days_max: number | null;
  tiers: ShippingTier[] | null;
};

const EMPTY = (source: ShippingQuote['source'], amount: number): ShippingQuote => ({
  source, amount, tiers: null, selectedTier: null,
  logisticName: null, estimatedMinDays: null, estimatedMaxDays: null,
});

/**
 * Devis canonique. Appele a l'IDENTIQUE par l'affichage du panier et par le
 * checkout : c'est ce qui garantit "affiche = facture".
 *
 * @param requestedTier palier choisi par l'acheteur ; ignore s'il n'est pas
 *        disponible sur TOUS les produits du panier.
 * @param stateCode transmis a Printful uniquement (depend de l'adresse).
 */
export async function resolveShipping(params: {
  groups: SupplierGroups;
  countryCode: string;
  flat: number;
  requestedTier?: string | null;
  stateCode?: string | null;
}): Promise<ShippingQuote> {
  const { groups, countryCode, flat, requestedTier, stateCode } = params;

  const entries = Object.entries(groups).filter(([, list]) => list.length > 0);
  if (entries.length === 0) return EMPTY('flat', flat);

  // ---- 1. CACHE D'ABORD (CJ uniquement : seule source pre-calculee) ----
  let cjResolved = false;
  let cjAmount = 0;
  let cjTiers: ShippingTierQuote[] | null = null;
  let cjSelected: TierKey | null = null;
  let cjLogisticName: string | null = null;
  let cjMinDays: number | null = null;
  let cjMaxDays: number | null = null;

  const cjGroup = groups['cj'];
  if (cjGroup && cjGroup.length > 0) {
    const ids = cjGroup.map((g) => g.supplier_product_id);
    const { data: rowsRaw } = await supabaseAdmin
      .from('shipping_cache')
      .select('supplier_product_id, shipping_cost, days_min, days_max, tiers')
      .eq('supplier_id', 'cj')
      .eq('country_code', countryCode)
      .in('supplier_product_id', ids);
    const rows = (rowsRaw as CacheRow[] | null) || [];
    const byId = new Map(rows.map((r) => [r.supplier_product_id, r]));

    // Le cache n'est utilise que s'il couvre TOUS les produits CJ du panier :
    // un cache partiel produirait un montant incomplet.
    if (ids.every((id) => byId.has(id))) {
      // -- paliers : retenus seulement si presents sur CHAQUE produit --
      const agg: Partial<Record<TierKey, { cost: number; min: number; max: number; name: string | null }>> = {};
      for (const key of TIER_KEYS) {
        let ok = true;
        let cost = 0, min = 0, max = 0;
        const names: string[] = [];
        for (const g of cjGroup) {
          const t = byId.get(g.supplier_product_id)!.tiers?.find((x) => x.tier === key);
          if (!t) { ok = false; break; }
          names.push(String(t.name ?? '').trim());
          cost += Number(t.cost) * g.quantity;
          min = Math.max(min, t.days_min || 0);
          max = Math.max(max, t.days_max || 0);
        }
        if (!ok) continue;

        // ---- P0 multi-produits : le palier n'est PAS une identite ----
        // Ce bloc joignait les produits sur le LABEL (eco/standard/express).
        // Or deux produits peuvent porter le meme label pour des
        // TRANSPORTEURS DIFFERENTS : le code additionnait alors, par exemple,
        // DHL (produit A) et FedEx (produit B), etiquetait le resultat
        // "Express", et ne memorisait que DHL. L'acheteur se voyait proposer
        // une option de livraison qui n'existait chez AUCUN fournisseur.
        //
        // L'identite de travail est desormais le `logisticName` reel : un
        // palier n'est retenu, en multi-produits, que si TOUS les produits
        // partagent le meme transporteur. Un nom vide ne permet d'etablir
        // aucune communaute : il disqualifie le palier plutot que de laisser
        // deux inconnues se faire passer pour une egalite.
        //
        // LIMITE ASSUMEE -- `logisticName` n'est pas une identite fournisseur
        // garantie : CJ ne fournit AUCUN identifiant stable de methode (doc
        // officielle). C'est le seul discriminant disponible, donc une
        // ATTENUATION, pas une solution definitive. La cible reste un devis
        // CJ du panier complet, hors perimetre de ce correctif.
        //
        // Mono-produit : comportement strictement inchange (la contrainte ne
        // s'applique qu'a partir de deux lignes).
        const common = names[0] ?? null;
        if (cjGroup.length > 1 && (!common || names.some((n) => n !== common))) continue;

        agg[key] = { cost, min, max, name: common || null };
      }

      const available = TIER_KEYS.filter((k) => agg[k]);
      if (available.length > 0) {
        cjTiers = available.map((k) => ({
          tier: k,
          label: TIER_LABELS[k],
          logisticName: agg[k]!.name,
          amount: roundMoney(agg[k]!.cost * SHIPPING_MARGIN),
          daysMin: agg[k]!.min || null,
          daysMax: agg[k]!.max || null,
        }));
      }

      // Selection : le palier demande, sinon 'standard', sinon le premier
      // disponible. Le repli sur 'standard' reproduit exactement ce que fait
      // le panier (CartDrawer) quand il recoit les paliers sans en avoir
      // choisi un -- sans cela, l'affichage retomberait sur shipping_cost
      // pendant que l'acheteur voit, lui, le prix du palier standard.
      const chosen =
        cjTiers?.find((t) => t.tier === requestedTier) ??
        cjTiers?.find((t) => t.tier === 'standard') ??
        cjTiers?.[0] ??
        null;
      if (chosen) {
        cjAmount = chosen.amount;
        cjSelected = chosen.tier;
        cjLogisticName = chosen.logisticName;
        cjMinDays = chosen.daysMin;
        cjMaxDays = chosen.daysMax;
      } else {
        // Repli historique : borne basse du cache (shipping_cost), meme marge.
        let raw = 0, min = 0, max = 0;
        for (const g of cjGroup) {
          const r = byId.get(g.supplier_product_id)!;
          raw += Number(r.shipping_cost) * g.quantity;
          min = Math.max(min, Number(r.days_min) || 0);
          max = Math.max(max, Number(r.days_max) || 0);
        }
        cjAmount = roundMoney(raw * SHIPPING_MARGIN);
        cjMinDays = min || null;
        cjMaxDays = max || null;
      }
      // Un cache couvrant les produits mais sans montant exploitable (ni
      // palier, ni shipping_cache.shipping_cost numerique) n'est PAS une
      // source valide : on retombe sur le live plutot que de facturer NaN.
      cjResolved = Number.isFinite(cjAmount);
      if (!cjResolved) {
        cjAmount = 0;
        cjTiers = null;
        cjSelected = null;
        cjLogisticName = null;
        cjMinDays = null;
        cjMaxDays = null;
      }
    }
  }

  // ---- 2. LIVE, uniquement pour ce que le cache ne couvre pas ----
  let liveTotal = 0;
  let liveMin: number | null = null;
  let liveMax: number | null = null;
  let liveCount = 0;

  for (const [supplierId, groupItems] of entries) {
    if (supplierId === 'cj' && cjResolved) continue;
    const supplier = SHIPPING_SUPPLIERS.get(supplierId);
    if (!supplier?.adapter.calculateShipping) continue;
    const creds = supplierId === 'printful'
      ? { ...supplier.credentials, state_code: stateCode || '' }
      : supplier.credentials;
    try {
      const r = await supplier.adapter.calculateShipping(groupItems, countryCode, creds);
      liveTotal += r.total_cost;
      liveMin = liveMin === null ? r.estimated_days_min : Math.min(liveMin, r.estimated_days_min);
      liveMax = liveMax === null ? r.estimated_days_max : Math.max(liveMax, r.estimated_days_max);
      liveCount += 1;
    } catch (err: unknown) {
      console.error('[resolveShipping]', supplierId, 'failed:', err instanceof Error ? err.message : String(err));
    }
  }

  // ---- 3. Agregation ----
  if (!cjResolved && liveCount === 0) return EMPTY('unavailable', 0);

  const amount = roundMoney(cjAmount + liveTotal);
  const minDays = [cjMinDays, liveMin].filter((d): d is number => d != null);
  const maxDays = [cjMaxDays, liveMax].filter((d): d is number => d != null);

  return {
    source: cjResolved && liveCount > 0 ? 'cache' : cjResolved ? 'cache' : 'live',
    amount,
    tiers: cjTiers,
    selectedTier: cjSelected,
    logisticName: cjLogisticName,
    estimatedMinDays: minDays.length ? Math.min(...minDays) : null,
    estimatedMaxDays: maxDays.length ? Math.max(...maxDays) : null,
  };
}
