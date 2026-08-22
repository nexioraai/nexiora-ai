import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { cjCalculateFreight, cjCreateOrder, cjGetVariants, CjApiError } from './client';
import { reconcileWithCj, type ReconciliationOutcome } from './reconcile';
import { logAnomaly } from '@/lib/anomaly';

// Exportes : le cron cj-fulfillment-reconciliation utilise les memes valeurs
// pour sa requete d'eligibilite -- une seule source de verite.
export const MAX_CREATE_ATTEMPTS = 3;
// Verrou 'processing' considere abandonne (crash/timeout sans ecriture d'etat
// terminal) au-dela de ce delai -- eligible a une reprise par ce meme appel
// direct (handlePaidCheckout) ou par le cron cj-fulfillment-reconciliation.
export const STALE_LOCK_MS = 15 * 60 * 1000;

// Mode 3 : Nexiora possede le compte fournisseur. Le marchand ne connecte rien.
const CJ_EMAIL = process.env.CJ_EMAIL || '';
const CJ_API_KEY = process.env.CJ_API_KEY || '';

/**
 * Détermine si une erreur CJ est permanente (inutile de réessayer).
 *
 * Audit API Points, Finding 1 : `insufficient` était auparavant générique --
 * introduit dans bc26f05 (2026-06-22) pour capturer "insufficient balance"
 * du garde-fou solde payType 2, mode aujourd'hui abandonné (payType 3 ne
 * vérifie plus de solde). Le message officiel CJ d'épuisement des API
 * Points contient littéralement "Insufficient API points" -- resserré à
 * 'insufficient balance' pour ne plus jamais matcher ce cas, qui doit être
 * traité comme transitoire (isRateLimitError, ci-dessous), pas permanent.
 */
function isPermanentError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes('param') ||
    m.includes('invalid') ||
    m.includes('insufficient balance') ||
    m.includes('not found') ||
    m.includes('not a cj')
  );
}

/**
 * Détecte un rejet CJ transitoire lié à un quota compte (QPS ou API Points) --
 * audit hostile rate-limit + audit API Points. Deux causes distinctes,
 * documentées séparément par CJ, mais traitées de façon identique côté
 * comptabilité des tentatives (ni l'une ni l'autre n'est la faute de la
 * commande, ni l'une ni l'autre ne doit consommer cj_pay_attempts) :
 *   - QPS : "Too Many Requests, QPS limit is 1 time/1second" (observé réellement).
 *   - API Points : "Insufficient API points. Used today: X, Remaining: 0,
 *     Required: N" -- HTTP 429, documentation officielle CJ consultée
 *     directement (developers.cjdropshipping.cn/en/api/api2/standard/points.html).
 *     Les points se réapprovisionnent en continu (Total/1440 par minute) --
 *     un épuisement se résorbe en quelques minutes, largement sous le
 *     cycle du cron de réconciliation (2h).
 * httpStatus===429 reste un filet de sécurité générique pour toute cause de
 * 429 non reconnue par le texte -- jamais classifié comme permanent par
 * défaut, cohérent avec le principe "ne jamais deviner en cas d'incertitude".
 */
function isRateLimitError(e: unknown): boolean {
  const msg = String(e instanceof Error ? e.message : e).toLowerCase();
  if (msg.includes('api points')) return true;
  if (msg.includes('too many requests') || msg.includes('qps limit')) return true;
  if (e instanceof CjApiError && e.httpStatus === 429) return true;
  return false;
}

/** Classification fine du rejet transitoire, à seule fin d'observabilité
 * (le traitement -- pas de décrément, retry cron -- reste identique pour les
 * trois cas ; seule la trace loguée distingue la cause probable). */
function rateLimitKind(e: unknown): 'qps' | 'api_points' | 'unknown_429' {
  const msg = String(e instanceof Error ? e.message : e).toLowerCase();
  if (msg.includes('api points')) return 'api_points';
  if (msg.includes('too many requests') || msg.includes('qps limit')) return 'qps';
  return 'unknown_429';
}

