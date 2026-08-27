// src/app/sites/[slug]/llms.txt/route.ts
import { fetchSite, resolveSiteBaseUrl, WOORRI_SITE_URL } from '../themes/shared'
import { resolveSiteFreshness } from '../themes/siteFreshness'
import { logAnomaly } from '@/lib/anomaly'
import { getLlmsTxtLabels } from '@/lib/i18n/llmsTxtLabels'
import { fetchBlogEntries } from '../blog/fetchPosts'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

// DETTE 3 -- `logAnomaly` est appele ICI, jamais dans `shared.tsx`.
// Ce dernier est bi-environnement (quatre composants 'use client'
// l'importent) et `anomaly.ts -> supabase-admin.ts -> server-only` fait
// echouer le build s'il y entre -- mesure, pas suppose. Le signal remonte
// donc par un tableau `diagnostics`, et seuls les appelants SERVEUR
// journalisent.
  const diagnostics: string[] = []
  const site = await fetchSite(slug, false, diagnostics)

  if (!site) {
    return new Response('Not found', { status: 404 })
  }
  if (diagnostics.length > 0) {
    await logAnomaly({
      type: 'storefront_query_failed',
      severity: 'warning',
      siteId: (site as { id?: string }).id ?? null,
      slug,
      details: { surface: 'llms.txt', failures: diagnostics },
    })
  }

  const url = resolveSiteBaseUrl(site, req.headers.get('host'))

  // CHANTIER 8 -- LES INTITULES SUIVENT LA LANGUE DU SITE.
  //
  // Les onze titres de structure de ce fichier etaient ecrits EN DUR EN
  // FRANCAIS. Mesure sur yiaglobalcommodities.com (`lang = 'en'`, contenu
  // integralement anglais) : le fichier servi aux crawlers LLM encadrait du
  // texte anglais de titres francais. Ce fichier existe pour etre lu par des
  // machines qui en tirent une comprehension du commerce -- lui faire
  // annoncer une langue que le contenu ne parle pas est une erreur de fond.
  //
  // AUCUN CONTENU DU MARCHAND N'EST TRADUIT : seuls les intitules que ce
  // fichier fabrique lui-meme changent. Le nom des sections reste celui que
  // le site affiche (regle du chantier 1, inchangee).
  const t = getLlmsTxtLabels(site.lang)
  const lines: string[] = []

  lines.push('# ' + site.name)
  lines.push('')

  const summary = site.slogan ?? site.hero_subtitle
  if (summary) {
    lines.push('> ' + summary)
    lines.push('')
  }

  if (site.about) {
    lines.push('## ' + t.about)
    lines.push(site.about)
    lines.push('')
  }

  // CHANTIER 1 -- PUBLIER CE QUE LE SITE REND, PAS UNE COLONNE MORTE.
  //
  // Ce bloc lisait `site.services`, qu'aucun theme ne rend et que le
  // generateur ne produit pas. Sur un site reel, il ne se declenchait donc
  // JAMAIS : les offres visibles par le visiteur etaient absentes du fichier
  // destine aux crawlers LLM, tandis que ce dernier publiait mission, vision
  // et FAQ. L'inversion exacte de ce qu'il doit faire.
  //
  // Le titre reste celui de la section telle qu'elle s'affiche : le fichier
  // decrit le site tel qu'il est, il ne lui impose pas un vocabulaire.
  if (Array.isArray(site.sections) && site.sections.length > 0) {
    for (const sec of site.sections) {
      const items = Array.isArray(sec?.items) ? sec.items : []
      if (items.length === 0) continue
      const titre = typeof sec?.name === 'string' && sec.name.trim() !== '' ? sec.name.trim() : t.sectionFallback
      lines.push('## ' + titre)
      for (const it of items) {
        const label = it?.title ?? it?.name
        if (label) lines.push('- ' + label)
      }
      lines.push('')
    }
  }

  if (Array.isArray(site.products) && site.products.length > 0) {
    lines.push('## ' + t.products)
    for (const p of site.products) {
      if (p?.name) lines.push('- ' + p.name)
    }
    lines.push('')
  }

  // Mission / Vision
  if (site.mission) {
    lines.push('## ' + t.mission)
    lines.push(site.mission)
    lines.push('')
  }
  if (site.vision) {
    lines.push('## ' + t.vision)
    lines.push(site.vision)
    lines.push('')
  }

  // Pourquoi nous
  if (Array.isArray(site.whyus) && site.whyus.length > 0) {
    lines.push('## ' + t.whyUs)
    for (const w of site.whyus) {
      if (w?.title) {
        lines.push('### ' + w.title)
        if (w?.text) lines.push(w.text)
        lines.push('')
      }
    }
  }

  // Questions fréquentes
  if (Array.isArray(site.faq) && site.faq.length > 0) {
    lines.push('## ' + t.faq)
    for (const f of site.faq) {
      if (f?.question) {
        lines.push('### ' + f.question)
        if (f?.answer) lines.push(f.answer)
        lines.push('')
      }
    }
  }

  // Zone desservie
  if (site.area_served) {
    lines.push('## ' + t.areaServed)
    lines.push(site.area_served)
    lines.push('')
  }

  // DEBT-035 -- LA GAMME DE PRIX ETAIT PUBLIEE D'UN SEUL COTE.
  //
  // `JsonLd.tsx` l'emet en `priceRange` depuis le chantier 5 ; ce fichier ne
  // la publiait pas. Deux surfaces GEO, deux descriptions differentes du meme
  // site -- alors que le chantier 5 a rendu `area_served` ET `price_range`
  // editables ENSEMBLE, et que le bloc juste au-dessus publie le premier.
  //
  // AUCUN VOCABULAIRE COMMERCIAL N'ENTRE ICI : la valeur est bornee aux
  // quatre symboles `$`/`$$`/`$$$`/`$$$$` par `isSupportedPriceRange`, qui
  // garde deja le chemin d'ecriture de l'agent. C'est un signal de
  // positionnement, pas un prix -- un annuaire local en publie un, une
  // vitrine aussi.
  if (site.price_range) {
    lines.push('## ' + t.priceRange)
    lines.push(site.price_range)
    lines.push('')
  }

  const phone = site.contact?.phone
  const email = site.contact?.email
  const address = site.contact?.address
  if (phone || email || address) {
    lines.push('## ' + t.contact)
    if (phone) lines.push('- ' + t.phone + ' : ' + phone)
    if (email) lines.push('- ' + t.email + ' : ' + email)
    if (address) lines.push('- ' + t.address + ' : ' + address)
    lines.push('')
  }

  // ============================================================
  // LOT BLOG 8 -- LES ARTICLES SONT DECLARES AUX CRAWLERS LLM.
  //
  // Meme source que la page publique et que le sitemap : la vue. Un brouillon
  // ne peut donc pas fuir ici.
  //
  // L'INTITULE SUIT LA LANGUE DU SITE, comme les onze autres (CHANTIER 8) --
  // ce fichier existe pour etre lu par des machines qui en tirent une
  // comprehension du commerce ; lui faire annoncer une langue que le contenu
  // ne parle pas est une erreur de fond. `t.articles` n'existant pas dans
  // `llmsTxtLabels`, l'intitule est derive de la langue ICI plutot que
  // d'elargir un dictionnaire partage hors perimetre.
  const articles = await fetchBlogEntries((site as { id: string }).id)
  if (articles.length > 0) {
    const TITRE: Record<string, string> = { fr: 'Articles', en: 'Articles', es: 'Artículos', ar: 'مقالات' }
    lines.push('## ' + (TITRE[(site.lang || 'fr').slice(0, 2)] ?? TITRE.fr))
    for (const a of articles) {
      lines.push('- ' + a.title + ' : ' + url + '/blog/' + encodeURIComponent(a.slug))
    }
    lines.push('')
  }

  lines.push('## ' + t.website)
  lines.push(url)
  lines.push('')
  lines.push('---')
  // DEBT-034 -- la derniere MODIFICATION, plus la creation.
  const fraicheur = resolveSiteFreshness(site)
  if (fraicheur) {
    lines.push(t.lastUpdated + ' : ' + new Date(fraicheur).toISOString().split('T')[0])
  }
  lines.push(t.generatedBy + ' — ' + WOORRI_SITE_URL)
  lines.push('')

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
