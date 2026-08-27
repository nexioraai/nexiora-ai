import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { creerFrom, journalVierge, type ReponseTable } from '@/lib/testing/postgrest'

// ============================================================
// LOT BLOG 6 -- SURFACE PUBLIQUE DU BLOG.
//
// HARNAIS FIDELE (`@/lib/testing/postgrest`) : il honore la projection comme
// PostgREST et CAPTURE les filtres. C'est indispensable ICI plus qu'ailleurs --
// c'est precisement le retrait d'un `.eq('site_id', ...)` qu'il faut rendre
// observable, et un double permissif le masquerait entierement.
// ============================================================

const journal = journalVierge()
let sitesPublic: ReponseTable = { data: null, error: null }
let articles: ReponseTable = { data: null, error: null }

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (t: string) =>
      creerFrom(
        {
          sites_public: { reponse: () => sitesPublic },
          site_blog_posts_public: { reponse: () => articles },
        },
        journal
      )(t),
  },
}))

import { fetchBlogIndex, fetchBlogPost } from '../fetchPosts'

const SITE = {
  id: 'aaaaaaaa-1111-4111-8111-111111111111',
  slug: 'mon-site-1780000000000',
  name: 'Mon Site',
  primary_color: '#FA5D1E',
  lang: 'fr',
  custom_domain: null,
}
const ARTICLE = {
  slug: 'nos-horaires',
  title: 'Nos horaires',
  excerpt: 'Un extrait.',
  cover_image: null,
  published_at: '2026-08-01T10:00:00Z',
  content: 'Le corps.',
  updated_at: '2026-08-02T10:00:00Z',
}

beforeEach(() => {
  sitesPublic = { data: SITE, error: null }
  articles = { data: [ARTICLE], error: null }
  for (const c of [journal.filtres, journal.projections, journal.ecritures]) {
    for (const k of Object.keys(c)) delete (c as Record<string, unknown>)[k]
  }
})

describe('fetchBlogIndex', () => {
  it('résout le site puis SES articles, filtrés par `site_id`', async () => {
    const r = await fetchBlogIndex('mon-site-1780000000000')
    expect(r?.site.id).toBe(SITE.id)
    expect(journal.filtres.sites_public).toContainEqual(['eq', 'slug', 'mon-site-1780000000000'])
    expect(journal.filtres.site_blog_posts_public).toContainEqual(['eq', 'site_id', SITE.id])
  })

  it('trie du plus récent au plus ancien', async () => {
    await fetchBlogIndex('mon-site-1780000000000')
    expect(journal.filtres.site_blog_posts_public).toContainEqual([
      'order', 'published_at', { ascending: false },
    ])
  })

  it('site absent de `sites_public` -> `null`, et AUCUNE requête d’articles', async () => {
    sitesPublic = { data: null, error: null }
    expect(await fetchBlogIndex('inconnu')).toBeNull()
    expect(journal.filtres.site_blog_posts_public).toBeUndefined()
  })

  it('site publié sans article -> liste vide, jamais `null`', async () => {
    articles = { data: [], error: null }
    const r = await fetchBlogIndex('mon-site-1780000000000')
    expect(r?.posts).toEqual([])
  })

  it('une panne d’articles ne fabrique pas un site introuvable', async () => {
    articles = { data: null, error: { message: 'boom' } }
    const r = await fetchBlogIndex('mon-site-1780000000000')
    expect(r?.site.id).toBe(SITE.id)
    expect(r?.posts).toEqual([])
  })

  it('la projection est EXPLICITE — jamais `*`, et `content` n’est pas chargé pour une liste', async () => {
    await fetchBlogIndex('mon-site-1780000000000')
    const cols = journal.projections.site_blog_posts_public
    expect(cols).not.toContain('*')
    expect(cols).toBe('slug,title,excerpt,cover_image,published_at')
    expect(cols).not.toContain('content')
  })

  it('le site projeté ne porte AUCUNE donnée sensible', async () => {
    await fetchBlogIndex('mon-site-1780000000000')
    const cols = journal.projections.sites_public
    for (const interdit of ['owner_email', 'owner_id', 'stripe', 'payment', '*']) {
      expect(cols, interdit).not.toContain(interdit)
    }
  })
})

