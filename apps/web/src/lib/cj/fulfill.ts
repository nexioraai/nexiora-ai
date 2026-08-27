import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { cjCalculateFreight, cjCreateOrder, cjGetVariants, CjApiError } from './client';
import { reconcileWithCj, type ReconciliationOutcome } from './reconcile';
// Meme parseur de delai que le cache (cron shipping-cache) : les deux cotes de
// la comparaison de delai proviennent ainsi du meme champ CJ et du meme code.
import { parseAging } from './shipping-tiers';
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
 * Delai MAXIMUM communique a l'acheteur, relu depuis shop_orders.
 *
 * FORMAT REEL, ecrit a un seul endroit (checkout/route.ts) :
 *   `String(quote.estimatedMaxDays) + ' days'`  -> "15 days", ou NULL.
 * `estimatedMaxDays` n'est pas garanti entier (il vient de `Number()` sur un
 * segment de `logisticAging`), d'ou `parseFloat` et non `parseInt`.
 *
 * Toute valeur non reconnue -- y compris d'eventuelles lignes historiques
 * dans un format anterieur -- vaut `null` : la contrainte de delai devient
 * alors INACTIVE. Jamais `0`, qui rendrait toute option inadmissible et
 * bloquerait indistinctement toutes les commandes.
 *
 * Ce champ est la SEULE trace persistee de ce que Deribfy s'est engage a
 * faire : il est envoye a l'acheteur par email (handlePaidCheckout ->
 * sendOrderConfirmationEmail, "Livraison estimee").
 */
