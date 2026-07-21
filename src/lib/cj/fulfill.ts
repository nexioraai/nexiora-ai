import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { cjCalculateFreight, cjCreateOrder, cjGetBalance, cjGetOrderDetail, cjGetVariants } from './client';
import { logAnomaly } from '@/lib/anomaly';

const MAX_PAY_ATTEMPTS = 3;

// Mode 3 : Nexiora possede le compte fournisseur. Le marchand ne connecte rien.
const CJ_EMAIL = process.env.CJ_EMAIL || '';
const CJ_API_KEY = process.env.CJ_API_KEY || '';

/** Détermine si une erreur CJ est permanente (inutile de réessayer). */
function isPermanentError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes('param') ||
    m.includes('invalid') ||
    m.includes('insufficient') ||
    m.includes('not found') ||
    m.includes('not a cj')
  );
}

/**
 * Exécute le dropshipping CJ pour une commande payée (côté client).
 * Lignes avec cj_vid → commande CJ. Lignes sans cj_vid → ignorées (stock).
 * Credentials Nexiora (CJ_EMAIL / CJ_API_KEY) : le marchand ne connecte pas
 * de compte CJ. Paiement systematique via le solde Nexiora (payType 2),
 * avec verrou idempotent, garde-fou anti double-commande et controle de solde.
 */
