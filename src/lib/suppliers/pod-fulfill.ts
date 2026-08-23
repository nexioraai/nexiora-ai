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
import { logAnomaly } from '@/lib/anomaly';

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
    .select('id, site_id, fulfillment_domain, shipping_address, customer_name, customer_email')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) return [];

  // ---- FRONTIERE DE DOMAINE (phase 3) ----
  // Plan de reference : docs/PLAN-SEPARATION-MODE2-MODE3.md
  //
  // Ce moteur n'execute QUE des commandes dont le domaine vaut 'supplier'.
  // Meme regle, meme source que le moteur CJ : la valeur est portee par la
  // commande, decidee une fois a sa creation, immuable en base. Ce fichier ne
  // lit jamais le mode du site (regle A9) -- il lit `dropship_type` plus bas,
  // mais uniquement pour decider si un DESIGN est autorise, ce qui est une
  // question interne au domaine fournisseur, pas une question de frontiere.
  //
  // MESURE QUI JUSTIFIE CETTE GARDE : sur le code deploye, une commande Mode 2
  // portant un item catalogue Printful atteignait reellement
  // `adapter.createOrder` et obtenait un identifiant de commande fournisseur.
  // La garde CJ posee seule n'aurait ferme que la moitie de la fuite.
  //
  // DEUXIEME BARRIERE, PAS LA PREMIERE : l'aiguillage post-paiement n'appelle
  // deja plus ce moteur pour une commande marchande. Si l'on arrive ici avec
  // un domaine 'merchant', c'est que la frontiere a ete franchie ailleurs --
  // d'ou la trace, en `info` : elle ne doit jamais se declencher en
  // fonctionnement normal, et doit crier si elle se declenche.
  if ((order as any).fulfillment_domain !== 'supplier') {
    await logAnomaly({
      type: 'pod_fulfill_domain_refuse',
      severity: 'info',
      siteId: (order as any).site_id,
      details: {
        domain: 'MODE_2',
        orderId: (order as any).id,
        fulfillmentDomain: (order as any).fulfillment_domain ?? null,
      },
    });
    return [];
  }

  // Audit Mode 3 global (F-CUSTOM-02/03) -- deuxieme barriere independante
  // de celle posee au checkout (checkout/route.ts) : ne fait jamais
  // confiance au fait qu'order_item_designs ne contient QUE des lignes
  // legitimes -- une commande deja persistee avant ce correctif, un futur
  // chemin d'ecriture qui contournerait le checkout, ou toute anomalie de
  // donnee doivent tous aboutir au meme refus. Requete separee (PAS un
  // embed PostgREST `sites(dropship_type)` -- jamais prouve fonctionnel
  // dans ce projet, voir audit ; ce depot a deja eu un incident de
  // production cause par une hypothese non verifiee sur le comportement
  // d'un embed) : source de verite identique a celle deja utilisee au
  // checkout, jamais un site_id fourni par un appelant. Fail-closed par
  // construction : si la lecture echoue ou ne retourne rien, orderSite est
  // null/undefined, dropship_type ne matche ni 'pod_brand' ni 'pod_custom',
  // designAllowed reste false.
  const { data: orderSite } = await supabaseAdmin
    .from('sites')
    .select('dropship_type')
    .eq('id', order.site_id)
    .maybeSingle();
  const designAllowed = orderSite?.dropship_type === 'pod_brand' || orderSite?.dropship_type === 'pod_custom';

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

  // Une commande non-pod_brand/pod_custom ne devrait jamais avoir de design
  // en base (le checkout les efface desormais) -- si c'est quand meme le
  // cas (donnee historique pre-correctif, ou tentative de contournement),
  // c'est une anomalie a tracer, pas une erreur a faire echouer le
  // fulfillment lui-meme (les items non-design continuent d'etre traites).
  if (!designAllowed && designsByItemId.size > 0) {
    await logAnomaly({
      type: 'pod_fulfill_design_stripped',
      siteId: order.site_id,
      details: { orderId: order.id, dropshipType: orderSite?.dropship_type ?? null },
    });
  }

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
        design_url: designAllowed ? (designRow?.url || undefined) : undefined,
        design_position: designAllowed ? (designRow?.position || undefined) : undefined,
        design_placement: designAllowed ? (designRow?.placement || undefined) : undefined,
        design_files: designAllowed ? (designList.length > 0 ? designList : undefined) : undefined,
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

  // Audit Mode 3 global (F-POD-01, LOT H) -- cette ecriture n'avait aucune
  // garde (ni CAS applicatif, ni barriere DB), seule ecriture de statut de
  // tout le projet dans ce cas. Passe desormais par apply_shop_order_status()
  // (supabase/sql/shop_order_status_machine.sql), garde CAS explicite
  // (transition autorisee uniquement depuis 'paid', l'etat garanti par le
  // CAS pending->paid de handlePaidCheckout qui precede systematiquement cet
  // appel) + barriere DB independante (trigger, rejette toute transition
  // hors du graphe legal quel que soit l'appelant, y compris un futur appel
  // direct qui oublierait cette garde).
  if (supplierOrderIds.length > 0) {
    const { data: result } = await supabaseAdmin.rpc('apply_shop_order_status', {
      p_order_id: order.id,
      p_target_status: 'processing',
      p_allowed_current: ['paid'],
    });
    if (!result?.success) {
      console.error('[pod-fulfill] apply_shop_order_status(processing) failed:', result?.reason);
    }
  }

  return supplierOrderIds;
}
