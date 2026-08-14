import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSupplier } from './registry';
import {
  createProviderSubmission,
  claimSubmissionAttempt,
  transitionSubmissionStatus,
} from '@/lib/fulfillment/submission-service';
import { upsertProviderOrder } from '@/lib/fulfillment/provider-order-service';
import { classifyProviderError } from '@/lib/fulfillment/provider-error-classification';

/**
 * Fulfil POD items (Printful/Printify) for a paid order.
 * Reads order_item_designs to get the visitor's uploaded design.
 * Returns array of supplier order IDs created.
 *
 * P0-3.9 : Printful et Gelato passent par le moteur transactionnel P0-3.8
 * (create_provider_submission / upsert_provider_order) — seule autorité
 * pour ces deux fournisseurs désormais (P0-3.9 Partie 6). Printify reste
 * sur son chemin legacy inchangé (dormant, hors périmètre P0-3.7/P0-3.8,
 * P0-3.9 Partie 1).
 */
export async function fulfillPodOrder(orderId: string): Promise<string[]> {
  const { data: order } = await supabaseAdmin
    .from('shop_orders')
    .select('id, site_id, shipping_address, customer_name, customer_email')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) return [];

  const { data: items } = await supabaseAdmin
    .from('shop_order_items')
    .select('id, product_id, quantity')
    .eq('order_id', order.id);
  if (!items || items.length === 0) return [];

  // Only catalog items from printful/printify
  const catalogItems = items.filter((i: any) => i.product_id?.startsWith('catalog-'));
  if (catalogItems.length === 0) return [];

  // Get catalog product details
  const stripVariant = (v: string) => String(v).replace(/^catalog-/, '').split('::')[0];
  const realIds = catalogItems.map((i: any) => stripVariant(i.product_id));
  const { data: catProds } = await supabaseAdmin
    .from('catalog_products')
    .select('id, supplier_id, supplier_product_id')
    .in('id', realIds)
    .in('supplier_id', ['printful', 'printify', 'gelato']);
  if (!catProds || catProds.length === 0) return [];

  // Get designs for these order items
  const orderItemIds = catalogItems.map((i: any) => i.id);
  const { data: designs } = await supabaseAdmin
    .from('order_item_designs')
    .select('order_item_id, design_url, placement, position')
    .in('order_item_id', orderItemIds);
  // An item can carry several designs (front, back, sleeves...)
  const designsByItemId = new Map<string, { url: string; placement: string; position?: any }[]>();
  (designs || []).forEach((d: any) => {
    const list = designsByItemId.get(d.order_item_id) || [];
    list.push({ url: d.design_url, placement: d.placement || 'front', position: d.position });
    designsByItemId.set(d.order_item_id, list);
  });

  const addr: any = order.shipping_address || {};
  const shippingAddress = {
    full_name: order.customer_name || 'Client',
    address_line1: addr.line1 || addr.address1 || '',
    address_line2: addr.line2 || addr.address2 || '',
    city: addr.city || '',
    province_state: addr.state || '',
    postal_code: addr.postal_code || addr.zip || '',
    country: addr.country || '',
    phone: addr.phone || '',
  };

  const supplierOrderIds: string[] = [];

  // Resolus une seule fois depuis la source centrale (registry.ts) : plus
  // de reconstruction de credentials par appel (P0-3.9 -> Phase 1 registre
  // fournisseurs, meme moteur que le fix du bug Gelato pre-checkout).
  const printfulSupplier = getSupplier('printful');
  const gelatoSupplier = getSupplier('gelato');
  const printifySupplier = getSupplier('printify');
  if (!printfulSupplier || !gelatoSupplier || !printifySupplier) {
    // Ne devrait jamais arriver (les 3 sont des clés statiques du registre
    // central, registry.ts) : echec loud plutot que silencieux si jamais
    // la configuration du registre devenait incoherente.
    console.error('[pod-fulfill] fournisseur POD manquant dans le registre central');
    return [];
  }

  interface CatalogProductRow {
    id: string;
    supplier_id: string;
    supplier_product_id: string;
  }

  // Regroupe par fournisseur AVANT tout appel (P0-3.9 Partie 1) : Printful
  // reste 1 item = 1 appel, Gelato doit partager UNE Submission order-level
  // pour tous ses items (P0-3.7P/Q, granularité verrouillée — voir P0-3.9
  // rapport Partie 10 pour la démonstration du conflit résolu ici).
  const printfulItems: CatalogProductRow[] = catProds.filter((cp: CatalogProductRow) => cp.supplier_id === 'printful');
  const gelatoItems: CatalogProductRow[] = catProds.filter((cp: CatalogProductRow) => cp.supplier_id === 'gelato');
  const legacyItems: CatalogProductRow[] = catProds.filter(
    (cp: CatalogProductRow) => cp.supplier_id !== 'printful' && cp.supplier_id !== 'gelato'
  );

  /** Construit les paramètres OrderRequest partagés pour un catProd donné. */
  function buildOrderParams(catProd: CatalogProductRow) {
    const cartItem = catalogItems.find((i: any) => stripVariant(i.product_id) === catProd.id);
    if (!cartItem) return null;
    const pickedVariant =
      String(cartItem.product_id).replace(/^catalog-/, '').split('::')[1] || catProd.supplier_product_id;
    const designList = designsByItemId.get(cartItem.id) || [];
    const designRow = designList[0];
    return {
      cartItem,
      orderParams: {
        supplier_product_id: catProd.supplier_product_id,
        variant_id: pickedVariant,
        quantity: cartItem.quantity,
        shipping_address: shippingAddress,
        // order.id === orderId (paramètre de la fonction) par construction
        // de la requête ligne 29 ; orderId est utilisé ici plutôt que
        // order.id car TypeScript ne propage pas le narrowing du garde
        // `if (!order) return []` dans une closure de fonction imbriquée.
        merchant_order_id: orderId,
        design_url: designRow?.url || undefined,
        design_position: designRow?.position || undefined,
        design_placement: designRow?.placement || undefined,
        design_files: designList.length > 0 ? designList : undefined,
      },
    };
  }

  /**
   * Applique le résultat d'un appel adapter.createOrder() au moteur P0-3.8 :
   * succès -> upsertProviderOrder + transition SUCCESS ; échec -> transition
   * UNCERTAIN ou FAILED_PERMANENT selon la classification (P0-3.9 Section 9).
   * Ne suppose jamais un succès sans preuve, ne recrée jamais rien.
   */
  async function applyResultToSubmission(params: {
    submissionId: string;
    provider: 'printful' | 'gelato';
    fulfillmentUnitId: string;
    result: { success: boolean; supplier_order_id?: string; error_message?: string } | null;
    thrownError?: unknown;
  }): Promise<string | null> {
    const { submissionId, provider, fulfillmentUnitId, result, thrownError } = params;

    if (result && result.success && result.supplier_order_id) {
      await upsertProviderOrder({
        submissionId,
        provider,
        providerOrderId: result.supplier_order_id,
        rawStatus: '',
        providerResponse: result,
        fulfillmentUnitIds: [fulfillmentUnitId],
      });
      // P0-3.9.6 Gap #3 : élargi à ['processing', 'uncertain'] — un résultat
      // légitime (réponse réseau enfin obtenue) peut arriver alors que le
      // cron a déjà fait basculer la Submission en UNCERTAIN (Gap #2).
      // Jamais un état terminal dans expected_statuses (Gap #3A) : la
      // garde conditionnelle de transitionSubmissionStatus refuse déjà
      // silencieusement toute réécriture d'une Submission success/failed_*.
      await transitionSubmissionStatus(submissionId, 'success', ['processing', 'uncertain']);
      return result.supplier_order_id;
    }

    const errorMessage = thrownError instanceof Error ? thrownError.message : result?.error_message || 'unknown_error';
    const classification = classifyProviderError(errorMessage);
    await transitionSubmissionStatus(
      submissionId,
      classification === 'permanent' ? 'failed_permanent' : 'uncertain',
      ['processing', 'uncertain'],
      { error: errorMessage }
    );
    console.error(`POD fulfill failed for ${provider} (${classification}):`, errorMessage);
    return null;
  }

  // ---- PRINTFUL : 1 Fulfillment Unit = 1 Submission (P0-3.7P, inchangé) ----
  for (const catProd of printfulItems) {
    const built = buildOrderParams(catProd);
    if (!built) continue;
    const { cartItem, orderParams } = built;

    const submission = await createProviderSubmission({
      orderId: order.id,
      provider: 'printful',
      fulfillmentUnitIds: [cartItem.id],
    });
    if (!submission.success || !submission.submission_id) {
      // Submission active déjà existante et non terminale : idempotent,
      // rien à refaire (P0-3.9 Section 7/8 — pas de nouveau verrou requis,
      // le guard create_provider_submission suffit, validé P0-3.8B).
      continue;
    }
    const claim = await claimSubmissionAttempt(submission.submission_id);
    if (!claim.success) continue; // course perdue face à un autre worker

    try {
      const result = await printfulSupplier.adapter.createOrder(orderParams, printfulSupplier.credentials);
      const supplierOrderId = await applyResultToSubmission({
        submissionId: submission.submission_id,
        provider: 'printful',
        fulfillmentUnitId: cartItem.id,
        result,
      });
      if (supplierOrderId) supplierOrderIds.push(supplierOrderId);
    } catch (e) {
      await applyResultToSubmission({
        submissionId: submission.submission_id,
        provider: 'printful',
        fulfillmentUnitId: cartItem.id,
        result: null,
        thrownError: e,
      });
    }
  }

  // ---- GELATO : UNE Submission order-level pour tous les items Gelato
  // de la commande, plusieurs Provider Orders (P0-3.7P/Q/S, granularité
  // verrouillée). L'adaptateur reste appelé une fois par item (createOrder
  // n'a jamais été batché côté API, P0-3.7Y/Z) ; c'est la Submission
  // Woorri qui les regroupe, pas l'appel réseau lui-même. ----
  if (gelatoItems.length > 0) {
    const builtGelato = gelatoItems
      .map((catProd) => buildOrderParams(catProd))
      .filter((b): b is NonNullable<typeof b> => b !== null);

    if (builtGelato.length > 0) {
      const submission = await createProviderSubmission({
        orderId: order.id,
        provider: 'gelato',
        fulfillmentUnitIds: builtGelato.map((b) => b.cartItem.id),
      });

      if (submission.success && submission.submission_id) {
        const claim = await claimSubmissionAttempt(submission.submission_id);
        if (claim.success) {
          let allSucceeded = true;

          for (const { cartItem, orderParams } of builtGelato) {
            try {
              const result = await gelatoSupplier.adapter.createOrder(orderParams, gelatoSupplier.credentials);
              if (result.success && result.supplier_order_id) {
                await upsertProviderOrder({
                  submissionId: submission.submission_id,
                  provider: 'gelato',
                  providerOrderId: result.supplier_order_id,
                  rawStatus: '',
                  providerResponse: result,
                  fulfillmentUnitIds: [cartItem.id],
                });
                supplierOrderIds.push(result.supplier_order_id);
              } else {
                allSucceeded = false;
                console.error(`POD fulfill failed for gelato/${cartItem.id}:`, result.error_message);
              }
            } catch (e) {
              allSucceeded = false;
              console.error(`POD fulfill error for gelato/${cartItem.id}:`, e instanceof Error ? e.message : e);
            }
          }

          // P0-3.9 Section 11 (résultat partiel Gelato) : le modèle P0-3.7
          // ne définit pas de statut "succès partiel" (6 statuts verrouillés,
          // P0-3.7 Final Gate). Choix conservateur documenté ici, pas
          // inventé silencieusement : SUCCESS uniquement si TOUS les items
          // ont produit un provider_order réel ; sinon UNCERTAIN — jamais
          // FAILED_PERMANENT alors qu'un succès partiel réel a eu lieu, et
          // jamais SUCCESS tant qu'un item reste non résolu. UNCERTAIN
          // déclenche la réconciliation existante (P0-3.7 Phase 14), qui
          // constatera l'état réel via provider_order_items plutôt que de
          // se fier au seul statut de Submission (P0-3.7X Partie 1-2).
          // P0-3.9.6 Gap #3 : élargi à ['processing', 'uncertain'] pour la
          // même raison que ci-dessus (résultat légitime pouvant arriver
          // après un basculement UNCERTAIN par le cron, Gap #2) — jamais un
          // état terminal accepté en entrée.
          await transitionSubmissionStatus(
            submission.submission_id,
            allSucceeded ? 'success' : 'uncertain',
            ['processing', 'uncertain']
          );
        }
      }
      // submission.success === false : Submission déjà active et non
      // terminale, idempotent, rien à refaire (comme Printful ci-dessus).
    }
  }

  // ---- PRINTIFY : chemin legacy inchangé, hors périmètre P0-3.7/P0-3.8
  // (dormant, P0-3.9 Partie 1 — ne pas transformer en nouvelle intégration). ----
  for (const catProd of legacyItems) {
    const built = buildOrderParams(catProd);
    if (!built) continue;
    const { orderParams } = built;
    try {
      const result = await printifySupplier.adapter.createOrder(orderParams, printifySupplier.credentials);
      if (result.success && result.supplier_order_id) {
        supplierOrderIds.push(result.supplier_order_id);
      } else {
        console.error(`POD fulfill failed for ${catProd.supplier_id}/${catProd.supplier_product_id}:`, result.error_message);
      }
    } catch (e) {
      console.error(`POD fulfill error for ${catProd.supplier_id}/${catProd.supplier_product_id}:`, e instanceof Error ? e.message : e);
    }
  }

  if (supplierOrderIds.length > 0) {
    await supabaseAdmin
      .from('shop_orders')
      .update({ status: 'processing' })
      .eq('id', order.id);
  }

  return supplierOrderIds;
}
