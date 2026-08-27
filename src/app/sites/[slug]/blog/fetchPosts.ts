import { supabase } from '@/lib/supabase'

// ============================================================
// LOT BLOG 6 -- LECTURE PUBLIQUE DES ARTICLES.
//
// CLE ANON, ET VUE UNIQUEMENT. Ce module n'importe JAMAIS `supabaseAdmin` et
// ne nomme JAMAIS la table `site_blog_posts` : la table ne rend aucun
// privilege a `anon` (mesure : 401 / 42501) et sa RLS est active sans policy.
// Tout passe par `site_blog_posts_public`, vue en `security_invoker = false`
// jointe a `sites_public`.
//
// L'INVARIANT DE VISIBILITE N'EST PAS ECRIT ICI, ET C'EST VOULU. « article
// publie ET site publie ET site non archive » vit dans la definition de la
// vue -- verifie en base. Une regression de ce fichier ne peut donc pas
// exposer un brouillon ni le contenu d'un site archive : la base ne les rend
// pas. C'est ce qui distingue un invariant d'une convention.
//
// RESOLUTION PAR LE COUPLE (site_id, slug), JAMAIS PAR LE SLUG SEUL. Deux
// sites peuvent publier « nos-horaires » : un slug seul est ambigu par
// construction, et le resoudre ainsi servirait l'article d'un autre locataire
// sur le domaine du premier.
// ============================================================

/** Le strict necessaire pour brander une page de blog. Jamais d'email, jamais d'id de paiement. */
export type BlogSite = {
  id: string
  slug: string
  name: string
  slogan: string | null
  about: string | null
  primary_color: string | null
  lang: string | null
  custom_domain: string | null
}

export type BlogPostCard = {
  slug: string
  title: string
  excerpt: string | null
  cover_image: string | null
  published_at: string | null
}

export type BlogPostPage = BlogPostCard & {
  content: string
  updated_at: string | null
}

/** Colonnes reellement consommees par les deux pages -- jamais `select('*')`. */
const COLS_CARTE = 'slug,title,excerpt,cover_image,published_at'
const COLS_ARTICLE = `${COLS_CARTE},content,updated_at`

/**
 * Resout le site public. Meme lecture legere que `fetchProduct.ts` : la vue
 * `sites_public` applique deja `published = true AND archived_at IS NULL`.
 */
async function fetchBlogSite(slug: string): Promise<BlogSite | null> {
  const { data } = await supabase
    .from('sites_public')
    .select('id,slug,name,slogan,about,primary_color,lang,custom_domain')
    .eq('slug', slug)
    .maybeSingle()
  return (data as BlogSite) ?? null
}

/** Index du blog d'un site. `null` = le site n'est pas une surface publique. */
export async function fetchBlogIndex(
  slug: string
): Promise<{ site: BlogSite; posts: BlogPostCard[] } | null> {
  const site = await fetchBlogSite(slug)
  if (!site) return null

  const { data } = await supabase
    .from('site_blog_posts_public')
    .select(COLS_CARTE)
    .eq('site_id', site.id)
    .order('published_at', { ascending: false })

  return { site, posts: (data as BlogPostCard[]) ?? [] }
}

/** Un article. `null` couvre indistinctement : site absent, article absent,
 *  article d'un autre site, brouillon, site archive. */
export async function fetchBlogPost(
  slug: string,
  postSlug: string
): Promise<{ site: BlogSite; post: BlogPostPage } | null> {
  const site = await fetchBlogSite(slug)
  if (!site) return null

  const { data } = await supabase
    .from('site_blog_posts_public')
    .select(COLS_ARTICLE)
    .eq('site_id', site.id)
    .eq('slug', postSlug)
    .maybeSingle()

  if (!data) return null
  return { site, post: data as BlogPostPage }
}

/**
 * LOT BLOG 8 -- articles publies d'un site, pour les surfaces DERIVEES
 * (sitemap par site, llms.txt).
 *
 * Meme vue, meme filtre `site_id`, meme invariant de visibilite : ces deux
 * surfaces ne peuvent donc pas annoncer aux moteurs une URL que la page
 * publique refuserait de servir. C'est exactement le defaut ferme par le
 * LOT 2 du chantier catalogue -- « le sitemap publiait ce que la vitrine
 * refuse d'afficher ».
 *
 * `updated_at` est projete pour le `<lastmod>` : suivre `created_at`
 * contredirait le `changefreq` annonce (lecon DEBT-034).
 */
export async function fetchBlogEntries(siteId: string): Promise<
  { slug: string; title: string; published_at: string | null; updated_at: string | null }[]
> {
  const { data } = await supabase
    .from('site_blog_posts_public')
    .select('slug,title,published_at,updated_at')
    .eq('site_id', siteId)
    .order('published_at', { ascending: false })
  return (data as { slug: string; title: string; published_at: string | null; updated_at: string | null }[]) ?? []
}
