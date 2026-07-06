import { NextRequest, NextResponse } from 'next/server'
import { cjCalculateFreight } from '@/lib/cj/client'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { siteId, countryCode, products } = await req.json()
    if (!siteId || !countryCode || !Array.isArray(products) || products.length === 0) {
      return NextResponse.json({ error: 'Missing siteId, countryCode or products' }, { status: 400 })
    }

    const { data: site } = await supabase
      .from('sites')
      .select('cj_email, cj_api_key')
      .eq('id', siteId)
      .single()

    if (!site?.cj_email || !site?.cj_api_key) {
      return NextResponse.json({ error: 'Site has no CJ credentials' }, { status: 404 })
    }

    const freight = await cjCalculateFreight(
      site.cj_email,
      site.cj_api_key,
      countryCode,
      products
    )

    if (!Array.isArray(freight) || freight.length === 0) {
      return NextResponse.json({ error: 'No shipping options available' }, { status: 404 })
    }

    // Retourner la meilleure option (première = recommandée par CJ)
    const best = freight[0]
    return NextResponse.json({
      logisticName: best.logisticName,
      logisticAging: best.logisticAging,
      logisticPrice: best.logisticPrice,
      options: freight.slice(0, 3).map((f: any) => ({
        logisticName: f.logisticName,
        logisticAging: f.logisticAging,
        logisticPrice: f.logisticPrice,
      })),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Unknown error' }, { status: 500 })
  }
}