/** Pays où province/état est opérationnellement nécessaire à la livraison
 * (nécessite un numéro de subdivision pour l'acheminement postal/douanier) --
 * connaissance postale générale, PAS une exigence CJ documentée (l'ambiguïté
 * du mot "Required" dans la doc CJ n'a jamais été tranchée, cf. audit
 * adresse). Liste volontairement courte : ne bloque QUE les pays où
 * l'absence de province est un vrai problème connu, laisse passer les
 * autres sans validation artificielle.
 */
const COUNTRIES_REQUIRING_PROVINCE = new Set(['US', 'CA', 'AU', 'MX', 'BR', 'IT', 'ES', 'CN', 'JP', 'IN']);

type OrderRow = {
  id: string;
  site_id: string;
  cj_pay_attempts: number | null;
};

/**
 * Marque une commande definitivement epuisee (plus de tentative de création
 * possible) et alerte -- une seule fois, garanti par la clause de statut :
 * un second appel trouve deja 'failed' et ne matche aucune ligne.
 */
async function markExhausted(order: OrderRow, reason: string, extra: Record<string, unknown> = {}): Promise<void> {
  const { data } = await supabaseAdmin
    .from('shop_orders')
    .update({ cj_pay_status: 'failed' })
    .eq('id', order.id)
    .in('cj_pay_status', ['pending', 'processing'])
    .select('id');
  if (data && data.length > 0) {
    await logAnomaly({
      type: 'cj_fulfill_exhausted',
      severity: 'blocked',
      siteId: order.site_id,
      details: { orderId: order.id, reason, attempts: order.cj_pay_attempts ?? null, ...extra },
    });
  }
}

/**
 * Applique un résultat de réconciliation (audit Reseller/CJ §4/§7/§9/§10/§11)
 * à l'état persisté. Partagé entre la réconciliation pré-création et la
 * réconciliation déclenchée par 1603003 -- même logique, deux points d'entrée.
 *
 * `resumedStale` : true si ce passage reprend un verrou 'processing' déjà
 * ancien (donc au moins une réconciliation précédente a déjà échoué à
 * conclure). Sur un nouveau résultat UNKNOWN dans ce cas, on n'attend plus
 * indéfiniment -- on bascule en `blocked_unknown` avec alerte, plutôt que de
 * laisser la commande en 'processing' pour toujours.
 */
