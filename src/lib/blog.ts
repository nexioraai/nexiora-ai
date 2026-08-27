import { supabaseAdmin } from '@/lib/supabase-admin';

// ============================================================
// LOT BLOG 3 -- ACCES AUX DONNEES DE `public.site_blog_posts`.
//
// MODULE UNIQUE, comme `lib/shop.ts` l'est pour `shop_products` : toutes les
// requetes vers cette table passent ici. C'est ce qui rend verifiable
// l'affirmation « le blog client n'utilise jamais `blog_posts` » -- il n'y a
// qu'un seul endroit ou le nom de table est ecrit.
//
// TOUTES LES ECRITURES SONT SOUS `service_role`. La table n'accorde AUCUN
// privilege a `anon` ni a `authenticated` (verifie en base : 401 / 42501), et
// sa RLS est active sans aucune policy. Le navigateur ne peut donc rien y
// faire directement, ni en lecture ni en ecriture -- toute la surface passe
// par les routes serveur, qui portent l'autorisation.
//
// `site_id` N'EST JAMAIS UN PARAMETRE VENU DU CLIENT. Chaque fonction qui en
// prend un le recoit d'un appelant qui l'a resolu : soit `requireSiteOwner`
// (site authentifie), soit `requireArticleOwner` (article verifie). Aucune
// fonction de ce module ne lit un corps de requete.
// ============================================================

/** Ligne de `public.site_blog_posts` -- 12 colonnes, schema verifie en base. */
export type SiteBlogPost = {
  id: string;
  site_id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  cover_image: string | null;
  cover_storage_path: string | null;
  published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Champs qu'un proprietaire peut ecrire, en creation comme en modification.
 *
 * ALLOWLIST, JAMAIS LISTE NOIRE -- meme raison qu'`ALLOWED_PRODUCT_FIELDS`
 * (audit Mode 3 global, CRIT-2) : une liste noire laisse passer par defaut
 * tout champ ajoute plus tard. Ici, l'omission est la protection.
 *
 * CE QUI EN EST ABSENT, ET POURQUOI :
 *   `site_id`            -- l'appartenance. Jamais ecrite par un client :
 *                           c'est l'invariant central de tout le chantier ;
 *   `id`, `created_at`   -- l'identite et l'origine de la ligne ;
 *   `updated_at`         -- pose par le declencheur `site_blog_posts_touch_
 *                           updated_at` (BEFORE UPDATE ROW, verifie actif) ;
 *   `published_at`       -- DERIVE de `published` par le serveur. Le laisser
 *                           au client permettrait d'antidater une publication,
 *                           donc de mentir au `<lastmod>` du sitemap et a
 *                           `datePublished` du JSON-LD ;
 *   `cover_storage_path` -- ecrit uniquement par la route de televersement
 *                           (lot 5), qui seule connait le chemin reel.
 *
 * SEMANTIQUE : un champ absent de cette liste est IGNORE, jamais rejete par
 * un 400 -- comportement identique a celui des produits.
 */
export const ALLOWED_POST_FIELDS = [
  'title',
  'slug',
  'excerpt',
  'content',
  'cover_image',
  'published',
] as const;

export type PostPatch = Partial<Record<(typeof ALLOWED_POST_FIELDS)[number], unknown>>;

/** Ne retient du corps que les champs autorises. Le reste n'existe pas. */
export function filtrerChamps(body: unknown): PostPatch {
  const patch: PostPatch = {};
  if (!body || typeof body !== 'object') return patch;
  const src = body as Record<string, unknown>;
  for (const champ of ALLOWED_POST_FIELDS) {
    if (champ in src) patch[champ] = src[champ];
  }
  return patch;
}

/**
 * Derive un slug d'article a partir de son titre.
 *
 * DELIBEREMENT DISTINCT de `generateSlug` (chat/route.ts), qui suffixe un
 * horodatage : c'est ce qu'il faut pour un SITE -- unicite globale garantie --
 * et c'est exactement ce qu'il ne faut pas pour un ARTICLE, dont l'URL doit
 * rester lisible. L'unicite d'un slug d'article est portee par la base
 * (`UNIQUE (site_id, slug)`), donc DANS le site, pas par une chaine aleatoire.
 *
 * La sortie satisfait par construction la contrainte `site_blog_posts_slug_chk`
 * (`^[a-z0-9]+(-[a-z0-9]+)*$`, longueur <= 120). Le repli `'article'` couvre
 * les titres non translitterables (arabe, chinois) : mieux vaut un slug
 * generique qu'un refus de la base.
 */
export function slugifyArticleTitle(titre: unknown): string {
  const base = String(titre ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 120)
    .replace(/-$/, '');
  return base || 'article';
}

/**
 * Traduit une erreur d'ecriture PostgreSQL en reponse CONTROLEE.
 *
 * Rend `null` si l'erreur n'est pas reconnue -- l'appelant la laisse alors
 * remonter comme un incident serveur.
 *
 * POURQUOI DES MESSAGES CONSTANTS. Sans cette traduction, une collision de
 * slug remonterait au `catch` de la route et rendrait un 500 porteur du texte
 * brut de Postgres : nom de contrainte, nom de colonne, moteur. C'est la
 * classe de defaut fermee par la DETTE 6d sur les produits. Une collision est
 * d'ailleurs une erreur du CLIENT (409), jamais du serveur.
 */
export function ecritureRefusee(e: unknown): { status: number; error: string } | null {
  const code = (e as { code?: unknown })?.code;
  if (code === '23505') {
    return { status: 409, error: 'Un article de ce site utilise déjà ce lien.' };
  }
  if (code === '23514') {
    return { status: 400, error: 'Titre ou lien invalide.' };
  }
  return null;
}

/**
 * Lit un article par son identifiant.
 *
 * EXTRAITE ICI AU LOT 3, comme annonce au lot 1 : `requireArticleOwner` en
 * etait le seul appelant, les quatre routes de ce lot en ajoutent d'autres.
 * Un seul module ecrit le nom de la table -- c'est le meme mouvement que
 * `getProduct` dans `lib/shop.ts`.
 *
 * `throw` sur erreur de base, comme `getProduct` : une panne n'est pas une
 * absence. La levee est FAIL-CLOSED cote autorisation -- elle empeche
 * `requireArticleOwner` d'atteindre `ok: true`.
 */
export async function getArticle(id: string): Promise<SiteBlogPost | null> {
  const { data, error } = await supabaseAdmin
    .from('site_blog_posts')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getArticle: ${error.message}`);
  return (data as SiteBlogPost) ?? null;
}

/**
 * Liste les articles d'UN site -- brouillons compris.
 *
 * Surface PROPRIETAIRE : l'appelant a deja prouve qu'il possede `siteId`.
 * La surface PUBLIQUE ne passe jamais par ici : elle lit la vue
 * `site_blog_posts_public` avec la cle anon (lot 6).
 */
export async function listPosts(siteId: string): Promise<SiteBlogPost[]> {
  const { data, error } = await supabaseAdmin
    .from('site_blog_posts')
    .select('*')
    .eq('site_id', siteId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listPosts: ${error.message}`);
  return (data as SiteBlogPost[]) ?? [];
}

