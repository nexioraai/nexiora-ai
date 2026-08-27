import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { fetchBlogIndex } from './fetchPosts'
import { getBlogLabels, formatDate, tronquer } from './labels'
import { resolveSiteBaseUrl } from '../themes/shared'
import { ogLocaleFor } from '@/lib/i18n/supportedLanguages'
import HtmlLang from '../themes/HtmlLang'
import JsonLdScript from '../themes/JsonLdScript'

// ============================================================
// LOT BLOG 6 -- INDEX PUBLIC DU BLOG D'UN SITE.
//
// AUCUN `export const revalidate`, ET C'EST UNE DECISION. Cette page appelle
// `headers()` pour resoudre le domaine reellement servi : la declarer
// revalidable serait au mieux trompeur (M1-08), au pire l'ouverture d'un
// cache PARTAGE entre locataires. La performance ne s'achete pas au prix d'un
// risque inter-locataire.
//
// AUCUNE MODIFICATION DU PROXY. `mondomaine.com/blog` est deja reecrit en
// `/sites/{slug}/blog` par la reecriture existante ; ce fichier, segment
// statique, precede le catch-all `[...rest]` dans l'ordre de routage de
// Next.js. Rien a ajouter.
//
// LES LIENS SONT ABSOLUS ET RESOLUS PAR `resolveSiteBaseUrl`. Un chemin
// plateforme en dur (`/sites/{slug}/blog/...`) serait re-prefixe par le proxy
// sur un domaine perso et tomberait en 404 -- le motif que porte aujourd'hui
// `ClickableProductCard` (consigne hors perimetre, non corrige ici).
// ============================================================

type Props = { params: Promise<{ slug: string }> }

// ============================================================
// LOT BLOG 7 -- SEO DE L'INDEX.
//
// LE CANONICAL VIENT DE `resolveSiteBaseUrl`, JAMAIS DE
// `NEXT_PUBLIC_SITE_URL`. Sur un domaine perso il rend
// `https://mondomaine.com`, sur l'origine plateforme
// `https://www.deribfy.com/sites/{slug}`. Annoncer un canonical plateforme
// depuis un domaine client ferait declarer aux moteurs que la vraie page est
// ailleurs -- exactement ce que `resolveSiteBaseUrl` a ete ecrite pour eviter.
//
// `og:locale` SUIT LA LANGUE DU SITE, via `ogLocaleFor`. Le CHANTIER 3 a
// mesure des sites anglophones annoncant `fr_FR` a Facebook et LinkedIn : la
// regle est desormais unique, et ce fichier s'y range plutot que d'inventer
// la sienne.
// ============================================================
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const donnees = await fetchBlogIndex(slug)
  if (!donnees) return { title: 'Blog introuvable' }

  const { site } = donnees
  const t = getBlogLabels(site.lang)
  const title = `${t.blog} — ${site.name}`
  const description = tronquer(site.slogan ?? site.about)
  const url = `${resolveSiteBaseUrl(site, (await headers()).get('host'))}/blog`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: site.name,
      type: 'website',
      locale: ogLocaleFor(site.lang),
    },
    twitter: { card: 'summary', title, description },
  }
}

export default async function BlogIndexPage({ params }: Props) {
  const { slug } = await params
  const donnees = await fetchBlogIndex(slug)
  if (!donnees) notFound()

  const { site, posts } = donnees
  const base = resolveSiteBaseUrl(site, (await headers()).get('host'))
  const t = getBlogLabels(site.lang)
  const accent = site.primary_color || '#111111'
  const lang = (site.lang || 'fr').slice(0, 2)

  // JSON-LD emis par le SINK COMMUN. `JsonLdScript` est le seul point du
  // depot autorise a passer du JSON a `dangerouslySetInnerHTML` : il echappe
  // `< > & U+2028 U+2029`, ce que `JSON.stringify` ne fait pas (M1-01). Une
  // garde structurelle echoue si un second emetteur apparait.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: `${t.blog} — ${site.name}`,
    url: `${base}/blog`,
    inLanguage: site.lang || undefined,
    publisher: { '@type': 'Organization', name: site.name, url: base },
    blogPost: posts.map((p) => ({
      '@type': 'BlogPosting',
      headline: p.title,
      url: `${base}/blog/${encodeURIComponent(p.slug)}`,
      datePublished: p.published_at || undefined,
    })),
  }

  return (
    <>
      <JsonLdScript data={jsonLd} />
      <HtmlLang lang={site.lang} />
      <main
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
        style={{ maxWidth: 760, margin: '0 auto', padding: '64px 24px' }}
      >
        <Link href={base} style={{ fontSize: 14, color: accent, textDecoration: 'none' }}>
          {t.accueil}
        </Link>

        <h1 style={{ fontSize: 40, fontWeight: 800, margin: '24px 0 8px', letterSpacing: '-0.02em' }}>
          {t.blog}
        </h1>
        <p style={{ fontSize: 15, opacity: 0.6, margin: '0 0 48px' }}>{site.name}</p>

        {posts.length === 0 ? (
          <p style={{ fontSize: 15, opacity: 0.6 }}>{t.vide}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
            {posts.map((p) => {
              const date = formatDate(p.published_at, site.lang)
              return (
                <article key={p.slug}>
                  <Link
                    href={`${base}/blog/${encodeURIComponent(p.slug)}`}
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    {p.cover_image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.cover_image}
                        alt=""
                        style={{ width: '100%', borderRadius: 14, marginBottom: 16, display: 'block' }}
                      />
                    )}
                    <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.01em' }}>
                      {p.title}
                    </h2>
                    {date && <p style={{ fontSize: 13, opacity: 0.55, margin: '0 0 8px' }}>{date}</p>}
                    {p.excerpt && (
                      <p style={{ fontSize: 16, lineHeight: 1.6, opacity: 0.75, margin: 0 }}>{p.excerpt}</p>
                    )}
                  </Link>
                </article>
              )
            })}
          </div>
        )}
      </main>
    </>
  )
}
