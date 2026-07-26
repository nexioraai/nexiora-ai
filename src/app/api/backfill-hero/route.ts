import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getPhotos } from '@/lib/pexels'

// One-shot backfill: donne une image hero Pexels à tous les sites existants
// qui n'en ont pas (tous modes, tous thèmes, publiés ou non).
// Protégé par CRON_SECRET pour éviter tout appel non autorisé.
export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Sites sans hero_image (null ou vide)
  const { data: sites, error } = await supabaseAdmin
    .from('sites')
    .select('id, slug, name, type, primary_color, niche_keywords, hero_image')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const targets = (sites || []).filter(
    (s: any) => !s.hero_image || String(s.hero_image).trim() === ''
  )

  const results: { slug: string; ok: boolean; image?: string }[] = []

  for (const site of targets) {
    // Requête de recherche : type + nom, sinon 1er niche_keyword, sinon "business"
    const kw = Array.isArray(site.niche_keywords) && site.niche_keywords.length > 0
      ? site.niche_keywords[0]
      : ''
    const query = (site.type || kw || site.name || 'business').toString().trim()

    let image = ''
    try {
      const photos = await getPhotos(query, 3)
      image = photos[0] || ''
    } catch {
      image = ''
    }

    if (image) {
      const { error: upErr } = await supabaseAdmin
        .from('sites')
        .update({ hero_image: image })
        .eq('id', site.id)
      results.push({ slug: site.slug, ok: !upErr, image })
    } else {
      results.push({ slug: site.slug, ok: false })
    }

    // Respecter un rythme doux pour l'API Pexels
    await new Promise((r) => setTimeout(r, 300))
  }

  return NextResponse.json({
    total_sites: sites?.length || 0,
    without_hero: targets.length,
    updated: results.filter((r) => r.ok).length,
    results,
  })
}
