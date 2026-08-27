import { NextRequest, NextResponse } from 'next/server'
import { cjCalculateFreight } from '@/lib/cj/client'
import { pickThreeTiers, parseAging } from '@/lib/cj/shipping-tiers'
import { createClient } from '@supabase/supabase-js'
import { logAnomaly } from '@/lib/anomaly'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Renvoie les 3 tiers de livraison (eco / standard / express) pour un produit
// CJ vers un pays. Lit d'abord shipping_cache.tiers (rempli par le cron, zero
// appel CJ). Fallback live via cjCalculateFreight uniquement si non cache.
//
// LOT K (Mode 3 global, fuites d'info) -- cause racine : route publique
// (aucune authentification -- normal, un visiteur anonyme doit pouvoir
// estimer sa livraison avant de creer un compte) qui renvoyait jusqu'ici le
// cout de livraison BRUT (shipping_cache.tiers stocke le prix SANS la marge
// de securite +20% -- cf. checkout/route.ts, qui l'applique uniquement au
// moment d'encaisser). Le seul appelant reel (ShippingEstimate.tsx) ne lit
// QUE `logisticAging` (delai), jamais le cout -- verifie par lecture directe
// du composant. Le cout/prix n'a donc plus aucune raison de quitter le
// serveur : retire de la reponse (jamais transmis, meme table/valeur
// consultable par n'importe quel appelant direct de cet endpoint public).
function stripCost(tiers: any[]) {
  return tiers.map(({ cost, ...rest }) => rest);
}

