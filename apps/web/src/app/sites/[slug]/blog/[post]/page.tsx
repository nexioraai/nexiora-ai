import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { fetchBlogPost } from '../fetchPosts'
import { getBlogLabels, formatDate, tronquer } from '../labels'
import BlogText from '../BlogText'
import { resolveSiteBaseUrl } from '../../themes/shared'
import { ogLocaleFor } from '@/lib/i18n/supportedLanguages'
import HtmlLang from '../../themes/HtmlLang'
import JsonLdScript from '../../themes/JsonLdScript'

// ============================================================
// LOT BLOG 6 -- PAGE PUBLIQUE D'UN ARTICLE.
//
// `notFound()` COUVRE CINQ CAS D'UN SEUL GESTE, et c'est la vue qui les rend
// indistinguables : site inexistant, article inexistant, article d'un AUTRE
// site, brouillon, site archive. Aucun de ces cas n'a de reponse propre --
// il n'y a donc rien a deduire d'un 404.
//
// Pas de `revalidate` : voir le bloc de la page d'index.
// ============================================================

type Props = { params: Promise<{ slug: string; post: string }> }

/** URL canonique de l'article, sur l'origine REELLEMENT servie. */
async function urlArticle(site: { slug: string; custom_domain: string | null }, postSlug: string) {
  const base = resolveSiteBaseUrl(site, (await headers()).get('host'))
  return { base, url: `${base}/blog/${encodeURIComponent(postSlug)}` }
}

// ============================================================
// LOT BLOG 7 -- SEO DE L'ARTICLE.
//
// `og:type = 'article'`, et non `'website'` : c'est ce qui permet a
// `publishedTime` et `modifiedTime` d'exister dans Open Graph.
//
// `description` VIENT D'`excerpt`, qui porte la `meta_description` produite
// par le generateur -- 140-155 caracteres calibres pour ce seul usage. Le
// repli sur le debut du corps n'est pas un choix esthetique : une page sans
// description laisse le moteur en fabriquer une.
// ============================================================
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, post: postSlug } = await params
  const donnees = await fetchBlogPost(slug, decodeURIComponent(postSlug))
  if (!donnees) return { title: 'Article introuvable' }

  const { site, post } = donnees
  const title = `${post.title} — ${site.name}`
  const description = tronquer(post.excerpt ?? post.content)
  const { url } = await urlArticle(site, post.slug)
  const images = post.cover_image ? [{ url: post.cover_image }] : undefined

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: site.name,
      images,
      type: 'article',
      locale: ogLocaleFor(site.lang),
      publishedTime: post.published_at ?? undefined,
      modifiedTime: post.updated_at ?? undefined,
    },
    twitter: {
      card: images ? 'summary_large_image' : 'summary',
      title,
      description,
      images: post.cover_image ? [post.cover_image] : undefined,
    },
  }
}

export default async function BlogPostPage({ params }: Props) {
  const { slug, post: postSlug } = await params
  const donnees = await fetchBlogPost(slug, decodeURIComponent(postSlug))
  if (!donnees) notFound()

  const { site, post } = donnees
  const { base, url } = await urlArticle(site, post.slug)
  const t = getBlogLabels(site.lang)
  const accent = site.primary_color || '#111111'
  const lang = (site.lang || 'fr').slice(0, 2)
  const date = formatDate(post.published_at, site.lang)

  // JSON-LD `BlogPosting`, emis par le SINK COMMUN `JsonLdScript` -- seul
  // point du depot autorise a passer du JSON a `dangerouslySetInnerHTML`.
  // `post.title` et `post.excerpt` sont ecrits par le marchand : c'est
  // exactement le vecteur M1-01, et c'est la serialisation echappee de
  // `JsonLdScript` qui le ferme.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt || undefined,
    image: post.cover_image || undefined,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    datePublished: post.published_at || undefined,
    dateModified: post.updated_at || post.published_at || undefined,
    inLanguage: site.lang || undefined,
    author: { '@type': 'Organization', name: site.name, url: base },
    publisher: { '@type': 'Organization', name: site.name, url: base },
  }

  return (
    <>
      <JsonLdScript data={jsonLd} />
      <HtmlLang lang={site.lang} />
      <main
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
        style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px' }}
      >
        <Link href={`${base}/blog`} style={{ fontSize: 14, color: accent, textDecoration: 'none' }}>
          {t.retour}
        </Link>

        <h1 style={{ fontSize: 38, fontWeight: 800, margin: '24px 0 12px', lineHeight: 1.15, letterSpacing: '-0.02em' }}>
          {post.title}
        </h1>
        {date && <p style={{ fontSize: 14, opacity: 0.55, margin: '0 0 28px' }}>{date}</p>}

        {post.cover_image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.cover_image}
            alt=""
            style={{ width: '100%', borderRadius: 16, margin: '0 0 32px', display: 'block' }}
          />
        )}

        {/* Le corps est du TEXTE. Voir `BlogText` pour le raisonnement complet. */}
        <BlogText content={post.content} color="inherit" />
      </main>
    </>
  )
}