export function parsePromisedMaxDays(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const m = raw.trim().match(/^(\d+(?:\.\d+)?)\s*(?:days?|jours?)?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
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
    .select('id, site_id, fulfillment_domain, shipping_address, customer_name, customer_email, cj_pay_status, cj_pay_attempts, cj_pay_locked_at, shipping_amount, shipment_logistic_name, estimated_delivery, total')
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

  // ---- FRONTIERE DE DOMAINE (phase 3) ----
  // Plan de reference : docs/PLAN-SEPARATION-MODE2-MODE3.md
  //
  // Ce moteur n'execute QUE des commandes dont le domaine vaut 'supplier'.
  // La valeur est portee par la commande, decidee UNE FOIS a sa creation et
  // rendue IMMUABLE en base (trigger trg_enforce_fulfillment_domain_immutable,
  // prouve en production contre un role privilegie). Ce moteur ne la
  // recalcule pas et n'a plus le droit de lire le mode du site -- regle A9 du
  // registre de domaines, verifiee en CI.
  //
  // CE QUE CETTE GARDE REMPLACE. La version precedente (13bec0e) lisait le
  // site pour en tirer mode ET sous-type, puis decidait via la table des
  // fournisseurs autorises. Mesure comparative sur les 12 cas du banc : elle
  // MODIFIAIT deux des trois parcours Mode 3, qui fonctionnaient -- le
  // sous-type n'apportait rien au Mode 2 et n'avait d'effet que sur le Mode 3.
  // Une garde de niveau DOMAINE ne descend jamais au niveau du parcours. Il
  // n'existe desormais plus qu'UNE SEULE logique de decision, et elle vit
  // hors de ce fichier.
  //
  // POURQUOI UN ETAT TERMINAL, ET PAS UN SIMPLE RETOUR. Le cron de
  // reconciliation selectionne par `cj_pay_status`, jamais par domaine (il
  // n'est pas modifie par cette phase). Or `cj_pay_status` vaut 'pending' par
  // defaut sur TOUTE commande de la plateforme : sans etat terminal, chaque
  // commande marchande resterait dans son perimetre indefiniment -- rejeu
  // toutes les 2 h, a perpetuite. `not_applicable` l'en sort definitivement,
  // et la garde de statut ci-dessus la court-circuite des la premiere
  // re-entree, en une seule requete.
  //
  // Aucune contrainte CHECK n'existe sur `cj_pay_status` (verifie en base) et
  // tous ses consommateurs filtrent par correspondance POSITIVE (cron :41/:54,
  // admin/stats :35) : la valeur y est inerte.
  if ((order as any).fulfillment_domain !== 'supplier') {
    await supabaseAdmin
      .from('shop_orders')
      .update({ cj_pay_status: 'not_applicable' })
      .eq('id', order.id)
      .in('cj_pay_status', ['pending', 'failed', 'processing']);
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

  // --- Reconciliation AVANT toute decision TERMINALE ---
  // Elle precedait deja toute CREATION ; elle precede desormais aussi tout
  // REFUS. Le garde-fou cout etait place avant elle : il pouvait donc ecrire
  // 'failed' sur une commande DEJA CREEE chez CJ par un passage anterieur
  // (crash/timeout sans ecriture d'etat). La reconciliation n'etait alors
  // jamais atteinte, et cette commande devenait definitivement invisible --
  // chaque rejeu du cron rebloquant au meme endroit.
  //
  // Ce deplacement ne protege PAS contre une double creation : cette
  // protection existait deja (la reconciliation precedait createOrderV2). Il
  // traite le cas de la commande ORPHELINE, et rien d'autre.
  const outcome = await reconcileWithCj(CJ_EMAIL, CJ_API_KEY, order.id);
  const vids = cjProducts.map((p) => p.vid);
  const handled = await applyReconciliationOutcome(order as OrderRow, outcome, vids, resumedStale);
  if (handled.done) return handled.vids;

  // ============================================================
  // DEVIS CJ + SELECTION DE L'OPTION REELLEMENT EXPEDIEE
  //
  // Ce qui a ete supprime ici, et pourquoi :
  //
  //   1. `freight[0]` -- l'option etait choisie par son RANG dans le tableau
  //      CJ quand le transporteur enregistre n'etait plus propose. Aucun ordre
  //      n'est documente par CJ. Le depot condamne d'ailleurs explicitement ce
  //      procede (shipping-tiers.ts : "ne laisser jamais l'ordre arbitraire du
  //      tableau CJ decider silencieusement du resultat").
  //
  //   2. `Math.min(...prices)` -- le garde-fou validait le prix de l'option la
  //      MOINS CHERE, alors que la commande partait sur une AUTRE option.
  //      Contre-exemple : transporteur promis a 15, encaisse 10.80, une option
  //      economique a 4 -> min(4) <= 10.80, la commande passait, et Nexiora
  //      expediait a 15. Le controle porte desormais sur le prix de l'option
  //      QUE L'ON ENVOIE.
  //
  // ADMISSIBILITE -- les deux seules dimensions que Deribfy a effectivement
  // promises et que nous pouvons verifier :
  //     prix  <= montant encaisse           (shop_orders.shipping_amount)
  //     delai <= delai communique           (shop_orders.estimated_delivery,
  //                                          envoye par email a l'acheteur)
  //
  // Nous ne savons pas, et n'affirmons pas, qu'une option retenue offre le
  // meme service que celle initialement enregistree : suivi, assurance et
  // manutention ne sont pas fournis par freightCalculate. Cet ecart n'est pas
  // comble -- il est JOURNALISE (cj_shipping_option_reselected) pour rester
  // verifiable apres coup.
  //
  // Les deux valeurs comparees pour le delai proviennent du MEME champ CJ
  // (`logisticAging`) et du MEME parseur (`parseAging`), cote cache comme cote
  // fulfillment : elles sont homogenes quelle que soit l'unite reelle de CJ,
  // que sa documentation ne precise pas et que nous ne supposons donc pas.
  // ============================================================
  const charged = Number((order as any).shipping_amount) || 0;
  const promisedMaxDays = parsePromisedMaxDays((order as any).estimated_delivery);
  const promised = ((order as any).shipment_logistic_name as string | null) || null;

  /** Refus terminal : statut + anomalie, sans jamais consommer cj_pay_attempts
   *  (ce compteur mesure les appels reels a cjCreateOrder -- aucun n'a lieu
   *  ici. L'y melanger empecherait une recuperation legitime : prix et delais
   *  CJ fluctuent, et une commande refusee aujourd'hui peut redevenir
   *  expediable demain via le cron de reconciliation). */
  const refuse = async (type: string, details: Record<string, unknown>) => {
    console.error(`CJ fulfill BLOQUE ${order.id}: ${type}`, details);
    await supabaseAdmin
      .from('shop_orders')
      .update({ cj_pay_status: 'failed' })
      .eq('id', order.id)
      .in('cj_pay_status', ['pending', 'failed', 'processing']);
    await logAnomaly({
      type,
      severity: 'blocked',
      siteId: order.site_id,
      details: { orderId: order.id, country: endCountryCode, ...details },
    });
    return [] as string[];
  };

  // --- Devis. Sans devis exploitable, AUCUNE creation : on ne construit pas
  // une commande fournisseur a l'aveugle. Le statut reste 'processing' avec un
  // verrou pose : le groupe 2 du cron de reconciliation reprend la commande
  // une fois le verrou perime (STALE_LOCK_MS), donc au plus tard au passage
  // suivant. Aucun statut terminal n'est ecrit -- l'echec est transitoire.
  let freight: unknown[];
  try {
    const r = await cjCalculateFreight(CJ_EMAIL, CJ_API_KEY, endCountryCode, cjProducts);
    freight = Array.isArray(r) ? r : [];
  } catch (e) {
    console.error('CJ freight calc failed:', e);
    await logAnomaly({
      type: 'cj_freight_unavailable',
      severity: 'info',
      siteId: order.site_id,
      details: { orderId: order.id, reason: 'error', country: endCountryCode, message: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200) },
    });
    return [];
  }
  if (freight.length === 0) {
    // Reponse VALIDE mais vide : CJ n'annonce aucune methode pour ce panier
    // vers cette destination. Meme conclusion metier qu'une erreur -- aucune
    // creation -- mais cause distincte, donc `reason` distinct.
    await logAnomaly({
      type: 'cj_freight_unavailable',
      severity: 'info',
      siteId: order.site_id,
      details: { orderId: order.id, reason: 'empty', country: endCountryCode },
    });
    return [];
  }

  type FreightOption = { name: string; price: number; daysMax: number | null; total: number | null; clearance: number };
  const options: FreightOption[] = (freight as any[])
    .map((o) => {
      const price = Number(o?.logisticPrice ?? o?.price ?? o?.freightAmount);
      const total = Number(o?.totalPostageFee);
      const clearance = Number(o?.clearanceOperationFee);
      return {
        name: String(o?.logisticName ?? '').trim(),
        price,
        daysMax: parseAging(o?.logisticAging).max,
        // Retenu UNIQUEMENT s'il est exploitable et superieur : un total
        // inferieur au prix de base serait incoherent, on ne l'interprete pas.
        total: Number.isFinite(total) && Number.isFinite(price) && total > price ? total : null,
        clearance: Number.isFinite(clearance) && clearance > 0 ? clearance : 0,
      };
    })
    .filter((o) => o.name.length > 0 && Number.isFinite(o.price) && o.price >= 0);

  // `charged <= 0` : le garde-fou prix reste inactif sur une livraison
  // facturee zero -- comportement EXISTANT, conserve tel quel (dette signalee,
  // hors perimetre de ce lot).
  const priceOk = (o: FreightOption) => charged <= 0 || o.price <= charged;
  // Un delai inconnu ne peut pas etre compare : quand une promesse de delai
  // existe, une option sans delai annonce n'est pas admissible. On ne verifie
  // pas ce qu'on ignore.
  const delayOk = (o: FreightOption) =>
    promisedMaxDays === null || (o.daysMax !== null && o.daysMax <= promisedMaxDays);

  let picked: FreightOption | undefined;

  if (promised) {
    // Une methode a ete enregistree pour cette commande. On n'en substitue
    // AUCUNE autre : soit celle-la part, soit rien ne part.
    const found = options.find((o) => o.name === promised);
    if (!found) {
      return await refuse('cj_shipping_no_admissible_option', { reason: 'promised_not_offered', promised, offered: options.length });
    }
    if (!priceOk(found)) {
      return await refuse('cj_shipping_cost_exceeds_charged', {
        realShippingCost: found.price,
        charged,
        gap: Math.round((found.price - charged) * 100) / 100,
        logisticName: found.name,
      });
    }
    if (!delayOk(found)) {
      return await refuse('cj_shipping_no_admissible_option', { reason: 'promised_too_slow', promised, daysMax: found.daysMax, promisedMaxDays });
    }
    picked = found;
  } else {
    // Aucune methode enregistree. `null` a QUATRE origines indistinguables
    // avec les donnees persistees (panier multi-produits sans transporteur
    // commun ; palier reellement vendu dont le nom CJ etait vide ; repli sur
    // shipping_cost ; devis d'origine live). On ne cherche donc pas a
    // determiner laquelle : on n'interroge jamais `null`, seulement le
    // montant encaisse et le delai communique.
    //
    // REGLE METIER, arbitree explicitement (option C) : sans delai
    // communique, une seule des deux contraintes serait opposable et la
    // selection pourrait retenir l'option la plus LENTE sans aucun controle.
    // On refuse plutot que d'expedier sur une seule dimension.
    if (promisedMaxDays === null) {
      return await refuse('cj_shipping_no_admissible_option', { reason: 'no_promise_no_delay', charged });
    }
    const candidates = options.filter((o) => priceOk(o) && delayOk(o));
    if (candidates.length === 0) {
      return await refuse('cj_shipping_no_admissible_option', { reason: 'none_admissible', charged, promisedMaxDays, offered: options.length });
    }
    // Departage CONVENTIONNEL, non fonde sur une regle CJ : la moins chere.
    // CJ ne documente aucun ordre de preference et toutes les candidates
    // honorent deja prix et delai -- elles sont indiscernables sur l'axe
    // contractuel, le departage ne peut donc etre qu'une convention. Celle-ci
    // est deja en vigueur ailleurs dans le systeme (lowestPrice() alimente
    // shipping_cache.shipping_cost, le palier `eco`, et le repli sans palier
    // facture cette meme borne basse) : la retenir n'introduit aucun critere
    // nouveau.
    picked = candidates.reduce((a, b) => (b.price < a.price ? b : a));
    await logAnomaly({
      type: 'cj_shipping_option_reselected',
      severity: 'info',
      siteId: order.site_id,
      details: {
        orderId: order.id,
        promised: null,
        sent: picked.name,
        sentPrice: picked.price,
        sentDaysMax: picked.daysMax,
        charged,
        promisedMaxDays,
        candidates: candidates.length,
      },
    });
  }

  // ---- `totalPostageFee` : ECART OBSERVE, INTERPRETATION NON PROUVEE ----
  //
  // MESURE (2026-08-23, 820 options, 4 pays, bruts dans measures/raw/) :
  //   CA / GB / BR : totalPostageFee == logisticPrice sur 566 options.
  //   FR           : 214 options sur 254 ont totalPostageFee > logisticPrice,
  //                  d'un montant CONSTANT par methode (+2,30 ou +3,50).
  //   Sur ces memes options, `taxesFee` ET `clearanceOperationFee` valent 0,
  //   et TOUS les autres champs de la reponse CJ sont nuls : aucun champ
  //   documente n'explique l'ecart.
  //   `totalPostageFee` est present sur 820/820 et n'est JAMAIS inferieur a
  //   `logisticPrice`.
  //
  // CE QUI N'EST PAS PROUVE : que `totalPostageFee` soit le montant
  // REELLEMENT FACTURE par CJ. La documentation officielle le decrit
  // seulement comme "total postage" en USD, ne dit nulle part quel champ est
  // debite, et son exemple de reponse ne contient meme pas ce champ. Deduire
  // du nom serait exactement l'hypothese fournisseur que ce projet s'interdit.
  //
  // POURQUOI ON NE CHANGE PAS LA BASE DE FACTURATION SUR CETTE SEULE BASE :
  // l'asymetrie est decisive. Si l'on facturait `totalPostageFee` alors que CJ
  // ne le debite pas, on SURFACTURERAIT l'acheteur de 2,30 a 3,50 sur FR --
  // precisement la faute que le devis panier vient de corriger, et jamais
  // rattrapable. A l'inverse, si CJ debite bien ce montant, la perte pour
  // Nexiora est bornee (2,25 max mesure), et payType 3 place un humain devant
  // CHAQUE paiement fournisseur : elle est visible, pas silencieuse.
  //
  // On journalise donc l'ecart plutot que de l'interpreter. Ces anomalies
  // fourniront la preuve manquante : il suffira de comparer un debit CJ reel
  // sur une commande FR aux deux montants traces ici pour trancher, et
  // changer alors la base de facturation en connaissance de cause.
  const feeDetails = {
    orderId: order.id,
    logisticPrice: picked.price,
    totalPostageFee: picked.total,
    clearanceOperationFee: picked.clearance,
    charged,
    logisticName: picked.name,
    country: endCountryCode,
  };
  if (picked.total !== null && picked.total > charged && charged > 0) {
    await logAnomaly({
      type: 'cj_shipping_total_exceeds_charged',
      severity: 'warning',
      siteId: order.site_id,
      details: { ...feeDetails, gap: Math.round((picked.total - charged) * 100) / 100 },
    });
  } else if (picked.clearance > 0) {
    // `clearanceOperationFee` est un frais NOMME et DOCUMENTE par CJ ("customs
    // clearance fee"), et le code ne le lisait NULLE PART. Mesure du
    // 2026-08-23 : non nul sur 46 options (DE, ES, IT -- valeurs 0,70 / 0,80 /
    // 2,40), dont 41 que la marge x1,20 couvrait, donc INVISIBLES.
    //
    // Une exposition couverte aujourd'hui par la marge reste une exposition :
    // elle cesse de l'etre des que le frais augmente ou que la marge est
    // revue. La tracer maintenant evite de la decouvrir plus tard sur une
    // facture.
    //
    // `info` : logAnomaly sort avant tout envoi d'e-mail (anomaly.ts). Trace
    // en base, zero alerte -- c'est de l'observabilite, pas un incident. Le
    // cas ou de l'argent est reellement en jeu reste couvert par le
    // `warning` ci-dessus.
    await logAnomaly({
      type: 'cj_shipping_named_fee_ignored',
      severity: 'info',
      siteId: order.site_id,
      details: feeDetails,
    });
  }

  // ---- Cout fournisseur absorbe : rendre visible, jamais bloquer ----
  // `charged <= 0` desarme le garde-fou prix (comportement historique).
  //
  // ATTEIGNABILITE -- REVISEE EN PHASE 3 : ce bloc documentait un chemin qui
  // n'existe plus. La demonstration d'origine reposait sur quatre points dont
  // trois portaient sur le Mode 2 -- une boutique sans sous-type selectionnant
  // du CJ, un `shipping_amount` a 0 faute de devis, et surtout l'aiguillage
  // post-paiement appelant ce moteur SANS aucune garde de mode. Cette derniere
  // affirmation est desormais FAUSSE : l'aiguillage ne l'appelle plus que pour
  // un domaine 'supplier', et la garde en tete de fonction le refuserait de
  // toute facon. LE CHEMIN MODE 2 EST FERME.
  //
  // Le bloc reste NECESSAIRE, pour deux raisons distinctes :
  //   1. commandes HISTORIQUES -- creees avant les gardes de checkout du
  //      2026-07-18, elles peuvent porter `shipping_amount = 0` tout en
  //      relevant du domaine fournisseur, et restent reprises par le cron ;
  //   2. livraison offerte VOLONTAIREMENT par le marchand, qui produit
  //      exactement le meme etat.
  // Les deux cas sont indistinguables depuis shop_orders.
  //
  // POURQUOI NE PAS BLOQUER : une livraison offerte VOLONTAIREMENT par le
  // marchand produit exactement le meme etat (`shipping_amount = 0`), et les
  // deux cas sont indistinguables depuis shop_orders. Bloquer casserait une
  // offre commerciale legitime pour corriger un defaut d'observabilite. On
  // rend donc le montant absorbe VISIBLE, et la decision reste humaine.
  if (charged <= 0 && picked.price > 0) {
    await logAnomaly({
      type: 'cj_shipping_cost_absorbed',
      severity: 'warning',
      siteId: order.site_id,
      details: {
        orderId: order.id,
        absorbed: picked.price,
        charged,
        logisticName: picked.name,
        country: endCountryCode,
      },
    });
  }

  const logisticName: string = picked.name;

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

  // outcome.kind === 'NOT_FOUND' uniquement ici : creation autorisee
  // (reconciliation effectuee plus haut, avant toute decision terminale).
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
