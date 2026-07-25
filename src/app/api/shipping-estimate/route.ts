import { NextRequest, NextResponse } from 'next/server'
import { cjCalculateFreight } from '@/lib/cj/client'
import { pickThreeTiers, parseAging } from '@/lib/cj/shipping-tiers'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Renvoie les 3 tiers de livraison (eco / standard / express) pour un produit
// CJ vers un pays. Lit d'abord shipping_cache.tiers (rempli par le cron, zero
// appel CJ). Fallback live via cjCalculateFreight uniquement si non cache.
export async function POST(req: NextRequest) {
  try {
    const { siteId, countryCode, products } = await req.json()
    if (!siteId || !countryCode || !Array.isArray(products) || products.length === 0) {
      return NextResponse.json({ error: 'Missing siteId, countryCode or products' }, { status: 400 })
    }

    const { data: site } = await supabase.from('sites').select('id').eq('id', siteId).single()
    if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })

    // 1. Cache d'abord. On lit les tiers du (des) produit(s) demande(s).
    //    Panier mono-produit dans l'usage courant ; si plusieurs, on prend le
    //    premier pour l'estimation (le checkout recalcule le total exact).
    const firstVid = products[0]?.vid ? String(products[0].vid) : ''
    if (firstVid) {
      const { data: cached } = await supabase
        .from('shipping_cache')
        .select('tiers')
        .eq('supplier_id', 'cj')
        .eq('supplier_product_id', firstVid)
        .eq('country_code', countryCode)
        .maybeSingle()
      if (cached?.tiers && Array.isArray(cached.tiers) && cached.tiers.length > 0) {
        const tiers = cached.tiers as any[]
        const std = tiers.find((t) => t.tier === 'standard') || tiers[0]
        return NextResponse.json({
          source: 'cache',
          tiers,
          // Retro-compat : champs plats attendus par l'ancien affichage.
          logisticName: std.name,
          logisticAging: std.days_min && std.days_max ? `${std.days_min}-${std.days_max}` : '',
          logisticPrice: std.cost,
        })
      }
    }

    // 2. Fallback live (produit pas encore cache par le cron).
    const cjEmail = process.env.CJ_EMAIL || ''
    const cjApiKey = process.env.CJ_API_KEY || ''
    if (!cjEmail || !cjApiKey) {
      return NextResponse.json({ error: 'Shipping estimate unavailable' }, { status: 503 })
    }
    const freight = await cjCalculateFreight(cjEmail, cjApiKey, countryCode, products)
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
      tiers,
      logisticName: std.name,
      logisticAging: std.days_min && std.days_max ? `${std.days_min}-${std.days_max}` : '',
      logisticPrice: std.cost,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Unknown error' }, { status: 500 })
  }
}