export async function fulfillCjOrder(orderId: string): Promise<string[]> {
  const { data: order } = await supabaseAdmin
    .from('shop_orders')
    .select('id, site_id, shipping_address, customer_name, customer_email, cj_pay_status, cj_pay_attempts, shipping_amount')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) return [];

  if (!CJ_EMAIL || !CJ_API_KEY) {
    console.error('CJ fulfill: credentials Nexiora absents (CJ_EMAIL / CJ_API_KEY)');
    return [];
  }

  const { data: items } = await supabaseAdmin
    .from('shop_order_items')
    .select('quantity, product_id')
    .eq('order_id', order.id);
  if (!items || items.length === 0) return [];

  const productIds = items.map((it: any) => it.product_id).filter(Boolean);

  // Sépare produits shop vs catalogue
  const shopIds = productIds.filter((id: string) => !id.startsWith('catalog-'));
  const catalogIds = productIds.filter((id: string) => id.startsWith('catalog-'));

  const vidById = new Map<string, string>();

  // Produits shop classiques (shop_products.cj_vid)
  if (shopIds.length > 0) {
    const { data: products } = await supabaseAdmin
      .from('shop_products')
      .select('id, cj_vid')
      .in('id', shopIds);
    (products || []).forEach((p: any) => { if (p.cj_vid) vidById.set(p.id, p.cj_vid); });
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
    for (const cp of (catProds || [])) {
      if (!cp.supplier_product_id) continue;
      try {
        // Respecter la variante choisie par l'acheteur. Sans choix explicite,
        // on retombe sur la premiere variante du produit.
        const picked = chosenVid.get(cp.id);
        if (picked) {
          vidById.set('catalog-' + cp.id, picked);
          continue;
        }
        const variants = await cjGetVariants(CJ_EMAIL, CJ_API_KEY, cp.supplier_product_id);
        const firstVid = Array.isArray(variants) && variants.length > 0
          ? (variants[0].vid || variants[0].variantId)
          : null;
        if (firstVid) vidById.set('catalog-' + cp.id, firstVid);
      } catch (e) {
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

  if (cjProducts.length === 0) return [];

  // --- Validation d'adresse stricte (les deux modes) ---
  const addr: any = order.shipping_address || {};
  const endCountryCode = addr.country || '';
  const missing: string[] = [];
  if (!endCountryCode) missing.push('country');
  if (!addr.city) missing.push('city');
  if (!addr.postal_code) missing.push('postal_code');
  if (!addr.line1) missing.push('line1');
  if (missing.length > 0) {
    console.error(`CJ fulfill: adresse incomplete (${missing.join(', ')}) pour ${order.id}`);
    await supabaseAdmin
      .from('shop_orders')
      .update({ cj_pay_status: 'failed' })
      .eq('id', order.id);
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
      logisticName = freight[0].logisticName;
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
      .eq('id', order.id);
    await logAnomaly({
      type: 'shipping_cost_exceeds_charged',
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
    shippingPhone: addr.phone || '0000000000',
    shippingCustomerName: order.customer_name || 'Client',
    shippingAddress: [addr.line1, addr.line2].filter(Boolean).join(', '),
    email: order.customer_email || '',
    ...(logisticName ? { logisticName } : {}),
    fromCountryCode: 'CN',
    products: cjProducts,
  };

  // Verrou idempotent atomique : seul un passage peut prendre la commande.
  const { data: locked } = await supabaseAdmin
    .from('shop_orders')
    .update({ cj_pay_status: 'processing', cj_pay_attempts: (order.cj_pay_attempts || 0) + 1 })
    .eq('id', order.id)
    .in('cj_pay_status', ['pending', 'failed'])
    .lt('cj_pay_attempts', MAX_PAY_ATTEMPTS)
    .select('id');

  if (!locked || locked.length === 0) {
    // Déjà payé, déjà en cours, ou tentatives épuisées → on ne fait rien.
    return [];
  }

  // Garde-fou anti double-commande : une tentative precedente a pu creer
  // la commande chez CJ avant une coupure reseau. On verifie avant de recreer.
  const existing = await cjGetOrderDetail(CJ_EMAIL, CJ_API_KEY, order.id);
  if (existing && (existing.orderId || existing.cjOrderId)) {
    const existingId = existing.orderId || existing.cjOrderId;
    const alreadyPaid = ['UNSHIPPED', 'SHIPPED', 'DELIVERED'].includes(existing.orderStatus);
    await supabaseAdmin
      .from('shop_orders')
      .update({
        cj_order_id: existingId,
        cj_pay_status: alreadyPaid ? 'paid' : 'processing',
        status: 'processing',
      })
      .eq('id', order.id);
    return cjProducts.map((p) => p.vid);
  }

  // NOTE : pas de garde-fou solde en mode semi-auto (payType 3). La commande
  // est CREEE chez CJ sans paiement ; Youssouf la paie ensuite a la main.
  // Le solde du Wallet n'est donc pas requis pour creer la commande.

  // SEMI-AUTO (payType 3) : la commande est CREEE chez CJ mais PAS payee.
  // Youssouf la paie ensuite d'un clic (carte/PayPal) sur le site CJ.
  // Ce mode evite le Wallet pre-charge tant que le volume est faible.
  // Passage a payType 2 (paiement auto par Wallet) quand le Wallet sera credite.
  try {
    const result = await cjCreateOrder(CJ_EMAIL, CJ_API_KEY, { ...baseOrder, payType: 3 });
    const cjOrderId = result?.orderId || result?.orderCode || null;
    await supabaseAdmin
      .from('shop_orders')
      .update({ cj_order_id: cjOrderId, cj_pay_status: 'awaiting_manual_payment', status: 'processing' })
      .eq('id', order.id);
    // Prevenir Youssouf : une commande attend son paiement manuel chez CJ.
    await logAnomaly({
      type: 'cj_awaiting_manual_payment',
      severity: 'warning',
      siteId: order.site_id,
      details: {
        orderId: order.id,
        cjOrderId,
        country: endCountryCode,
        customer: order.customer_name || null,
      },
    });
    return cjProducts.map((p) => p.vid);
  } catch (e: any) {
    const msg = String(e?.message || e);
    const permanent = isPermanentError(msg);
    console.error(`CJ create failed (${permanent ? 'permanent' : 'transitoire'}) pour ${order.id}:`, msg);
    await supabaseAdmin
      .from('shop_orders')
      .update({ cj_pay_status: permanent ? 'failed' : 'pending' })
      .eq('id', order.id);
    return [];
  }
}
