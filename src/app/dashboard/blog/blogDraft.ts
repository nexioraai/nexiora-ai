// ============================================================
// LOT BLOG 9 -- LOGIQUE PURE DE L'EDITEUR D'ARTICLES.
//
// EXTRAITE DE LA PAGE, comme `productDraft.ts` l'est de `ProductManager` :
// une page 'use client' de plusieurs centaines de lignes n'est pas testable
// utilement, mais les decisions qu'elle prend le sont. Tout ce qui decide --
// ce qu'on envoie, ce qu'on refuse, ce qu'on affiche d'une erreur -- vit ici.
//
// AUCUN `site_id` NE PEUT SORTIR D'ICI. Le navigateur nomme le site par son
// SLUG (`site`), que le serveur resout et verifie ; il n'a jamais connaissance
// d'un identifiant technique de site, et n'en fabrique aucun. C'est
// l'invariant central du chantier, vu du cote client.
// ============================================================

export type ArticleBrouillon = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
};

export type ArticleServeur = ArticleBrouillon & {
  id: string;
  cover_image: string | null;
  published: boolean;
  published_at: string | null;
  updated_at: string | null;
};

export const BROUILLON_VIDE: ArticleBrouillon = { title: '', slug: '', excerpt: '', content: '' };

/** Reprend un article du serveur dans le formulaire, sans perdre les nuls. */
export function versBrouillon(a: ArticleServeur): ArticleBrouillon {
  return {
    title: a.title ?? '',
    slug: a.slug ?? '',
    excerpt: a.excerpt ?? '',
    content: a.content ?? '',
  };
}

/**
 * Corps envoye a `POST /api/blog/posts`.
 *
 * `site` porte le SLUG DU SITE ; `slug` celui de l'ARTICLE. Les deux cles
 * coexistent volontairement -- c'est le contrat de la route, etabli au lot 3
 * precisement parce qu'un article possede son propre slug.
 *
 * `slug` et `excerpt` ne sont transmis que s'ils sont renseignes : le serveur
 * derive alors le lien du titre, plutot que de recevoir une chaine vide.
 */
export function corpsCreation(site: string, b: ArticleBrouillon): Record<string, unknown> {
  const corps: Record<string, unknown> = { site, title: b.title.trim(), content: b.content };
  if (b.slug.trim()) corps.slug = b.slug.trim();
  if (b.excerpt.trim()) corps.excerpt = b.excerpt.trim();
  return corps;
}

/**
 * Corps envoye a `PATCH /api/blog/posts/[id]`.
 *
 * NE TRANSMET QUE CE QUI A CHANGE. Un PATCH qui renvoie tout le formulaire
 * reecrirait le `slug` a chaque enregistrement -- donc casserait l'URL d'un
 * article publie au premier changement de titre, sans que personne ne l'ait
 * demande.
 */
export function corpsModification(
  origine: ArticleServeur,
  b: ArticleBrouillon
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (b.title.trim() !== (origine.title ?? '')) patch.title = b.title.trim();
  if (b.slug.trim() && b.slug.trim() !== (origine.slug ?? '')) patch.slug = b.slug.trim();
  if (b.excerpt !== (origine.excerpt ?? '')) patch.excerpt = b.excerpt;
  if (b.content !== (origine.content ?? '')) patch.content = b.content;
  return patch;
}

/** Un titre non vide suffit a creer : le serveur derive le reste. */
export function peutEnregistrer(b: ArticleBrouillon): boolean {
  return b.title.trim().length > 0;
}

/** Publier exige un titre ET un corps -- une page vide ne parait pas. */
export function peutPublier(b: ArticleBrouillon): boolean {
  return peutEnregistrer(b) && b.content.trim().length > 0;
}

/**
 * Traduit une reponse d'erreur en cle de message.
 *
 * LE 404 EST DELIBEREMENT AMBIGU cote serveur -- il couvre aussi bien un
 * article inexistant qu'un article d'un autre locataire (anti-enumeration).
 * L'interface ne cherche donc pas a le desambiguiser : elle dit « introuvable »
 * et recharge la liste, ce qui est la seule chose vraie qu'elle puisse dire.
 */
export type CleErreur =
  | 'blog.err.auth'
  | 'blog.err.introuvable'
  | 'blog.err.slugPris'
  | 'blog.err.invalide'
  | 'blog.err.trop'
  | 'blog.err.indispo'
  | 'blog.err.generique';

export function cleErreur(statut: number): CleErreur {
  if (statut === 401) return 'blog.err.auth';
  if (statut === 403) return 'blog.err.auth';
  if (statut === 404) return 'blog.err.introuvable';
  if (statut === 409) return 'blog.err.slugPris';
  if (statut === 400) return 'blog.err.invalide';
  if (statut === 429) return 'blog.err.trop';
  if (statut === 502 || statut === 503) return 'blog.err.indispo';
  return 'blog.err.generique';
}

/** Bornes du televersement, alignees sur la route ET sur le bucket reel. */
export const COVER_TAILLE_MAX = 5 * 1024 * 1024;
export const COVER_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

/** Refuse localement ce que le serveur refuserait : evite un aller-retour
 *  et une consommation de jeton pour rien. La garde SERVEUR reste l'autorite. */
export function refusCouverture(f: { size: number; type: string }): CleErreur | null {
  if (f.size > COVER_TAILLE_MAX) return 'blog.err.invalide';
  if (!COVER_MIME.includes(f.type)) return 'blog.err.invalide';
  return null;
}
