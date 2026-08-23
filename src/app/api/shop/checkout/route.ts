import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getProvider } from '@/lib/payments';
import { checkStock } from '@/lib/shop';
import { checkCatalogStock } from '@/lib/catalog-stock';
import type { CartItem } from '@/lib/payments/types';
import { STRIPE_SHIPPING_COUNTRIES } from '@/lib/payments/countries';
import { buildSupplierGroups, resolveShipping } from '@/lib/shop/quote/resolveShipping';
import { buildQuoteHash, buildCheckoutIdempotencyKey } from '@/lib/shop/quote/checkoutSignature';
import { sitePricing, NEXIORA_COMMISSION_PERCENT, resolveDisplayPrice, roundMoney } from '@/lib/pricing';
import { logAnomaly } from '@/lib/anomaly';
import { suppliersForDropshipType } from '@/lib/dropship/suppliers';

/** Décode un id panier catalog : "catalog-{uuid}::{variantId}" -> { realId: uuid, variantId }.
 *  variantId est optionnel (produits sans variantes). */
function parseCatalogId(cartId: string): { realId: string; variantId?: string } {
  const withoutPrefix = cartId.replace(/^catalog-/, '');
  const [realId, variantId] = withoutPrefix.split('::');
  return { realId, variantId: variantId || undefined };
}