/** Cree un article. `siteId` vient du site AUTHENTIFIE, jamais du corps. */
export async function createPost(
  siteId: string,
  valeurs: Record<string, unknown>
): Promise<SiteBlogPost> {
  const { data, error } = await supabaseAdmin
    .from('site_blog_posts')
    .insert({ ...valeurs, site_id: siteId })
    .select('*')
    .single();
  if (error) throw error;
  return data as SiteBlogPost;
}

/**
 * Met a jour un article.
 *
 * FILTRE SUR LE COUPLE `(id, site_id)`, ET NON SUR `id` SEUL -- divergence
 * assumee avec `updateProduct`. La propriete est deja etablie par
 * `requireArticleOwner` ; ce second filtre ne la remplace pas, il la rend
 * LOCALE a l'ecriture. Si un jour un appelant transmettait un identifiant
 * different de celui qu'il a fait verifier, la requete ne toucherait aucune
 * ligne au lieu d'ecrire chez un autre locataire.
 */
export async function updatePost(
  id: string,
  siteId: string,
  patch: Record<string, unknown>
): Promise<SiteBlogPost | null> {
  const { data, error } = await supabaseAdmin
    .from('site_blog_posts')
    .update(patch)
    .eq('id', id)
    .eq('site_id', siteId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return (data as SiteBlogPost) ?? null;
}

/**
 * Pose la couverture d'un article -- SEUL ecrivain de `cover_storage_path`.
 *
 * FONCTION DEDIEE PLUTOT QU'UN `updatePost` GENERIQUE, et c'est deliberé :
 * `cover_storage_path` est ABSENTE d'`ALLOWED_POST_FIELDS`, donc structurellement
 * inatteignable depuis un corps de requete. La seule facon de l'ecrire doit
 * rester un acte SERVEUR nomme, dont le chemin vient d'etre calcule -- jamais
 * un patch generique dans lequel elle pourrait un jour se glisser.
 *
 * Rend l'ancien chemin, s'il existait : l'appelant peut alors retirer l'objet
 * devenu orphelin. Sans cela, chaque remplacement de couverture laisserait un
 * fichier permanent dans un bucket public -- le residu deja MESURE sur
 * `custom-designs` (22 objets pour 0 ligne `design_uploads`).
 *
 * Meme double filtre `(id, site_id)` que `updatePost`, meme raison.
 */
export async function setPostCover(
  id: string,
  siteId: string,
  coverImage: string,
  storagePath: string
): Promise<{ post: SiteBlogPost; ancienChemin: string | null } | null> {
  const { data: avant, error: erreurLecture } = await supabaseAdmin
    .from('site_blog_posts')
    .select('cover_storage_path')
    .eq('id', id)
    .eq('site_id', siteId)
    .maybeSingle();
  if (erreurLecture) throw erreurLecture;

  const { data, error } = await supabaseAdmin
    .from('site_blog_posts')
    .update({ cover_image: coverImage, cover_storage_path: storagePath })
    .eq('id', id)
    .eq('site_id', siteId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    post: data as SiteBlogPost,
    ancienChemin: (avant as { cover_storage_path?: string | null } | null)?.cover_storage_path ?? null,
  };
}

/** Supprime un article. Meme double filtre, meme raison. */
export async function deletePost(id: string, siteId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('site_blog_posts')
    .delete()
    .eq('id', id)
    .eq('site_id', siteId);
  if (error) throw new Error(`deletePost: ${error.message}`);
}