async function applyReconciliationOutcome(
  order: OrderRow,
  outcome: ReconciliationOutcome,
  vids: string[],
  resumedStale: boolean
): Promise<{ done: boolean; vids: string[] }> {
  switch (outcome.kind) {
    case 'NOT_FOUND':
      return { done: false, vids };

    case 'FOUND_PAID':
      await supabaseAdmin
        .from('shop_orders')
        .update({ cj_order_id: outcome.cjOrderId, cj_pay_status: 'paid' })
        .eq('id', order.id);
      return { done: true, vids };

    case 'FOUND_AWAITING':
      await supabaseAdmin
        .from('shop_orders')
        .update({ cj_order_id: outcome.cjOrderId, cj_pay_status: 'awaiting_manual_payment' })
        .eq('id', order.id);
      // Meme alerte que la creation directe : Youssouf doit payer cette
      // commande, que sa decouverte vienne d'une creation reussie ou d'une
      // reconciliation de recuperation -- corrige la regression identifiee
      // pendant l'audit (branche de recuperation historique silencieuse).
      await logAnomaly({
        type: 'cj_awaiting_manual_payment',
        severity: 'warning',
        siteId: order.site_id,
        details: { orderId: order.id, cjOrderId: outcome.cjOrderId, recoveredViaReconciliation: true },
      });
      return { done: true, vids };

    case 'FOUND_TERMINAL':
      await supabaseAdmin
        .from('shop_orders')
        .update({ cj_order_id: outcome.cjOrderId, cj_pay_status: 'blocked_terminal' })
        .eq('id', order.id);
      await logAnomaly({
        type: 'cj_terminal_order_blocked',
        severity: 'blocked',
        siteId: order.site_id,
        details: { orderId: order.id, cjOrderId: outcome.cjOrderId, rawStatus: outcome.raw?.orderStatus ?? null },
      });
      return { done: true, vids };

    case 'FOUND_UNRECOGNIZED':
      await supabaseAdmin
        .from('shop_orders')
        .update({ cj_order_id: outcome.cjOrderId, cj_pay_status: 'blocked_unknown' })
        .eq('id', order.id);
      await logAnomaly({
        type: 'cj_reconciliation_unknown',
        severity: 'blocked',
        siteId: order.site_id,
        details: { orderId: order.id, cjOrderId: outcome.cjOrderId, reason: 'unrecognized_status', rawStatus: outcome.raw?.orderStatus ?? null },
      });
      return { done: true, vids };

    case 'UNKNOWN': {
      if (resumedStale) {
        // Deja tente au moins une fois, toujours inconnu -- ne pas attendre
        // indefiniment. Bascule en etat bloque + alerte pour intervention.
        await supabaseAdmin.from('shop_orders').update({ cj_pay_status: 'blocked_unknown' }).eq('id', order.id);
        await logAnomaly({
          type: 'cj_reconciliation_unknown',
          severity: 'blocked',
          siteId: order.site_id,
          details: { orderId: order.id, reason: outcome.reason, persistent: true },
        });
        return { done: true, vids };
      }
      // Premiere occurrence : reste 'processing' (verrou deja pose, non
      // libere) pour qu'un futur passage retente la reconciliation sans
      // risque de recreation -- pas d'email immediat, simple trace.
      await logAnomaly({
        type: 'cj_reconciliation_unknown',
        severity: 'info',
        siteId: order.site_id,
        details: { orderId: order.id, reason: outcome.reason, persistent: false },
      });
      return { done: true, vids };
    }
  }
}

/**
 * Exécute le dropshipping CJ pour une commande payée (côté client).
 * Lignes avec cj_vid → commande CJ. Lignes sans cj_vid → ignorées (stock).
 * Credentials Nexiora (CJ_EMAIL / CJ_API_KEY) : le marchand ne connecte pas
 * de compte CJ. Semi-automatique (payType 3) : la commande est créée chez CJ
 * mais jamais payée automatiquement -- Youssouf paie manuellement ensuite.
 *
 * PRINCIPE FONDAMENTAL (audit Reseller/CJ) : réconciliation avant création,
 * toujours. Un timeout/erreur réseau après createOrderV2 n'est jamais
 * interprété comme "la commande n'a pas été créée" -- seule une réponse CJ
 * confirmant explicitement l'absence (1600300) autorise une nouvelle
 * création.
 *
 * Audit API Points, Finding 2 : le verrou atomique est désormais acquis
 * AVANT la résolution produit/variante (et non après) -- cette résolution
 * effectue de vrais appels CJ (cjGetVariants) qui peuvent échouer pour les
 * mêmes raisons que la création (429, points épuisés, réseau, mapping
 * invalide). Sous verrou, un échec de résolution devient un état persisté,
 * alerté et rejouable plutôt qu'un retour silencieux -- aucune commande
 * payée ne peut plus rester bloquée sans trace pour cette raison.
 */