/** POST /api/shop/checkout → crée la session de paiement. Body: { slug, items } (route publique : un client final achète). */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { slug, items, countryCode, shipmentTier, checkoutNonce, promoCode, quoteHash: clientQuoteHash, preview: previewOnly } = body as { slug?: string; items?: CartItem[]; countryCode?: string; shipmentTier?: string; checkoutNonce?: string; promoCode?: string; quoteHash?: string; preview?: boolean };
    if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
    if (!items || items.length === 0) return NextResponse.json({ error: 'Panier vide' }, { status: 400 });

    // Hardening (prochaine priorite Mode 2, meme raisonnement que F7 : ne
    // jamais faire confiance a une donnee panier non recalculee cote
    // serveur) : quantite jamais validee avant ce point -- une quantite
    // negative ou nulle fausserait totalAmount plus bas (serverPrice *
    // item.quantity), avant meme d'atteindre Stripe ou la garde F7.
    for (const item of items) {
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        return NextResponse.json({ error: 'Quantité invalide' }, { status: 400 });
      }
    }

    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, payment_provider, payment_account_id, shipping_flat, mode, cj_margin_percent, cj_round_mode, dropship_type, pod_designs')
      .eq('slug', slug)
      .is('archived_at', null)
      .single();
    if (siteError || !site) return NextResponse.json({ error: 'Site introuvable' }, { status: 404 });
    if (!site.payment_account_id) return NextResponse.json({ error: 'Paiements non configurés pour ce site' }, { status: 400 });

    const stock = await checkStock(items.map((i) => ({ id: i.id, quantity: i.quantity })));
    if (!stock.ok) return NextResponse.json({ error: stock.reason }, { status: 409 });

    // Verification stock catalog (live aupres du fournisseur) : le client
    // n'achete jamais du vide.
    //
    // IGNOREE EN MODE APERCU, deliberement. Le stock n'est PAS une entree de
    // quoteHash : l'ignorer ici preserve donc l'identite du devis a l'octet
    // pres. Et il n'apporte aucune garantie supplementaire -- la seule
    // verification qui fait foi est celle du checkout REEL, ci-dessous
    // inchangee, puisque le stock peut de toute facon changer entre les deux
    // passes.
    //
    // Ce qu'elle coute reellement : un `cjGetInventory` PAR LIGNE, qui
    // traverse acquireCjSlot() -- la file globale partagee avec la creation
    // des commandes fournisseur (fulfill.ts). L'executer aussi en apercu
    // doublait la contention du parcours d'achat avec le fulfillment, en
    // contradiction directe avec le modele dropshipping semi-automatise.
    // NB : l'identifiant exact de la fonction de creation CJ n'est pas cite
    // ici -- une garde structurelle (cj/__tests__/singleCreationPath) verifie
    // qu'il n'apparait que dans client.ts et fulfill.ts.
    if (!previewOnly) {
      const catalogStockLines = items
        .filter((i) => i.id?.startsWith('catalog-'))
        .map((i) => {
          const { realId, variantId } = parseCatalogId(i.id);
          return { realId, variantId, quantity: i.quantity };
        });
      const catStock = await checkCatalogStock(catalogStockLines, countryCode || 'US', site.mode === 3);
      if (!catStock.ok) return NextResponse.json({ error: catStock.reason }, { status: 409 });
    }

    const origin = new URL(req.url).origin;
    const successUrl = `${origin}/sites/${slug}?paid=1`;
    const cancelUrl = `${origin}/sites/${slug}?canceled=1`;

    // Calcul serveur du frais de port : universel multi-fournisseur.
    // On ne fait jamais confiance a un montant envoye par le client.
    const flat = Number(site.shipping_flat) || 0;
    let shippingAmount = flat;
    let chosenLogisticName: string | null = null;  // transporteur CJ du tier choisi
    let estimatedDelivery: string | null = null;
    let shippingResolved = false;

    // Mode 3 : Nexiora avance les frais au fournisseur. Pas de livraison calculable = pas de vente.
    if (site.mode === 3 && (!countryCode || !(STRIPE_SHIPPING_COUNTRIES as readonly string[]).includes(countryCode))) {
      await logAnomaly({ type: 'shipping_country_unsupported', siteId: site.id, slug, details: { countryCode: countryCode || null } });
      return NextResponse.json({ error: 'Livraison indisponible pour cette destination' }, { status: 409 });
    }

    // CJ limite a 1 req/s : on laisse retomber le quota apres la verif de stock.
    // Sans cette verification (mode apercu), il n'y a aucun quota a laisser
    // retomber : la temporisation n'aurait plus d'objet.
    if (!previewOnly) await new Promise((r) => setTimeout(r, 1100));

    if (countryCode && (STRIPE_SHIPPING_COUNTRIES as readonly string[]).includes(countryCode)) {
      try {
        // LOT 2 -- le calcul du devis vit desormais dans resolveShipping(),
        // partage a l'identique avec shop/shipping/calculate (l'affichage du
        // panier). Auparavant chaque route portait sa propre copie, dans un
        // ORDRE DE SOURCES different -- cause racine des divergences C3/C4.
        // Ordre canonique : cache d'abord, live en dernier recours. Aucun
        // appel fournisseur supplementaire n'est introduit ici.
        const groups = await buildSupplierGroups(items.map((i) => ({ id: i.id, quantity: i.quantity })));
        const quote = await resolveShipping({
          groups,
          countryCode,
          flat,
          requestedTier: shipmentTier,
          // Comportement historique conserve : cette route ne recoit pas de
          // state_code dans son body, Printful est donc appele sans.
          stateCode: '',
        });

        if (quote.source !== 'flat' && quote.amount > 0) {
          shippingAmount = quote.amount;
          chosenLogisticName = quote.logisticName;
          estimatedDelivery = quote.estimatedMaxDays ? String(quote.estimatedMaxDays) + ' days' : null;
          shippingResolved = true;
        }
      } catch {
        // Adapter indisponible -> mode 2 garde le forfait, mode 3 rejette plus bas.
      }
    }

    // Mode 3 : aucun cout de livraison confirme par le fournisseur = refus.
    // Nexiora n'absorbe jamais un cout inconnu.
    if (site.mode === 3 && !shippingResolved) {
      await logAnomaly({ type: 'shipping_not_resolved', siteId: site.id, slug, details: { countryCode: countryCode || null, itemCount: items.length } });
      return NextResponse.json({ error: 'Livraison indisponible pour cette destination' }, { status: 409 });
    }

    // ---- Passe unique : cout fournisseur + prix de vente serveur ----
    // SECURITE : le prix vient TOUJOURS du serveur, jamais du client.
    // Un panier falsifie (priceNumber modifie) est rejete ici.

    const { margin, roundMode } = sitePricing(site);
    let supplierCost = 0;
    let totalAmount = 0;

    for (const item of items) {
      let cost = 0;
      let serverPrice = 0;

      if (item.id?.startsWith('catalog-')) {
        const { realId } = parseCatalogId(item.id);
        const { data: cp } = await supabaseAdmin
          .from('catalog_products')
          .select('price, currency, supplier_id')
          .eq('id', realId)
          .maybeSingle();
        cost = Number(cp?.price) || 0;
        if (cost <= 0) {
          await logAnomaly({ type: 'catalog_cost_missing', siteId: site.id, slug, details: { itemId: item.id } });
          return NextResponse.json({ error: 'Produit indisponible' }, { status: 409 });
        }
        // Audit Mode 3 global (N1) -- cause racine : "tout produit du
        // catalogue est achetable sur toute boutique" etait vrai pour le
        // PRIX (toujours recalcule serveur, jamais un probleme) mais avait
        // ete etendu par erreur a l'ELIGIBILITE du produit lui-meme -- rien
        // ne verifiait que cp.supplier_id correspondait au sous-mode reel du
        // site. Un site reseller pouvait ainsi etre force, par un appel
        // direct a cette route, a acheter reellement un produit Printful/
        // Gelato (fabrique et expedie, sans design puisque deja neutralise
        // par ailleurs -- mais fabrique quand meme), en contradiction avec
        // l'invariant "reseller -> CJ uniquement" (src/lib/dropship/
        // suppliers.ts, deja la source unique pour la curation/recherche,
        // jamais appliquee ici au moment de l'achat reel). Meme regle,
        // meme fonction, applique desormais au point le plus critique.
        const eligibleSuppliers = suppliersForDropshipType(site.dropship_type as any);
        if (!cp?.supplier_id || !eligibleSuppliers.includes(cp.supplier_id)) {
          await logAnomaly({
            type: 'catalog_supplier_not_eligible',
            siteId: site.id,
            slug,
            details: { itemId: item.id, supplierId: cp?.supplier_id ?? null, dropshipType: site.dropship_type ?? null },
          });
          return NextResponse.json({ error: 'Produit indisponible' }, { status: 409 });
        }
        // Le prix suit TOUJOURS la marge du marchand. Si le marchand a
        // selectionne ce produit et fixe un prix manuel, ce prix prime ;
        // sinon on applique sa marge (resolveDisplayPrice gere null).
        const { data: selRow } = await supabaseAdmin
          .from('site_catalog_selections')
          .select('sell_price')
          .eq('site_id', site.id)
          .eq('catalog_product_id', realId)
          .maybeSingle();
        // Prix = sell_price manuel du marchand OU cout x (1 + marge du marchand),
        // avec plancher MIN_SELL_PRICE (protege contre la vente a perte).
        serverPrice = resolveDisplayPrice(cost, selRow?.sell_price, margin, roundMode);
        // Devise jamais issue du client (voir raisonnement complet ci-dessous,
        // branche shop_products) -- meme regle appliquee au catalogue.
        item.currency = cp!.currency;

        // Audit Mode 3/POD BRAND, perfectionnement -- cause racine double :
        // (1) securite -- customDesignUrl/customDesigns venaient du panier
        // client sans jamais etre verifies contre un design reellement genere
        // par le marchand (generate-mockups) : n'importe quel appelant direct
        // de cette route pouvait faire fabriquer, en Mode 3 (Nexiora avance
        // le cout fournisseur), une image arbitraire sur un produit d'une
        // boutique POD BRAND quelconque. (2) fonctionnel -- symetriquement,
        // le frontend POD BRAND legitime (mockupsToProducts, shared.tsx) ne
        // renseigne JAMAIS customDesignUrl (le design n'est pas un choix du
        // client, contrairement a pod_custom) : sans ce correctif, un achat
        // POD BRAND normal partait deja en fabrication SANS AUCUN design
        // attache (order_item_designs vide, printful-adapter.ts envoie
        // design_url=undefined). Le design d'un produit POD BRAND est
        // desormais TOUJOURS resolu cote serveur depuis le mockup
        // reellement genere pour ce catalog_product_id -- toute valeur
        // envoyee par le client pour cet item est ignoree, meme raisonnement
        // que le prix (SECURITE ci-dessus). N'affecte pas pod_custom (design
        // choisi par le client, deja gere plus bas sans changement) ni les
        // produits catalogue vendus sur un site pod_brand sans mockup
        // correspondant (aucun design attache, comportement inchange).
        //
        // Audit Mode 3 global (F-CUSTOM-02/03) -- ce bloc ne couvrait QUE
        // pod_brand ; pour toute AUTRE valeur (reseller, null, undefined,
        // valeur corrompue), customDesignUrl/customDesigns du client
        // passaient tels quels -- un site reseller pouvait ainsi faire
        // fabriquer un design injecte par l'acheteur sur un produit
        // catalogue source chez Printful/Gelato/Printify, en contradiction
        // avec l'invariant "un reseller ne personnalise jamais". Politique
        // desormais explicite et fail-closed (liste d'autorisation, pas de
        // liste de refus) : seuls pod_brand (design resolu serveur) et
        // pod_custom (design client, comportement inchange) peuvent
        // transporter un design ; toute autre valeur -- y compris une
        // valeur inattendue/corrompue -- l'efface systematiquement. Seconde
        // barriere independante posee cote fulfillment (pod-fulfill.ts) qui
        // revalide dropship_type separement, pour ne jamais dependre d'un
        // seul point de controle.
        if (site.dropship_type === 'pod_brand') {
          const podDesignsArr = Array.isArray(site.pod_designs) ? site.pod_designs : [];
          const mockups = Array.isArray(podDesignsArr[0]?.mockups) ? podDesignsArr[0].mockups : [];
          const match = mockups.find((m: any) => String(m.catalog_product_id) === realId);
          item.customDesigns = undefined;
          item.customDesignUrl = match?.design_url || undefined;
        } else if (site.dropship_type === 'pod_custom') {
          // LOT J (F-CUSTOM-01/04) -- cause racine : cette branche laissait
          // jusqu'ici passer customDesignUrl/customDesigns TELS QUELS,
          // fournis par le client, sans aucune verification. Consequence
          // prouvee par lecture du code : une URL cross-tenant (uploadee via
          // un AUTRE site), reutilisee (deja servie a une commande
          // anterieure) ou totalement arbitraire (contournement de l'upload)
          // etait acceptee -- Nexiora payait alors le fournisseur POD pour
          // fabriquer un produit a partir d'un contenu jamais valide.
          // design_uploads (supabase/sql/design_uploads.sql) est desormais
          // la seule source de verite : chaque URL doit y correspondre a une
          // ligne appartenant a CE site (tenant-bound) et non deja consommee
          // (single-use, consommation reelle plus bas au moment de l'ecriture
          // de order_item_designs -- ne consomme jamais ici, une commande
          // qui echoue avant paiement ne doit pas bruler le design).
          const urls = Array.isArray(item.customDesigns) && item.customDesigns.length > 0
            ? item.customDesigns.map((d: any) => d?.url).filter((u: unknown): u is string => typeof u === 'string' && u.length > 0)
            : (typeof item.customDesignUrl === 'string' && item.customDesignUrl ? [item.customDesignUrl] : []);
          for (const designUrl of urls) {
            const { data: design } = await supabaseAdmin
              .from('design_uploads')
              .select('consumed_at')
              .eq('site_id', site.id)
              .eq('public_url', designUrl)
              .maybeSingle();
            if (!design || design.consumed_at) {
              await logAnomaly({
                type: 'custom_design_invalid_or_reused',
                siteId: site.id,
                slug,
                details: { itemId: item.id, designUrl, reason: !design ? 'not_found_or_wrong_site' : 'already_consumed' },
              });
              return NextResponse.json({ error: 'Produit indisponible' }, { status: 409 });
            }
          }
        } else {
          item.customDesigns = undefined;
          item.customDesignUrl = undefined;
        }
      } else {
        // Hardening (prochaine priorite Mode 2, meme famille que F7) :
        // cette requete ne filtrait avant ni par site_id ni par published --
        // un acheteur pouvait payer, sur la boutique A, un produit id
        // appartenant reellement a la boutique B (id trouvable simplement en
        // visitant sa page produit publique /sites/[slug]/produits/[id]) :
        // paiement encaisse par le compte Stripe de A, et le vrai stock de B
        // decremente au paiement confirme (F7 cible uniquement par id, sans
        // notion de site -- correct pour son propre perimetre, mais herite
        // silencieusement de n'importe quel id que cette requete laissait
        // passer). Meme requete pour un produit desactive par son marchand
        // (published=false), toujours achetable si son id etait connu.
        // LOT L (Mode 3 global, dette technique) -- BUG ACTIF CORRIGE : cette
        // requete selectionnait `cost_price`, une colonne qui N'EXISTE PAS
        // sur shop_products (confirme par introspection PostgREST en
        // direct : colonnes reelles = cj_vid, created_at, currency,
        // description, id, images, name, position, price, published,
        // site_id, stock, unpublished_by). PostgREST renvoyait donc
        // systematiquement une erreur 400 (42703) pour CETTE requete
        // precise -- jamais verifiee (`const { data: sp } = ...`, `error`
        // jamais destructure), donc `sp` valait TOUJOURS `null`, et le test
        // `if (!sp || ...)` rejetait purement et simplement TOUT achat
        // shop_products, sur TOUS les modes, sans exception -- un bug actif
        // de production, pas de la dette morte ni un mismatch theorique.
        //
        // `cj_vid` reste lu ici (defense en profondeur) : recherche
        // exhaustive confirmee -- AUCUN chemin d'ecriture reel de ce depot
        // ne peuple jamais cj_vid (ALLOWED_PRODUCT_FIELDS, shop/products/
        // route.ts ET [id]/route.ts, l'exclut explicitement). Un item
        // shop_products avec cj_vid=null est traite en aval EXACTEMENT
        // comme un item Mode 2 (stock marchand decrmente normalement,
        // handlePaidCheckout.ts) -- aucun cout fournisseur Nexiora n'est
        // jamais engage, donc aucune raison de bloquer. Un item avec
        // cj_vid REELLEMENT rempli (hypothese defense en profondeur : futur
        // chemin d'ecriture, service_role, SQL direct) resterait un vrai
        // dropship a cout inconnu -- le garde-fou original (jamais
        // acheter un item Mode 3 a cout fournisseur inconnu) est conserve,
        // mais desormais base sur un signal reel (cj_vid), pas sur une
        // colonne qui n'a jamais existe.
        const { data: sp, error: spError } = await supabaseAdmin
          .from('shop_products')
          .select('price, currency, published, cj_vid')
          .eq('id', item.id)
          .eq('site_id', site.id)
          .maybeSingle();
        if (spError) {
          await logAnomaly({ type: 'shop_product_query_failed', siteId: site.id, slug, details: { itemId: item.id, error: spError.message } });
          return NextResponse.json({ error: 'Produit indisponible' }, { status: 409 });
        }
        if (!sp || sp.published !== true) {
          await logAnomaly({ type: 'shop_product_not_purchasable', siteId: site.id, slug, details: { itemId: item.id } });
          return NextResponse.json({ error: 'Produit indisponible' }, { status: 409 });
        }
        cost = 0;
        serverPrice = Number(sp.price) || 0;
        // Devise jamais issue du client (meme raisonnement que le prix,
        // deja recalcule cote serveur juste au-dessus) : sans ceci, un appel
        // direct a cette route (hors UI, aucune connaissance d'un autre site
        // requise) pouvait faire encaisser 19.99 JPY au lieu de 19.99 CAD
        // pour le meme unit_amount -- Stripe traite unit_amount comme un
        // compte dans la plus petite unite de LA DEVISE FOURNIE, jamais
        // reconvertie depuis le prix serveur.
        item.currency = sp.currency;
        if (serverPrice <= 0) {
          await logAnomaly({ type: 'shop_price_missing', siteId: site.id, slug, details: { itemId: item.id } });
          return NextResponse.json({ error: 'Produit indisponible' }, { status: 409 });
        }
        if (site.mode === 3 && sp.cj_vid) {
          await logAnomaly({ type: 'shop_product_dropship_cost_unknown', siteId: site.id, slug, details: { itemId: item.id } });
          return NextResponse.json({ error: 'Produit indisponible' }, { status: 409 });
        }
      }

      item.priceNumber = serverPrice;
      supplierCost += cost * item.quantity;
      totalAmount += serverPrice * item.quantity;
    }

    // LOT 1 -- arrondi au centime APRES accumulation, jamais a chaque addition :
    // arrondir chaque terme ferait diverger le total de la somme des lignes
    // envoyees a Stripe (qui arrondit chaque unit_amount separement, puis
    // multiplie par la quantite). Un seul arrondi, sur le resultat.
    supplierCost = roundMoney(supplierCost);
    totalAmount = roundMoney(totalAmount);

    // Stripe n'accepte qu'une seule devise par Checkout Session : plutot que
    // de laisser Stripe echouer avec une erreur opaque, on rejette ici,
    // proprement, si les devises desormais server-authoritative (ci-dessus)
    // divergent entre lignes -- ne devrait jamais arriver en usage normal
    // (chaque produit d'un meme site partage la meme devise), mais protege
    // aussi order.currency (qui ne stocke qu'une seule valeur, celle de la
    // premiere ligne) de refleter silencieusement la mauvaise devise pour
    // les autres lignes.
    const resolvedCurrency = items[0]?.currency;
    if (items.some((i) => i.currency !== resolvedCurrency)) {
      await logAnomaly({ type: 'mixed_currency_cart', siteId: site.id, slug, details: { currencies: items.map((i) => i.currency) } });
      return NextResponse.json({ error: 'Panier incohérent' }, { status: 409 });
    }

    // ---- Code promo (passe de cloture, P-1 a P-6) ----
    // Cause racine : la remise etait calculee et AFFICHEE par le panier
    // (CartDrawer.tsx) mais n'etait jamais transmise ni appliquee ici -- le
    // client voyait "-20%" et payait le prix plein. Le correctif ne
    // consiste PAS a faire confiance au montant calcule par le navigateur :
    // seul le CODE transite, tout le reste est recalcule ici a partir de
    // donnees serveur.
    //
    // Modele economique retenu (decision produit OPTION A, explicite) : le
    // MARCHAND absorbe integralement la remise. La commission Nexiora reste
    // donc calculee sur totalAmount AVANT remise, et applicationFeeAmount
    // est inchange -- c'est le montant encaisse par le client qui baisse,
    // donc la part nette du marchand. Les garde-fous Mode 3 existants ne
    // sont PAS modifies : ils operent desormais sur le clientPays REEL
    // (apres remise), ce qui les rend strictement plus stricts -- une remise
    // economiquement intenable est refusee automatiquement.
    //
    // Isolation tenant : la recherche est filtree par site_id (le site
    // resolu depuis le slug, jamais un identifiant fourni par le client) ET
    // par egalite EXACTE sur le code. `ilike` est volontairement banni ici :
    // il interpretait '%' et '_' comme des jokers, permettant a un acheteur
    // de saisir '%' pour recuperer l'unique code actif d'une boutique sans
    // le connaitre (P-2).
    let promoDiscount = 0;
    let appliedPromoId: string | null = null;
    const rawPromo = typeof promoCode === 'string' ? promoCode.trim().toUpperCase() : '';
    if (rawPromo.length > 0) {
      if (rawPromo.length > 64) {
        return NextResponse.json({ error: 'Code promo invalide' }, { status: 409 });
      }
      const { data: promo } = await supabaseAdmin
        .from('promo_codes')
        .select('id, discount_type, discount_value, min_order, max_uses, used_count, expires_at')
        .eq('site_id', site.id)
        .eq('code', rawPromo)
        .eq('active', true)
        .maybeSingle();

      const nowMs = Date.now();
      const expired = !!promo?.expires_at && new Date(promo.expires_at).getTime() < nowMs;
      const depleted = promo?.max_uses != null && Number(promo.used_count ?? 0) >= Number(promo.max_uses);
      // min_order compare au sous-total RECALCULE ci-dessus (totalAmount),
      // jamais a une valeur transmise par le client (P-3).
      const belowMin = promo?.min_order != null && totalAmount < Number(promo.min_order);

      if (!promo || expired || depleted || belowMin) {
        await logAnomaly({
          type: 'promo_rejected',
          severity: 'info',
          siteId: site.id,
          slug,
          details: {
            code: rawPromo,
            reason: !promo ? 'not_found_or_wrong_site' : expired ? 'expired' : depleted ? 'depleted' : 'min_order',
          },
        });
        // Refus explicite plutot qu'un encaissement silencieux au prix
        // plein : c'est precisement le probleme de confiance que P-1 corrige.
        return NextResponse.json({ error: 'Code promo invalide' }, { status: 409 });
      }

      const dv = Number(promo.discount_value);
      if (!Number.isFinite(dv) || dv <= 0) {
        await logAnomaly({ type: 'promo_invalid_config', siteId: site.id, slug, details: { code: rawPromo, discountValue: promo.discount_value } });
        return NextResponse.json({ error: 'Code promo invalide' }, { status: 409 });
      }
      if (promo.discount_type === 'percent') {
        if (dv > 100) {
          await logAnomaly({ type: 'promo_invalid_config', siteId: site.id, slug, details: { code: rawPromo, percent: dv } });
          return NextResponse.json({ error: 'Code promo invalide' }, { status: 409 });
        }
        promoDiscount = totalAmount * (dv / 100);
      } else if (promo.discount_type === 'fixed') {
        promoDiscount = dv;
      } else {
        // Liste d'autorisation stricte (P-6) : tout type inconnu est refuse,
        // jamais interprete par defaut comme un montant fixe.
        await logAnomaly({ type: 'promo_invalid_config', siteId: site.id, slug, details: { code: rawPromo, discountType: promo.discount_type } });
        return NextResponse.json({ error: 'Code promo invalide' }, { status: 409 });
      }

      // Borne dure : la remise ne peut jamais depasser le sous-total ni etre
      // negative -- clientPays reste >= shippingAmount >= 0 en toutes
      // circonstances.
      promoDiscount = Math.round(Math.min(Math.max(promoDiscount, 0), totalAmount) * 100) / 100;
      appliedPromoId = promo.id;
    }

    const discountedTotal = Math.round((totalAmount - promoDiscount) * 100) / 100;

    // OPTION A : commission calculee sur le prix AVANT remise.
    // LOT 1 : arrondie au centime -- c'est un montant reellement preleve par
    // Stripe (via application_fee_amount) et enregistre en base, pas une
    // grandeur intermediaire. Voir roundMoney() pour la cause racine.
    //
    // M2-01 -- LA COMMISSION N'EXISTE QU'EN MODE 3.
    //
    // Elle etait calculee pour TOUS les modes, alors que `applicationFeeAmount`
    // ci-dessous vaut deja 0 hors Mode 3 : Stripe ne prelevait donc rien, mais
    // le montant etait tout de meme PERSISTE (`nexiora_commission`) et deduit
    // du profit marchand. La garde de mode existait sur le PRELEVEMENT, jamais
    // sur l'ENREGISTREMENT.
    //
    // Deux consequences opposees, toutes deux fausses :
    //   * /api/shop/finances montrait au marchand Mode 2 une commission de 6 %
    //     que Deribfy n'a jamais prise, et un profit inferieur d'autant ;
    //   * /api/admin/stats agregeait ces memes montants dans le chiffre
    //     d'affaires de Deribfy, qui s'en trouvait sur-evalue.
    //
    // La definition du Mode 2 est explicite (chat/route.ts:507) : "There is NO
    // platform commission". `supplier_cost` valait deja 0 (cost = 0 pour un
    // produit marchand, ligne ~339), donc corriger la commission suffit a
    // rendre `merchant_profit` exact : amount - 0 - 0 = amount.
    //
    // Mode 3 strictement inchange -- meme formule, meme arrondi.
    const nexioraCommission = site.mode === 3
      ? roundMoney(totalAmount * (NEXIORA_COMMISSION_PERCENT / 100))
      : 0;
    const applicationFeeAmount = site.mode === 3
      ? roundMoney(supplierCost + shippingAmount + nexioraCommission)
      : 0;

    // ---- Garde-fou applicable a TOUS les modes (DEBT-029b) ----
    // Audit final phase 2 : tous les garde-fous financiers etaient enfermes
    // dans le bloc `if (site.mode === 3)` ci-dessous. Une remise de 100 % en
    // mode 1/2 avec livraison gratuite produit un montant total de 0, que
    // Stripe refuse -- l'acheteur recevait une erreur opaque au lieu d'un
    // refus explicite. Le mode 3 etait deja couvert (la garde
    // `applicationFeeAmount >= clientPays` intercepte le cas), les autres
    // modes ne l'etaient pas du tout.
    if (!(discountedTotal + shippingAmount > 0)) {
      await logAnomaly({
        type: 'zero_amount_checkout',
        severity: 'warning',
        siteId: site.id,
        slug,
        details: { totalAmount, promoDiscount, shippingAmount, discountedTotal, mode: site.mode },
      });
      return NextResponse.json(
        { error: 'Montant a payer nul — commande impossible' },
        { status: 409 }
      );
    }

    // ---- Garde-fous financiers (mode 3) ----
    // Nexiora avance l'argent au fournisseur : aucune commande ne passe si les
    // montants sont incoherents. Mieux vaut une vente perdue qu'une perte seche.
    if (site.mode === 3) {
      // Garde-fous INCHANGES dans leur logique -- mais evalues sur le
      // montant REELLEMENT encaisse (apres remise). C'est ce qui rend une
      // remise economiquement intenable automatiquement refusee, sans avoir
      // eu a affaiblir ni contourner une seule protection existante.
      const clientPays = discountedTotal + shippingAmount;
      if (supplierCost <= 0) {
        await logAnomaly({ type: 'supplier_cost_zero', siteId: site.id, slug, details: { totalAmount } });
        return NextResponse.json({ error: 'Commande impossible pour le moment' }, { status: 409 });
      }
      if (applicationFeeAmount >= clientPays) {
        await logAnomaly({ type: 'fee_exceeds_payment', siteId: site.id, slug, details: { applicationFeeAmount, clientPays, supplierCost, shippingAmount, promoDiscount } });
        return NextResponse.json({ error: 'Commande impossible pour le moment' }, { status: 409 });
      }
      if (discountedTotal - supplierCost - nexioraCommission < 0) {
        await logAnomaly({ type: 'negative_merchant_profit', siteId: site.id, slug, details: { totalAmount, discountedTotal, supplierCost, nexioraCommission, promoDiscount } });
        return NextResponse.json({ error: 'Commande impossible pour le moment' }, { status: 409 });
      }
      if (shippingAmount > 40 && shippingAmount <= 150) {
        await logAnomaly({ type: 'shipping_high', severity: 'warning', siteId: site.id, slug, details: { shippingAmount, totalAmount } });
      }
      if (shippingAmount > 150) {
        await logAnomaly({ type: 'shipping_out_of_range', siteId: site.id, slug, details: { shippingAmount, totalAmount } });
        return NextResponse.json({ error: 'Livraison indisponible pour cette destination' }, { status: 409 });
      }
    }

    // ---- Cle d'idempotence Stripe (LOT 3) ----
    // Elle etait auparavant calculee cote NAVIGATEUR a partir du panier, ce
    // qui produisait deux defauts distincts :
    //   - COLLISION ENTRE ACHETEURS : la chaine ne contenait aucun composant
    //     propre a l'acheteur ; deux acheteurs au panier identique
    //     obtenaient la MEME cle, donc la MEME session Stripe.
    //   - PARAMETRES SERVEUR ABSENTS : prix, livraison, remise et
    //     application_fee sont recalcules ICI ; s'ils changeaient entre deux
    //     tentatives, la cle restait identique alors que la requete Stripe
    //     changeait -> idempotency_error.
    // La signature est desormais construite SERVEUR, a partir de l'etat
    // commercial reellement envoye a Stripe, combine a l'identite de
    // l'acheteur (le nonce du navigateur n'a plus aucune autorite
    // financiere : il ne sert qu'a distinguer deux acheteurs).
    const buyerNonce =
      typeof checkoutNonce === 'string' && checkoutNonce.length > 0 && checkoutNonce.length <= 200
        ? checkoutNonce
        : '';
    // LOT 4 -- DEUX identites distinctes, jamais confondues :
    //   quoteHash      = f(etat commercial serveur), independant de
    //                    l'acheteur. Deux acheteurs voyant le meme prix
    //                    obtiennent le meme hash.
    //   idempotencyKey = f(buyerNonce, origin, quoteHash). Seule valeur
    //                    transmise a Stripe. `quoteHash` seul serait
    //                    identique entre acheteurs -- exactement le P0
    //                    corrige au LOT 3.
    const quoteHash = buildQuoteHash({
      siteId: site.id,
      currency: resolvedCurrency ?? '',
      shippingAmount,
      shipmentTier: shipmentTier ?? null,
      promoId: appliedPromoId,
      discountAmount: promoDiscount,
      applicationFee: applicationFeeAmount,
      lines: items.map((i) => ({
        cartId: i.id,
        quantity: i.quantity,
        unitPrice: i.priceNumber ?? 0,
        designUrls:
          Array.isArray(i.customDesigns) && i.customDesigns.length > 0
            ? i.customDesigns
                .map((d: { url?: string }) => d?.url)
                .filter((u): u is string => typeof u === 'string' && u.length > 0)
            : i.customDesignUrl
              ? [i.customDesignUrl]
              : [],
      })),
    });

    // ---- Contrat "affiche = facture" (LOT 4, flux bout en bout) ----
    // Le devis renvoye au panier et celui facture ici sont produits par LE
    // MEME chemin de code : le mode apercu ci-dessous s'arrete juste avant
    // la creation de la session Stripe et de la commande. Cette identite est
    // donc STRUCTURELLE, pas maintenue a la main -- une route d'affichage
    // separee qui recalculerait le devis de son cote pourrait diverger, ce
    // qui est exactement le defaut C3 corrige au LOT 2.
    //
    // Rien de ce qui suit ne fait confiance au hash recu : le serveur
    // recalcule integralement son propre devis, puis compare.
    if (previewOnly) {
      return NextResponse.json({
        preview: true,
        quoteHash,
        currency: resolvedCurrency ?? null,
        total: discountedTotal,
        shipping: shippingAmount,
        discount: promoDiscount,
        shipmentTier: shipmentTier ?? null,
      });
    }

    // Un hash FOURNI qui ne correspond pas au devis recalcule interrompt le
    // checkout AVANT toute session Stripe et AVANT tout INSERT de commande :
    // aucun paiement ne peut donc etre engage sur un devis perime.
    //
    // Un hash ABSENT n'est pas traite comme "valide" : c'est l'absence de
    // toute pretention du client sur le prix. Le refuser casserait tout
    // appelant qui n'en envoie pas (dont la version deployee du panier)
    // sans rien protéger de plus -- le prix reste, dans tous les cas,
    // integralement recalcule cote serveur. Un hash MALFORME, lui, est une
    // pretention fausse : il est traite comme une divergence.
    if (typeof clientQuoteHash === 'string' && clientQuoteHash.length > 0 && clientQuoteHash !== quoteHash) {
      await logAnomaly({
        type: 'quote_changed_before_payment',
        severity: 'info',
        siteId: site.id,
        slug,
        details: { received: clientQuoteHash.slice(0, 64), computed: quoteHash },
      });
      return NextResponse.json(
        {
          error: 'Les prix de votre panier ont ete mis a jour. Verifiez le nouveau total avant de payer.',
          code: 'quote_changed',
          quoteHash,
          currency: resolvedCurrency ?? null,
          total: discountedTotal,
          shipping: shippingAmount,
          discount: promoDiscount,
          shipmentTier: shipmentTier ?? null,
        },
        { status: 409 }
      );
    }

    const checkoutSignature = buyerNonce
      ? buildCheckoutIdempotencyKey({ buyerNonce, origin, quoteHash })
      : undefined;

    const provider = getProvider(site.payment_provider);
    const { url, orderId } = await provider.createCheckout(
      site.payment_account_id,
      slug,
      items,
      successUrl,
      cancelUrl,
      shippingAmount,
      applicationFeeAmount,
      checkoutSignature,
      promoDiscount
    );

    // `amount` = montant REELLEMENT encaisse hors livraison (apres remise).
    // shop_orders.total doit refleter ce que le client a paye, pas un prix
    // catalogue theorique -- sinon tout le reporting (admin/stats,
    // finances) et les remboursements seraient fausses par la remise.
    const amount = discountedTotal;
    const { data: order, error: orderError } = await supabaseAdmin
      .from('shop_orders')
      .insert({
        site_id: site.id,
        status: 'pending',
        total: amount,
        currency: items[0].currency,
        payment_provider: site.payment_provider || 'stripe',
        payment_account_id: site.payment_account_id,
        payment_ref: orderId,
        estimated_delivery: estimatedDelivery,
        shipping_amount: shippingAmount,
        shipment_tier: shipmentTier || null,
        shipment_logistic_name: chosenLogisticName,
        // Token secret pour le lien "Annuler ma commande" envoye a l'acheteur.
        // Impossible a deviner : seul le destinataire de l'email peut annuler.
        cancel_token: crypto.randomUUID(),
        country_code: countryCode || null,
        supplier_cost: supplierCost,
        nexiora_commission: nexioraCommission,
        merchant_profit: roundMoney(amount - supplierCost - nexioraCommission),
        // P-4 : la consommation reelle du code (increment de used_count) a
        // lieu au PAIEMENT confirme (handlePaidCheckout), pas ici -- une
        // session abandonnee ne doit jamais consommer une utilisation. On se
        // contente de memoriser QUEL code a ete applique.
        promo_code_id: appliedPromoId,
      })
      .select('id')
      .single();

    // Rejeu du meme nonce (deux onglets, resoumission reseau) : Stripe a deja
    // dedupe createCheckout() vers la MEME session (voir stripe.ts et son
    // idempotencyKey derive de checkoutNonce), donc `orderId` (session.id)
    // est identique a celui du premier appel -- l'INSERT ci-dessus entre en
    // conflit sur la contrainte UNIQUE de shop_orders.payment_ref. Ce n'est
    // PAS un echec : la commande existe deja, on renvoie la MEME URL de
    // paiement plutot qu'une erreur ou une seconde commande. Sans nonce
    // (checkoutSignature absent), orderId est toujours une session Stripe
    // fraiche : ce conflit ne peut alors jamais se produire (comportement
    // historique inchange). NB : ce garde-fou ne devient effectif qu'une
    // fois la contrainte UNIQUE (shop_orders.payment_ref) ajoutee en base --
    // voir audit DB associe.
    if (orderError?.code === '23505') {
      const { data: existingOrder } = await supabaseAdmin
        .from('shop_orders')
        .select('id')
        .eq('payment_ref', orderId)
        .maybeSingle();
      if (existingOrder) {
        return NextResponse.json({ url });
      }
    }

    // Ne jamais renvoyer une URL de paiement Stripe valide sans commande
    // enregistree cote Deribfy -- sinon un client peut payer reellement pour
    // un achat dont plus aucune trace n'existe (ex. site archive entre la
    // resolution initiale et ce point, rejete par le trigger
    // reject_order_if_site_archived sur shop_orders).
    if (orderError || !order) {
      const siteArchived = orderError?.message?.includes('SITE_ARCHIVED');
      await logAnomaly({
        type: siteArchived ? 'checkout_order_site_archived' : 'checkout_order_insert_failed',
        siteId: site.id,
        slug,
        details: { error: orderError?.message },
      });
      return NextResponse.json(
        { error: siteArchived ? 'Cette boutique n\'est plus disponible.' : 'Commande impossible pour le moment.' },
        { status: siteArchived ? 409 : 500 }
      );
    }

    const { data: orderItems, error: itemsError } = await supabaseAdmin.from('shop_order_items').insert(
      items.map((i) => ({
        order_id: order.id,
        product_id: i.id,
        product_name: i.name,
        quantity: i.quantity,
        unit_price: i.priceNumber,
      }))
    ).select('id');

    if (itemsError || !orderItems) {
      // La commande existe deja et le paiement peut suivre son cours (le
      // client a deja une session Stripe valide a ce stade) -- on ne bloque
      // pas l'achat pour un probleme de persistance des lignes, mais une
      // intervention humaine est necessaire pour reconstruire la commande
      // avant fulfillment.
      await logAnomaly({
        type: 'checkout_order_items_insert_failed',
        siteId: site.id,
        slug,
        details: { orderId: order.id, error: itemsError?.message },
      });
    } else {
      // Save custom designs if any
      const designRows: { order_item_id: string; design_url: string; placement: string; position: Record<string, number> | null }[] = [];
      items.forEach((item, idx) => {
        if (!orderItems[idx]) return;
        const orderItemId = orderItems[idx].id;
        if (Array.isArray(item.customDesigns) && item.customDesigns.length > 0) {
          // One row per print location (front, back, sleeves...)
          item.customDesigns.forEach(d => {
            if (!d?.url) return;
            designRows.push({
              order_item_id: orderItemId,
              design_url: d.url,
              placement: d.placement || 'front',
              position: d.position || null,
            });
          });
        } else if (item.customDesignUrl) {
          designRows.push({
            order_item_id: orderItemId,
            design_url: item.customDesignUrl,
            placement: 'front',
            position: item.customDesignPosition || null,
          });
        }
      });
      // LOT J (F-CUSTOM-01/04) -- consommation reelle des designs pod_custom
      // (single-use) : la validation plus haut (existence + non-consomme)
      // ne fait qu'AUTORISER le checkout a se poursuivre, elle ne reserve
      // rien -- entre cette validation et ce point, une commande concurrente
      // aurait pu consommer la MEME URL (fenetre de course, extremement
      // etroite : quelques secondes, une seule action legitime possible :
      // rejeu du meme design par le meme visiteur dans un autre onglet).
      // UPDATE...WHERE consumed_at IS NULL agit comme CAS atomique -- un
      // seul appelant peut reussir a consommer une ligne donnee. Le paiement
      // est deja en cours a ce stade (session Stripe creee) : jamais
      // bloquant, meme philosophie que checkout_order_items_insert_failed
      // ci-dessus -- un design perdu a la course est simplement omis de
      // order_item_designs (pod-fulfill.ts traite deja un item sans design
      // comme un cas normal, non une erreur).
      //
      // Contre-audit hostile (LOT J) -- REGRESSION trouvee et corrigee avant
      // de considerer ce lot termine : une premiere version consommait
      // CHAQUE ligne de designRows independamment, y compris quand la MEME
      // URL apparait plusieurs fois (cas legitime et courant : le meme
      // visuel applique a la fois devant ET dos du produit). La 2e tentative
      // de consommation de la meme URL trouvait alors consumed_at deja pose
      // par la 1ere (la MEME requete, pas une course externe) et echouait a
      // tort -- perte silencieuse du design pour un des deux emplacements
      // dans un usage parfaitement legitime. Deduplique desormais par URL
      // AVANT de consommer : chaque URL distincte n'est reclamee qu'UNE
      // fois, le resultat s'applique a TOUTES les lignes qui la partagent.
      let finalDesignRows = designRows;
      if (site.dropship_type === 'pod_custom' && designRows.length > 0) {
        const uniqueUrls = [...new Set(designRows.map((r) => r.design_url))];
        const claimedUrls = new Set<string>();
        for (const url of uniqueUrls) {
          const owningRow = designRows.find((r) => r.design_url === url)!;
          const { data: claim } = await supabaseAdmin
            .from('design_uploads')
            .update({ consumed_at: new Date().toISOString(), consumed_by_order_item_id: owningRow.order_item_id })
            .eq('site_id', site.id)
            .eq('public_url', url)
            .is('consumed_at', null)
            .select('id');
          if (claim && claim.length > 0) {
            claimedUrls.add(url);
          } else {
            await logAnomaly({
              type: 'custom_design_consume_race_lost',
              severity: 'warning',
              siteId: site.id,
              slug,
              details: { orderId: order.id, orderItemId: owningRow.order_item_id, designUrl: url },
            });
          }
        }
        finalDesignRows = designRows.filter((r) => claimedUrls.has(r.design_url));
      }
      if (finalDesignRows.length > 0) {
        const { error: designsError } = await supabaseAdmin.from('order_item_designs').insert(finalDesignRows);
        if (designsError) {
          await logAnomaly({
            type: 'checkout_order_designs_insert_failed',
            siteId: site.id,
            slug,
            details: { orderId: order.id, error: designsError.message },
          });
        }
      }
    }

    return NextResponse.json({ url });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
