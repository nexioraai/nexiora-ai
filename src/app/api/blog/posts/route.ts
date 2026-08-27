import { NextResponse } from 'next/server';
import { requireSiteOwner } from '@/lib/auth/require-site-owner';
import {
  listPosts,
  createPost,
  filtrerChamps,
  slugifyArticleTitle,
  ecritureRefusee,
} from '@/lib/blog';

// ============================================================
// LOT BLOG 3 -- SURFACE PROPRIETAIRE, ENTREE PAR LE SITE.
//
// Patron `shop/products/route.ts` : le client nomme le site dont il se dit
// proprietaire, le serveur le RESOUT et le VERIFIE, puis n'utilise plus que
// le `site_id` lu en base. Un slug de site est une CLE DE RECHERCHE ; il ne
// devient jamais une autorite -- c'est `requireSiteOwner` qui tranche.
//
// DIVERGENCE ASSUMEE AVEC `shop/products` : la ce sont `body.slug` et
// `?slug=` qui portent le slug du SITE. Impossible ici -- un article a SON
// PROPRE `slug`, colonne de `site_blog_posts` et champ autorise. Deux sens
// pour une meme cle dans une meme charge utile est un defaut qui n'attend que
// son premier appelant. Le site se nomme donc `site`, l'article garde `slug`.
//
// AUCUN `site_id` N'EST LU, NI DU CORPS NI DE L'URL. Il n'apparait qu'une
// fois, en sortie de `requireSiteOwner`.
//
// PAS DE `canTransact` : le blog est une capacite commune aux trois modes.
// Voir le bloc dedie dans `require-article-owner.ts`.
// ============================================================

/** Reponse d'echec CONSTANTE -- jamais derivee d'une erreur de base. */
function panne(contexte: string, e: unknown) {
  console.error(`[blog/posts] ${contexte}:`, e);
  return NextResponse.json({ error: 'Service momentanément indisponible.' }, { status: 503 });
}

/** GET /api/blog/posts?site=<slug-du-site> -> tous les articles du site, brouillons compris. */
export async function GET(req: Request) {
  const site = new URL(req.url).searchParams.get('site');
  if (!site) return NextResponse.json({ error: 'Missing site' }, { status: 400 });

  const auth = await requireSiteOwner(req, site, 'id');
  if (!auth.ok) return auth.response;

  try {
    const posts = await listPosts((auth.site as { id: string }).id);
    return NextResponse.json({ posts });
  } catch (e) {
    return panne('listPosts', e);
  }
}

/** POST /api/blog/posts -> cree un brouillon. Corps : { site, title, slug?, content?, ... } */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const site = (body as { site?: unknown })?.site;
  if (typeof site !== 'string' || !site) {
    return NextResponse.json({ error: 'Missing site' }, { status: 400 });
  }

  const auth = await requireSiteOwner(req, site, 'id');
  if (!auth.ok) return auth.response;

  // TOUT CE QUI N'EST PAS DANS L'ALLOWLIST N'EXISTE PAS. `site_id`, `id`,
  // `created_at`, `published_at` et `cover_storage_path` sont structurellement
  // inatteignables depuis le corps.
  const champs = filtrerChamps(body);

  const titre = typeof champs.title === 'string' ? champs.title.trim() : '';
  if (!titre) return NextResponse.json({ error: 'Missing title' }, { status: 400 });

  if ('published' in champs && typeof champs.published !== 'boolean') {
    return NextResponse.json({ error: '`published` doit être un booléen.' }, { status: 400 });
  }
  const publie = champs.published === true;

  // Le slug est un segment d'URL, jamais du texte libre : il est NORMALISE,
  // qu'il vienne du client ou du titre. La contrainte `site_blog_posts_slug_chk`
  // ne peut donc pas se declencher sur la forme -- seule une collision reste
  // possible, et elle a sa propre reponse (409).
  const slugDemande = typeof champs.slug === 'string' && champs.slug.trim() ? champs.slug : titre;

  try {
    const post = await createPost((auth.site as { id: string }).id, {
      title: titre,
      slug: slugifyArticleTitle(slugDemande),
      excerpt: typeof champs.excerpt === 'string' ? champs.excerpt : null,
      content: typeof champs.content === 'string' ? champs.content : '',
      cover_image: typeof champs.cover_image === 'string' ? champs.cover_image : null,
      published: publie,
      // DERIVE, JAMAIS RECU. Antidater une publication ferait mentir le
      // `<lastmod>` du sitemap et le `datePublished` du JSON-LD.
      published_at: publie ? new Date().toISOString() : null,
    });
    return NextResponse.json({ post });
  } catch (e) {
    const refus = ecritureRefusee(e);
    if (refus) return NextResponse.json({ error: refus.error }, { status: refus.status });
    return panne('createPost', e);
  }
}