export async function POST(req: NextRequest) {
  try {
    const { siteId, countryCode, products } = await req.json()
    if (!siteId || !countryCode || !Array.isArray(products) || products.length === 0) {
      return NextResponse.json({ error: 'Missing siteId, countryCode or products' }, { status: 400 })
    }
    const firstVidRaw = products[0]?.vid ? String(products[0].vid) : ''
    if (!firstVidRaw) {
      return NextResponse.json({ error: 'Missing vid' }, { status: 400 })
    }

    const { data: site } = await supabase.from('sites').select('id').eq('id', siteId).single()
    if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })

    // ---- M1-06 : le `vid` doit APPARTENIR a ce site ----
    // Cause : `siteId` etait verifie EXISTANT, mais le `vid` etait pris tel
    // quel dans le corps de requete et transmis a CJ sans qu'aucun lien avec
    // ce site ne soit etabli. Trois consequences, sur une route publique et
    // non authentifiee :
    //   1. `cjCalculateFreight` passe par `acquireCjSlot()` -- file GLOBALE
    //      partagee avec la CREATION DES COMMANDES fournisseur (client.ts:49).
    //      Un visiteur pouvait donc retarder le fulfillment de commandes
    //      reellement payees.
    //   2. Les points API CJ de Nexiora etaient consommables a volonte.
    //   3. `shipping_cache` est cle sur (supplier_id, supplier_product_id,
    //      country_code) -- jamais sur le site : les paliers de n'importe quel
    //      produit de n'importe quel marchand etaient lisibles.
    //
    // La liaison se fait sur `shop_products.cj_vid`, seule origine possible :
    // les produits issus du catalogue portent `supplierProductId` et jamais
    // `cjVid` (shared.tsx, loadCatalogSelections), et `ShippingEstimate` n'est
    // rendu que lorsque `p.cjVid` existe.
    //
    // ---- DETTE 6b : `published` NE SUFFIT PLUS ----
    // L'etape 8, volet A a separe deux notions que ce garde confondait
    // encore : `published` porte la VISIBILITE (vitrine, fiche produit,
    // sitemap), `for_sale` porte l'ACHETABILITE. Le checkout exige la
    // CONJONCTION (checkout/route.ts:466) ; cette route s'etait arretee au
    // premier terme. Un produit `published = true, for_sale = false` --
    // etat legal, declare tel par le banc 8A et pose sciemment par le
    // marchand -- obtenait donc un devis de livraison complet. Trois
    // consequences, dont deux depassent l'affichage :
    //   1. le visiteur lisait un delai de livraison sous un article que le
    //      checkout refuse ensuite (409, shop_product_not_purchasable) ;
    //   2. `cjCalculateFreight` passe par `acquireCjSlot()` -- file GLOBALE
    //      partagee avec la CREATION DES COMMANDES fournisseur (cf. la note
    //      M1-06 ci-dessus) : un produit invendable retardait le
    //      fulfillment de commandes reellement payees ;
    //   3. les points API CJ etaient depenses pour une vente impossible.
    //
    // AUCUN NOUVEAU MECANISME. Le refus reste FUSIONNE dans le 403
    // existant : meme code, meme message, meme place -- avant le compteur
    // et avant toute acquisition de slot CJ. Un produit non achetable
    // n'est pas une anomalie mais un etat commercial normal : il n'est
    // deliberement PAS journalise.
    const { data: owned } = await supabase
      .from('shop_products')
      .select('id')
      .eq('site_id', siteId)
      .eq('cj_vid', firstVidRaw)
      .eq('published', true)
      .eq('for_sale', true)
      .maybeSingle()
    if (!owned) {
      return NextResponse.json({ error: 'Product not available for this site' }, { status: 403 })
    }

    // ---- M1-06 : borne de debit ----
    // Meme mecanisme DB-native que promo/validate et catalog/image-search --
    // aucune infrastructure ajoutee. La borne protege la file CJ partagee, pas
    // la confidentialite : un visiteur legitime consulte quelques produits,
    // jamais 30 par minute.
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString()
    // LOT 6 -- meme defaut fail-open que `contact` : `error` non lu, borne
    // ouverte en panne, file CJ exposee. Client inchange.
    const { count: recent, error: erreurCompteur } = await supabase
      .from('checkout_anomalies')
      .select('id', { count: 'exact', head: true })
      .eq('site_id', siteId)
      .eq('type', 'shipping_estimate_request')
      .gte('created_at', oneMinuteAgo)
    if (erreurCompteur) {
      return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 })
    }
    if ((recent ?? 0) >= 30) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }
    // severity 'info' : jamais d'email (cf. logAnomaly) -- c'est un compteur,
    // pas une alerte.
    await logAnomaly({
      type: 'shipping_estimate_request',
      severity: 'info',
      siteId,
      details: { vid: firstVidRaw, country: countryCode },
    })

    // 1. Cache d'abord. On lit les tiers du (des) produit(s) demande(s).
    //    Panier mono-produit dans l'usage courant ; si plusieurs, on prend le
    //    premier pour l'estimation (le checkout recalcule le total exact).
    if (firstVidRaw) {
      const { data: cached } = await supabase
        .from('shipping_cache')
        .select('tiers')
        .eq('supplier_id', 'cj')
        .eq('supplier_product_id', firstVidRaw)
        .eq('country_code', countryCode)
        .maybeSingle()
      if (cached?.tiers && Array.isArray(cached.tiers) && cached.tiers.length > 0) {
        const tiers = cached.tiers as any[]
        const std = tiers.find((t) => t.tier === 'standard') || tiers[0]
        return NextResponse.json({
          source: 'cache',
          tiers: stripCost(tiers),
          // Retro-compat : champs plats attendus par l'ancien affichage.
          logisticName: std.name,
          logisticAging: std.days_min && std.days_max ? `${std.days_min}-${std.days_max}` : '',
        })
      }
    }

    // 2. Fallback live (produit pas encore cache par le cron).
    const cjEmail = process.env.CJ_EMAIL || ''
    const cjApiKey = process.env.CJ_API_KEY || ''
    if (!cjEmail || !cjApiKey) {
      return NextResponse.json({ error: 'Shipping estimate unavailable' }, { status: 503 })
    }
    // Seul le vid verifie est transmis : `products` pouvait contenir des
    // entrees supplementaires non liees a ce site.
    const freight = await cjCalculateFreight(cjEmail, cjApiKey, countryCode, [{ vid: firstVidRaw, quantity: 1 }])
    if (!Array.isArray(freight) || freight.length === 0) {
      return NextResponse.json({ error: 'No shipping options available' }, { status: 404 })
    }
    const tiers = pickThreeTiers(freight)
    if (!tiers || tiers.length === 0) {
      return NextResponse.json({ error: 'No shipping options available' }, { status: 404 })
    }
    const std = tiers.find((t) => t.tier === 'standard') || tiers[0]
    return NextResponse.json({
      source: 'live',
      tiers: stripCost(tiers),
      logisticName: std.name,
      logisticAging: std.days_min && std.days_max ? `${std.days_min}-${std.days_max}` : '',
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Unknown error' }, { status: 500 })
  }
}