export async function fulfillCjOrder(orderId: string): Promise<string[]> {
  const { data: orderRaw } = await supabaseAdmin
    .from('shop_orders')
    .select('id, site_id, shipping_address, customer_name, customer_email, cj_pay_status, cj_pay_attempts, cj_pay_locked_at, shipping_amount, shipment_logistic_name, total')
    .eq('id', orderId)
    .maybeSingle();
  if (!orderRaw) return [];
  const order = orderRaw as any;

  if (!CJ_EMAIL || !CJ_API_KEY) {
    console.error('CJ fulfill: credentials Nexiora absents (CJ_EMAIL / CJ_API_KEY)');
    return [];
  }

  // Etat deja resolu (paid / awaiting_manual_payment / blocked_terminal /
  // blocked_unknown / canceled / failed-definitif) -- rien a faire, et
  // surtout ne jamais risquer d'ecraser cet etat via les gardes plus bas
  // (adresse/shipping), qui historiquement n'avaient aucune clause de statut.
  if (!['pending', 'failed', 'processing'].includes(order.cj_pay_status)) {
    return [];
  }

  // Tentatives de creation deja epuisees mais jamais marquees -- n'arrive
  // plus en fonctionnement normal (chaque echec de creation marque desormais
  // explicitement), garde defensive pour tout etat herite.
  if ((order.cj_pay_attempts || 0) >= MAX_CREATE_ATTEMPTS && order.cj_pay_status !== 'failed') {
    await markExhausted(order as OrderRow, 'attempts_exhausted_precheck');
    return [];
  }

  const { data: items } = await supabaseAdmin
    .from('shop_order_items')
    .select('quantity, product_id')
    .eq('order_id', order.id);
  if (!items || items.length === 0) return [];

  // --- Verrou atomique : deplace AVANT la resolution produit/variante
  // (audit API Points, Finding 2) -- PUR mutex, decouple du budget de
  // tentatives (audit §10/§14). Une reconciliation seule (getOrderDetail)
  // ne consomme jamais de tentative -- seul un appel createOrderV2 reel le
  // fait, plus bas. Toute ecriture qui suit ce point est protegee par ce
  // verrou : plus besoin de garde de statut defensive sur les ecritures
  // d'echec (adresse/shipping), un seul worker peut s'y trouver a la fois.
  const nowIso = new Date().toISOString();
  const { data: freshLock } = await supabaseAdmin
    .from('shop_orders')
    .update({ cj_pay_status: 'processing', cj_pay_locked_at: nowIso })
    .eq('id', order.id)
    .in('cj_pay_status', ['pending', 'failed'])
    .select('id');

  let claimed = !!(freshLock && freshLock.length > 0);
  let resumedStale = false;

  if (!claimed) {
    // Pas de verrou libre -- peut-etre un verrou 'processing' abandonne
    // (crash/timeout precedent sans ecriture d'etat terminal). Tente une
    // reprise uniquement si suffisamment ancien : si un autre worker le
    // detient legitimement et recemment, cette clause ne matche rien.
    const staleThreshold = new Date(Date.now() - STALE_LOCK_MS).toISOString();
    const { data: resumed } = await supabaseAdmin
      .from('shop_orders')
      .update({ cj_pay_locked_at: nowIso })
      .eq('id', order.id)
      .eq('cj_pay_status', 'processing')
      .or(`cj_pay_locked_at.is.null,cj_pay_locked_at.lt.${staleThreshold}`)
      .select('id');
    if (resumed && resumed.length > 0) {
      claimed = true;
      resumedStale = true;
    }
  }

  if (!claimed) {
    // Deja payee, deja en cours (verrou recent, worker actif), tentatives
    // epuisees, ou etat terminal atteint entre-temps -> rien a faire.
    return [];
  }

  const productIds = items.map((it: any) => it.product_id).filter(Boolean);

  // Sépare produits shop vs catalogue
  const shopIds = productIds.filter((id: string) => !id.startsWith('catalog-'));
  const catalogIds = productIds.filter((id: string) => id.startsWith('catalog-'));

  const vidById = new Map<string, string>();
  // Trace chaque echec de resolution (audit API Points, Finding 2) : jamais
  // une simple continuation silencieuse. `transient` distingue un rejet CJ
  // reconnu comme rate-limit (QPS/API Points, se resout seul) d'un probleme
  // de mapping (permanent, necessite une correction humaine).
  const resolutionErrors: { source: string; reason: string; transient: boolean }[] = [];

  // Produits shop classiques (shop_products.cj_vid)
  if (shopIds.length > 0) {
    const { data: products } = await supabaseAdmin
      .from('shop_products')
      .select('id, cj_vid')
      .in('id', shopIds);
    const foundIds = new Set((products || []).map((p: any) => p.id));
    (products || []).forEach((p: any) => {
      if (p.cj_vid) vidById.set(p.id, p.cj_vid);
      else resolutionErrors.push({ source: p.id, reason: 'shop_product_missing_cj_vid', transient: false });
    });
    for (const id of shopIds) {
      if (!foundIds.has(id)) resolutionErrors.push({ source: id, reason: 'shop_product_not_found_in_db', transient: false });
    }
  }

  // Produits catalogue (catalog_products.supplier_product_id = pid CJ)
  if (catalogIds.length > 0) {
    const stripVariant = (v: string) => String(v).replace(/^catalog-/, '').split('::')[0];
    const chosenVid = new Map<string, string>();
    for (const cid of catalogIds) {
      const parts = String(cid).replace(/^catalog-/, '').split('::');
      if (parts[1]) chosenVid.set(parts[0], parts[1]);
    }
    const realIds = catalogIds.map((id: string) => stripVariant(id));
    const { data: catProds } = await supabaseAdmin
      .from('catalog_products')
      .select('id, supplier_product_id')
      .in('id', realIds);
    const catProdById = new Map((catProds || []).map((cp: any) => [cp.id, cp]));
    for (const realId of new Set(realIds)) {
      const cp = catProdById.get(realId) as { id: string; supplier_product_id: string | null } | undefined;
      if (!cp) {
        resolutionErrors.push({ source: realId, reason: 'catalog_product_not_found_in_db', transient: false });
        continue;
      }
      if (!cp.supplier_product_id) {
        resolutionErrors.push({ source: cp.id, reason: 'catalog_product_missing_supplier_id', transient: false });
        continue;
      }
      try {
        // Respecter la variante choisie par l'acheteur. Sans choix explicite,
        // on retombe sur la premiere variante du produit.
        const picked = chosenVid.get(cp.id);
        if (picked) {
          vidById.set('catalog-' + cp.id, picked);
          continue;
        }
        // Throttle CJ desormais global (cjFetch -> acquireCjSlot, audit
        // hostile Phase 1-2) : plus besoin d'un sleep manuel ici, chaque
        // appel reseau reel est deja espace au niveau le plus bas.
        const variants = await cjGetVariants(CJ_EMAIL, CJ_API_KEY, cp.supplier_product_id);
        const firstVid = Array.isArray(variants) && variants.length > 0
          ? (variants[0].vid || variants[0].variantId)
          : null;
        if (firstVid) vidById.set('catalog-' + cp.id, firstVid);
        else resolutionErrors.push({ source: cp.supplier_product_id, reason: 'no_variant_returned', transient: false });
      } catch (e) {
        const msg = String(e instanceof Error ? e.message : e);
        const transient = isRateLimitError(e);
        resolutionErrors.push({ source: cp.supplier_product_id, reason: msg, transient });
        console.error('CJ getVariants failed for catalog product:', cp.supplier_product_id, e);
      }
    }
  }

  // Les ids panier catalog peuvent porter une variante ("catalog-{uuid}::{vid}"),
  // alors que vidById est indexe sans variante. On normalise avant le lookup.
  const lookupKey = (pid: string) =>
    String(pid).startsWith('catalog-') ? 'catalog-' + String(pid).replace(/^catalog-/, '').split('::')[0] : pid;
  const cjProducts = items
    .filter((it: any) => it.product_id && vidById.has(lookupKey(it.product_id)))
    .map((it: any) => ({ vid: vidById.get(lookupKey(it.product_id))!, quantity: it.quantity }));

  if (cjProducts.length === 0) {
    // Audit API Points, Finding 2 : plus jamais un retour silencieux.
    //   A. Au moins une erreur reconnue rate-limit ET premiere tentative
    //      (pas resumedStale) -> transitoire, une chance de retry sans
    //      alerte -- reste `pending`, log info seulement.
    //   B. Sinon (mapping casse -- aucune erreur transitoire recensee -- OU
    //      deja retente au moins une fois sans succes) -> permanent/persiste,
        // etat terminal + alerte -- ne boucle plus indefiniment en silence.
    const anyTransient = resolutionErrors.some((r) => r.transient);
    if (anyTransient && !resumedStale) {
      await supabaseAdmin.from('shop_orders').update({ cj_pay_status: 'pending' }).eq('id', order.id);
      await logAnomaly({
        type: 'cj_product_resolution_failed',
        severity: 'info',
        siteId: order.site_id,
        details: { orderId: order.id, errors: resolutionErrors, retrying: true },
      });
      return [];
    }
    await supabaseAdmin.from('shop_orders').update({ cj_pay_status: 'failed' }).eq('id', order.id);
    await logAnomaly({
      type: 'cj_product_resolution_failed',
      severity: 'blocked',
      siteId: order.site_id,
      details: { orderId: order.id, errors: resolutionErrors, retrying: false, persistent: resumedStale },
    });
    return [];
  }

  // --- Validation d'adresse stricte (les deux modes) ---
  // Normalisation minimale, non destructive : trim uniquement -- jamais de
  // suppression d'accents/Unicode (une adresse réelle avec accents reste
  // l'adresse réelle), jamais de troncature silencieuse (audit adresse,
  // partie 8 : toute transformation doit être explicite et sûre ; aucune
  // limite de longueur CJ n'a été prouvée franchie en pratique, donc aucune
  // troncature n'est ajoutée tant qu'un dépassement réel n'est pas démontré).
  const trim = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  const rawAddr: any = order.shipping_address || {};
  const addr = {
    line1: trim(rawAddr.line1),
    line2: trim(rawAddr.line2),
    city: trim(rawAddr.city),
    state: trim(rawAddr.state),
    postal_code: trim(rawAddr.postal_code),
    country: trim(rawAddr.country).toUpperCase(),
    phone: trim(rawAddr.phone),
  };
  const endCountryCode = addr.country || '';
  const missing: string[] = [];
  if (!endCountryCode) missing.push('country');
  if (!addr.city) missing.push('city');
  if (!addr.postal_code) missing.push('postal_code');
  if (!addr.line1) missing.push('line1');
  // Province/état : uniquement pour les pays où son absence est un vrai
  // problème de livraison connu (cf. COUNTRIES_REQUIRING_PROVINCE) -- ne
  // bloque jamais un pays sans concept de subdivision administrative.
  if (!addr.state && COUNTRIES_REQUIRING_PROVINCE.has(endCountryCode)) missing.push('state');
  if (missing.length > 0) {
    console.error(`CJ fulfill: adresse incomplete (${missing.join(', ')}) pour ${order.id}`);
    await supabaseAdmin
      .from('shop_orders')
      .update({ cj_pay_status: 'failed' })
      .eq('id', order.id)
      .in('cj_pay_status', ['pending', 'failed', 'processing']);
    await logAnomaly({
      type: 'cj_address_incomplete',
      severity: 'blocked',
      siteId: order.site_id,
      details: { orderId: order.id, missing },
    });
    return [];
  }

  // --- Meilleur transporteur + GARDE-FOU cout reel ---
  // On revérifie le vrai shipping CJ juste avant l'envoi. Regle d'or : Nexiora
  // n'absorbe jamais un cout inconnu. Si le vrai cout depasse ce qu'on a encaisse
  // (shipping_amount, marge +20% incluse), on BLOQUE plutot que de perdre de l'argent.
  let logisticName: string | undefined;
  let realShippingCost: number | null = null;
  try {
    const freight = await cjCalculateFreight(CJ_EMAIL, CJ_API_KEY, endCountryCode, cjProducts);
    if (Array.isArray(freight) && freight.length > 0) {
      // Transporteur choisi par l'acheteur (tier eco/standard/express), si CJ le
      // propose encore ; sinon on retombe sur la borne basse.
      const chosen = (order as any).shipment_logistic_name
        ? freight.find((o: any) => o.logisticName === (order as any).shipment_logistic_name)
        : null;
      logisticName = chosen ? chosen.logisticName : freight[0].logisticName;
      // Borne basse des options (la moins chere), comme le cache.
      const prices = freight
        .map((o: any) => Number(o?.logisticPrice ?? o?.price ?? o?.freightAmount))
        .filter((n: number) => Number.isFinite(n) && n >= 0);
      if (prices.length > 0) realShippingCost = Math.min(...prices);
    }
  } catch (e) {
    console.error('CJ freight calc failed:', e);
  }

  // Comparaison : vrai cout vs montant encaisse.
  const charged = Number((order as any).shipping_amount) || 0;
  if (realShippingCost !== null && charged > 0 && realShippingCost > charged) {
    console.error(
      `CJ fulfill BLOQUE ${order.id}: vrai shipping ${realShippingCost}$ > encaisse ${charged}$`
    );
    await supabaseAdmin
      .from('shop_orders')
      .update({ cj_pay_status: 'failed' })
      .eq('id', order.id)
      .in('cj_pay_status', ['pending', 'failed', 'processing']);
    await logAnomaly({
      type: 'cj_shipping_cost_exceeds_charged',
      severity: 'blocked',
      siteId: order.site_id,
      details: {
        orderId: order.id,
        realShippingCost,
        charged,
        gap: Math.round((realShippingCost - charged) * 100) / 100,
        country: endCountryCode,
      },
    });
    return [];
  }

  const baseOrder = {
    orderNumber: order.id,
    shippingZip: addr.postal_code,
    shippingCountryCode: endCountryCode,
    shippingCountry: endCountryCode,
    shippingProvince: addr.state || '',
    shippingCity: addr.city,
    // CJ documente ce champ optionnel (Required: N) -- une chaîne vide est
    // plus honnête qu'un numéro plausible mais fabriqué de toutes pièces,
    // qu'un système aval (transporteur, douane) pourrait tenter d'utiliser
    // réellement (audit adresse, partie 7). Le vrai numéro, quand collecté
    // par Stripe (phone_number_collection), remonte via addr.phone.
    shippingPhone: addr.phone || '',
    shippingCustomerName: order.customer_name || 'Client',
    shippingAddress: [addr.line1, addr.line2].filter(Boolean).join(', '),
    email: order.customer_email || '',
    ...(logisticName ? { logisticName } : {}),
    fromCountryCode: 'CN',
    products: cjProducts,
  };

  // --- Reconciliation AVANT toute creation, toujours (principe fondamental) ---
  const outcome = await reconcileWithCj(CJ_EMAIL, CJ_API_KEY, order.id);
  const vids = cjProducts.map((p) => p.vid);
  const handled = await applyReconciliationOutcome(order as OrderRow, outcome, vids, resumedStale);
  if (handled.done) return handled.vids;

  // outcome.kind === 'NOT_FOUND' uniquement ici : creation autorisee.
  // NOTE : pas de garde-fou solde en mode semi-auto (payType 3). La commande
  // est CREEE chez CJ sans paiement ; Youssouf la paie ensuite a la main.
  try {
    const result = await cjCreateOrder(CJ_EMAIL, CJ_API_KEY, { ...baseOrder, payType: 3 });
    const cjOrderId = result?.orderId || result?.orderCode || null;
    const newAttempts = (order.cj_pay_attempts || 0) + 1;
    await supabaseAdmin
      .from('shop_orders')
      .update({ cj_order_id: cjOrderId, cj_pay_status: 'awaiting_manual_payment', cj_pay_attempts: newAttempts })
      .eq('id', order.id);
    await logAnomaly({
      type: 'cj_awaiting_manual_payment',
      severity: 'warning',
      siteId: order.site_id,
      details: {
        orderId: order.id,
        cjOrderId,
        country: endCountryCode,
        customer: order.customer_name || null,
        total: (order as any).total ?? null,
      },
    });
    return cjProducts.map((p) => p.vid);
  } catch (e: unknown) {
    // --- 1603003 : CJ affirme que l'orderNumber existe deja. Jamais un
    // simple echec -- reconciliation immediate obligatoire (audit §9/§14),
    // aucun decrement de tentative pour cet appel (il n'a pas "echoue", il a
    // revele une commande deja creee par une tentative precedente).
    if (e instanceof CjApiError && e.code === 1603003) {
      const dupOutcome = await reconcileWithCj(CJ_EMAIL, CJ_API_KEY, order.id);
      if (dupOutcome.kind === 'NOT_FOUND') {
        // Contradiction externe : CJ affirme l'existence puis la nie.
        await supabaseAdmin
          .from('shop_orders')
          .update({ cj_pay_status: 'blocked_unknown' })
          .eq('id', order.id)
          .eq('cj_pay_status', 'processing');
        await logAnomaly({
          type: 'cj_reconciliation_unknown',
          severity: 'blocked',
          siteId: order.site_id,
          details: { orderId: order.id, reason: 'post_duplicate_contradiction' },
        });
        return [];
      }
      const dupHandled = await applyReconciliationOutcome(order as OrderRow, dupOutcome, vids, true);
      return dupHandled.vids;
    }

    const msg = String(e instanceof Error ? e.message : e);

    // Rate-limit CJ (QPS ou API Points -- audit rate-limit + audit API
    // Points) : jamais la faute de la commande -- ne consomme pas de
    // tentative, retente au prochain passage cron sans pénalité, même
    // traitement que 1603003 sur ce point precis.
    if (isRateLimitError(e)) {
      const kind = rateLimitKind(e);
      console.error(`CJ create rate-limited (${kind}, pas de decrement de tentative) pour ${order.id}:`, msg);
      await supabaseAdmin
        .from('shop_orders')
        .update({ cj_pay_status: 'pending' })
        .eq('id', order.id);
      await logAnomaly({
        type: 'cj_create_failed_retrying',
        severity: 'info',
        siteId: order.site_id,
        details: { orderId: order.id, reason: msg, rateLimited: true, rateLimitKind: kind, attempts: order.cj_pay_attempts ?? 0 },
      });
      return [];
    }

    const permanent = isPermanentError(msg);
    const newAttempts = (order.cj_pay_attempts || 0) + 1;
    console.error(`CJ create failed (${permanent ? 'permanent' : 'transitoire'}) pour ${order.id}:`, msg);

    if (permanent || newAttempts >= MAX_CREATE_ATTEMPTS) {
      await supabaseAdmin
        .from('shop_orders')
        .update({ cj_pay_status: 'failed', cj_pay_attempts: newAttempts })
        .eq('id', order.id);
      await logAnomaly({
        type: 'cj_fulfill_exhausted',
        severity: 'blocked',
        siteId: order.site_id,
        details: { orderId: order.id, reason: msg, permanent, attempts: newAttempts },
      });
    } else {
      await supabaseAdmin
        .from('shop_orders')
        .update({ cj_pay_status: 'pending', cj_pay_attempts: newAttempts })
        .eq('id', order.id);
      // Info, pas d'email : budget restant, un futur passage retentera --
      // ne devient visible/actionnable qu'a l'epuisement (cj_fulfill_exhausted).
      await logAnomaly({
        type: 'cj_create_failed_retrying',
        severity: 'info',
        siteId: order.site_id,
        details: { orderId: order.id, reason: msg, attempts: newAttempts },
      });
    }
    return [];
  }
}