describe('fetchBlogPost — résolution par le COUPLE', () => {
  it('filtre sur `site_id` ET sur `slug`, jamais sur le slug seul', async () => {
    articles = { data: ARTICLE, error: null }
    const r = await fetchBlogPost('mon-site-1780000000000', 'nos-horaires')
    expect(r?.post.title).toBe('Nos horaires')
    const f = journal.filtres.site_blog_posts_public
    expect(f).toContainEqual(['eq', 'site_id', SITE.id])
    expect(f).toContainEqual(['eq', 'slug', 'nos-horaires'])
  })

  it('le MÊME slug sur un AUTRE site ne peut pas être servi ici', async () => {
    // La vue ne rend rien parce que le couple ne correspond pas.
    articles = { data: null, error: null }
    expect(await fetchBlogPost('mon-site-1780000000000', 'nos-horaires')).toBeNull()
    expect(journal.filtres.site_blog_posts_public).toContainEqual(['eq', 'site_id', SITE.id])
  })

  it('site absent -> `null`, aucune requête d’article', async () => {
    sitesPublic = { data: null, error: null }
    expect(await fetchBlogPost('inconnu', 'nos-horaires')).toBeNull()
    expect(journal.filtres.site_blog_posts_public).toBeUndefined()
  })

  it('article absent (brouillon, site archivé, inexistant) -> `null` indistinctement', async () => {
    articles = { data: null, error: null }
    expect(await fetchBlogPost('mon-site-1780000000000', 'peu-importe')).toBeNull()
  })

  it('`content` est chargé pour l’article, et lui seul', async () => {
    articles = { data: ARTICLE, error: null }
    await fetchBlogPost('mon-site-1780000000000', 'nos-horaires')
    const cols = journal.projections.site_blog_posts_public
    expect(cols).toContain('content')
    expect(cols).not.toContain('*')
  })
})

