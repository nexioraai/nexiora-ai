import { NextResponse } from 'next/server';
import { requireArticleOwner } from '@/lib/auth/require-article-owner';
import {
  updatePost,
  deletePost,
  filtrerChamps,
  slugifyArticleTitle,
  ecritureRefusee,
} from '@/lib/blog';

// ============================================================
// LOT BLOG 3 -- SURFACE PROPRIETAIRE, ENTREE PAR L'ARTICLE.
//
// Patron `shop/products/[id]/route.ts` : les deux verbes passent par UN SEUL
// point de decision, `requireArticleOwner`. La propriete n'est donc pas
// verifiee deux fois de deux facons -- c'est la divergence entre copies qui
// etait le defaut M2-02, jamais la regle.
//
// LE `site_id` UTILISE POUR ECRIRE EST CELUI DE L'ARTICLE VERIFIE
// (`auth.article.site_id`), lu en base par la primitive. Le corps de la
// requete n'y a aucun acces : `filtrerChamps` ne le retient pas.
//
// 404 UNIFORME : un article appartenant a un autre locataire est
// indiscernable d'un article inexistant. La conversion est faite par la
// primitive -- voir le bloc anti-enumeration qui l'explique.
// ============================================================

type Ctx = { params: Promise<{ id: string }> };

function panne(contexte: string, e: unknown) {
  console.error(`[blog/posts/id] ${contexte}:`, e);
  return NextResponse.json({ error: 'Service momentanément indisponible.' }, { status: 503 });
}

const INTROUVABLE = () =>
  NextResponse.json({ error: 'Article not found' }, { status: 404 });

/** PATCH /api/blog/posts/[id] -> modifie ou (de)publie un article. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;

  const auth = await requireArticleOwner(req, id);
  if ('error' in auth) return auth.error;
  const article = auth.article;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const patch: Record<string, unknown> = { ...filtrerChamps(body) };

  if ('title' in patch) {
    const titre = typeof patch.title === 'string' ? patch.title.trim() : '';
    if (!titre) return NextResponse.json({ error: 'Missing title' }, { status: 400 });
    patch.title = titre;
  }

  if ('slug' in patch) {
    const brut = typeof patch.slug === 'string' && patch.slug.trim() ? patch.slug : article.title;
    patch.slug = slugifyArticleTitle(brut);
  }

  if ('published' in patch) {
    if (typeof patch.published !== 'boolean') {
      return NextResponse.json({ error: '`published` doit être un booléen.' }, { status: 400 });
    }
    // `published_at` EST DERIVE, jamais recu.
    //
    // A LA PUBLICATION : pose s'il n'existe pas encore. Il ne s'agit pas
    // seulement de confort -- la contrainte `site_blog_posts_published_at_chk`
    // REFUSE en base l'etat « publie sans date ». Sans cette ligne, publier
    // rendrait une erreur de contrainte.
    //
    // A LA DEPUBLICATION : la date est CONSERVEE. Republier ne doit pas
    // rajeunir un article -- `datePublished` decrit sa premiere parution, et
    // la fraicheur est portee par `updated_at`, que le declencheur avance.
    if (patch.published === true && !article.published_at) {
      patch.published_at = new Date().toISOString();
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  try {
    const post = await updatePost(id, article.site_id, patch);
    // `null` = aucune ligne touchee. Impossible en pratique (la propriete
    // vient d'etre etablie sur CET article), mais on ne rend jamais un succes
    // sur une ecriture qui n'a rien ecrit.
    if (!post) return INTROUVABLE();
    return NextResponse.json({ post });
  } catch (e) {
    const refus = ecritureRefusee(e);
    if (refus) return NextResponse.json({ error: refus.error }, { status: refus.status });
    return panne('updatePost', e);
  }
}

/** DELETE /api/blog/posts/[id] -> supprime un article. */
export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;

  const auth = await requireArticleOwner(req, id);
  if ('error' in auth) return auth.error;

  try {
    await deletePost(id, auth.article.site_id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return panne('deletePost', e);
  }
}