// ============================================================
// CLIQUET STRUCTUREL SUR TOUTE LA SURFACE PUBLIQUE DU BLOG
// ============================================================
describe('cliquet structurel — surface publique', () => {
  const RACINE = join(__dirname, '..')
  const fichiers: string[] = []
  ;(function walk(d: string) {
    for (const e of readdirSync(d)) {
      const f = join(d, e)
      if (statSync(f).isDirectory()) {
        if (e !== '__tests__') walk(f)
      } else if (/\.tsx?$/.test(e)) fichiers.push(f)
    }
  })(RACINE)

  const code = (f: string) =>
    readFileSync(f, 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const rel = (f: string) => f.replace(RACINE, 'blog')

  it('les quatre fichiers de la surface sont bien vus par ce cliquet', () => {
    expect(fichiers.map(rel).sort()).toEqual([
      'blog/BlogText.tsx', 'blog/[post]/page.tsx', 'blog/fetchPosts.ts',
      'blog/labels.ts', 'blog/page.tsx',
    ].sort())
  })

  it('AUCUN `dangerouslySetInnerHTML` sur la surface publique', () => {
    for (const f of fichiers) expect(code(f), rel(f)).not.toMatch(/dangerouslySetInnerHTML/)
  })

  it('AUCUN `export const revalidate` — un cache partagé entre locataires', () => {
    // Ces pages appellent `headers()` : la revalidation ne s'appliquerait pas
    // (M1-08), et si elle s'appliquait elle mutualiserait des pages de sites
    // différents.
    for (const f of fichiers) expect(code(f), rel(f)).not.toMatch(/export\s+const\s+revalidate/)
  })

  it('AUCUN `supabaseAdmin` — la surface publique lit sous la clé anon', () => {
    for (const f of fichiers) expect(code(f), rel(f)).not.toMatch(/supabaseAdmin|supabase-admin|SERVICE_ROLE/)
  })

  it('la TABLE `site_blog_posts` n’est jamais nommée — seule la VUE l’est', () => {
    for (const f of fichiers) {
      expect(code(f), rel(f)).not.toMatch(/['"]site_blog_posts['"]/)
      expect(code(f), rel(f)).not.toMatch(/['"]blog_posts['"]/)
    }
    expect(code(join(RACINE, 'fetchPosts.ts'))).toContain("from('site_blog_posts_public')")
  })

  it('les liens passent par `resolveSiteBaseUrl` — jamais un chemin plateforme en dur', () => {
    // Un `/sites/${slug}/...` en dur serait re-préfixé par le proxy sur un
    // domaine perso et tomberait en 404.
    for (const p of ['page.tsx', '[post]/page.tsx']) {
      const c = code(join(RACINE, p))
      expect(c, p).toContain('resolveSiteBaseUrl')
      expect(c, p).not.toMatch(/href=\{`\/sites\//)
    }
  })

  it('aucune page ne réimplémente la visibilité — elle vit dans la vue', () => {
    for (const f of fichiers) {
      expect(code(f), rel(f)).not.toMatch(/published\s*[=!]==|archived_at/)
    }
  })

  // ============ LOT 7 -- SEO ============
  it('les DEUX pages exposent `generateMetadata`', () => {
    for (const f of ['page.tsx', '[post]/page.tsx']) {
      expect(code(join(RACINE, f)), f).toMatch(/export async function generateMetadata/)
    }
  })

  it('le canonical vient de `resolveSiteBaseUrl` — jamais de NEXT_PUBLIC_SITE_URL', () => {
    for (const f of ['page.tsx', '[post]/page.tsx']) {
      const c = code(join(RACINE, f))
      expect(c, f).toMatch(/alternates:\s*\{\s*canonical:/)
      expect(c, f).toContain('resolveSiteBaseUrl')
      expect(c, f).not.toMatch(/NEXT_PUBLIC_SITE_URL|WOORRI_SITE_URL|deribfy\.com/)
    }
  })

  it('`og:locale` suit la langue du site via `ogLocaleFor` — jamais une locale en dur', () => {
    for (const f of ['page.tsx', '[post]/page.tsx']) {
      const c = code(join(RACINE, f))
      expect(c, f).toContain('ogLocaleFor(site.lang)')
      expect(c, f).not.toMatch(/locale:\s*'[a-z]{2}_[A-Z]{2}'/)
    }
  })

  it('l’article est en `og:type = article`, l’index en `website`', () => {
    expect(code(join(RACINE, '[post]/page.tsx'))).toMatch(/type:\s*'article'/)
    expect(code(join(RACINE, 'page.tsx'))).toMatch(/type:\s*'website'/)
  })

  it('la description de l’article vient d’`excerpt` — la `meta_description` du générateur', () => {
    expect(code(join(RACINE, '[post]/page.tsx'))).toMatch(/tronquer\(post\.excerpt/)
  })

  it('JSON-LD `BlogPosting` émis par le SINK COMMUN, jamais par un mécanisme neuf', () => {
    const c = code(join(RACINE, '[post]/page.tsx'))
    expect(c).toMatch(/<JsonLdScript\s+data=\{jsonLd\}/)
    expect(c).toMatch(/'@type':\s*'BlogPosting'/)
    // Aucun second émetteur, aucune sérialisation réécrite.
    expect(c).not.toMatch(/JSON\.stringify|application\/ld\+json|serializeJsonLd/)
  })

  it('l’index émet un JSON-LD `Blog`, par le même sink', () => {
    const c = code(join(RACINE, 'page.tsx'))
    expect(c).toMatch(/<JsonLdScript\s+data=\{jsonLd\}/)
    expect(c).toMatch(/'@type':\s*'Blog'/)
    expect(c).not.toMatch(/JSON\.stringify|application\/ld\+json/)
  })

  it('les dates structurées viennent de la BASE, jamais de `new Date()`', () => {
    // Un `dateModified` fabriqué à la volée ferait paraître frais un article
    // qui ne l'est pas — le défaut exact que DEBT-034 a fermé sur le sitemap.
    const c = code(join(RACINE, '[post]/page.tsx'))
    expect(c).toMatch(/datePublished: post\.published_at/)
    expect(c).toMatch(/dateModified: post\.updated_at/)
    expect(c).not.toMatch(/new Date\(\)/)
  })

  it('le corps d’article passe par `BlogText`, qui rend du texte', () => {
    expect(code(join(RACINE, '[post]/page.tsx'))).toContain('<BlogText')
    const bt = code(join(RACINE, 'BlogText.tsx'))
    expect(bt).toContain("whiteSpace: 'pre-wrap'")
    expect(bt).toContain('{content}')
  })
})
