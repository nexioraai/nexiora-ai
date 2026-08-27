import { NextResponse } from 'next/server';
import { getArticle, type SiteBlogPost } from '@/lib/blog';
import { requireSiteOwnerById } from './require-site-owner';

/**
 * ============================================================
 * LOT BLOG 1 -- PROPRIETE D'UN ARTICLE DE BLOG DE SITE CLIENT.
 *
 * Calquee sur `requireProductOwner` : c'est le MEME patron -- partir d'un
 * identifiant d'ENFANT, resoudre son `site_id` EN BASE, puis deleguer la
 * regle de propriete a la primitive canonique. Aucune architecture nouvelle,
 * et surtout aucune reimplementation de la regle : c'est la divergence entre
 * implementations qui etait le defaut de M2-02, jamais la regle elle-meme.
 *
 * LA CHAINE, DANS CET ORDRE, ET L'ORDRE EST LA GARANTIE :
 *   uuid canonique -> article -> article.site_id -> proprietaire -> autorise
 *
 * `site_id` n'est JAMAIS fourni par l'appelant. Il est lu sur la ligne
 * d'article, elle-meme designee par un identifiant dont la FORME a ete
 * validee avant toute requete. Aucun corps JSON, aucun parametre d'URL,
 * aucun en-tete n'entre dans cette chaine -- il n'y a rien a falsifier.
 * ============================================================
 */

/**
 * ============================================================
 * PAS DE `canTransact` ICI -- C'EST UNE DECISION, PAS UN OUBLI.
 *
 * `requireProductOwner` porte une garde d'admission commerciale, et c'est
 * juste POUR UN PRODUIT : vendre est un acte commercial, qu'une vitrine
 * (Mode 1) n'exerce pas.
 *
 * Un ARTICLE n'est pas de cette nature. Ecrire du contenu editorial est une
 * capacite COMMUNE AUX TROIS MODES -- c'est meme la definition du modele
 * concentrique publie par Deribfy : « Toute boutique en ligne possede tout
 * ce qu'un site vitrine possede. » Refuser un article a un site vitrine
 * inventerait une limitation que le produit ne porte pas.
 *
 * La difference n'est pas de degre, elle est de nature -- exactement le
 * raisonnement deja tenu a l'etape 8 du chantier catalogue entre `for_sale`
 * et `track_inventory`.
 *
 * NE PAS AJOUTER `canTransact` DANS CE FICHIER. Un cliquet structurel
 * (`__tests__/require-article-owner.test.ts`) echoue si une passe ulterieure
 * l'introduit, y compris indirectement par un import de
 * `@/lib/commerce-admission` ou par la simple projection de la colonne
 * `mode` -- projeter `mode` n'aurait aucun autre usage que de le tester.
 * ============================================================
 */

/**
 * LOT BLOG 3 -- LE TYPE ET L'ACCESSEUR ONT QUITTE CE FICHIER.
 *
 * `SiteBlogPost` et `getArticle` vivent desormais dans `@/lib/blog`, seul
 * module a ecrire le nom de la table `site_blog_posts`. C'est exactement la
 * condition annoncee ici au lot 1 : « le jour ou une deuxieme surface lira un
 * article, l'extraction sera justifiee par un besoin mesure ». Les quatre
 * routes de ce lot sont ces surfaces.
 *
 * Meme relation que `requireProductOwner` <-> `lib/shop.ts` : la primitive
 * porte l'AUTORISATION, le module de donnees porte l'ACCES. Aucun des deux ne
 * fait le travail de l'autre.
 */

/**
 * FAIL-CLOSED par construction : tout chemin qui n'aboutit pas a `ok: true`
 * rend une reponse deja formee, jamais un booleen a interpreter.
 */
export type ArticleOwnerCheck =
  | { ok: true; article: SiteBlogPost }
  | { error: NextResponse };

/**
 * LA FORME DE L'IDENTIFIANT, VERIFIEE AVANT TOUTE REQUETE.
 *
 * Reprise a l'identique de `requireProductOwner` (DETTE 6d), pour la meme
 * raison et avec le meme effet : `site_blog_posts.id` est de type `uuid`, et
 * un segment d'URL qui n'en est pas un faisait, sur les produits, remonter
 * un 500 porteur du moteur, du type de colonne et du nom de fonction
 * interne. Une entree malformee est une erreur du CLIENT, jamais du serveur.
 *
 * FORME CANONIQUE UNIQUEMENT (8-4-4-4-12, casse indifferente). PostgreSQL
 * accepte aussi les variantes sans tirets ou entre accolades : elles sont
 * refusees, retrecissement delibere -- tout identifiant de ce systeme est
 * produit par `gen_random_uuid()` et rendu par PostgREST sous cette seule
 * forme.
 */
const UUID_CANONIQUE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function requireArticleOwner(
  req: Request,
  articleId: string
): Promise<ArticleOwnerCheck> {
  const introuvable = () =>
    ({ error: NextResponse.json({ error: 'Article not found' }, { status: 404 }) });

  // 1. FORME -- avant toute requete, donc avant toute decision de propriete.
  if (typeof articleId !== 'string' || !UUID_CANONIQUE.test(articleId)) {
    return introuvable();
  }

  // 2. RESSOURCE -- c'est elle qui designe son site, jamais l'appelant.
  const article = await getArticle(articleId);
  if (!article) return introuvable();

  // 3. PROPRIETE -- deleguee a la primitive canonique, qui priorise
  //    `owner_id`. `'id'` et NON `'id, mode'` : voir le bloc `canTransact`
  //    ci-dessus. `mode` n'a aucun usage ici, et le projeter serait le
  //    premier pas vers une garde de mode que le blog ne doit pas porter.
  const auth = await requireSiteOwnerById(req, article.site_id, 'id');

  if (!auth.ok) {
    // ============================================================
    // ANTI-ENUMERATION -- DIVERGENCE ASSUMEE AVEC `requireProductOwner`.
    //
    // `requireProductOwner` rend `auth.response` TEL QUEL : un produit
    // appartenant a un autre marchand donne donc 403. Sur une fiche produit
    // c'est sans consequence -- le catalogue est public, l'existence d'un
    // produit n'est pas un secret.
    //
    // UN BROUILLON D'ARTICLE, SI. Rendre 403 confirmerait a un rodeur que
    // l'uuid teste designe un article REEL chez un concurrent, la ou 404 ne
    // dit rien. La difference entre « n'existe pas » et « existe mais n'est
    // pas a vous » est precisement ce qu'un oracle d'enumeration exploite.
    //
    // 401 EST CONSERVE, et c'est deliberé : « vous n'etes pas authentifie »
    // n'apprend rien sur la ressource et reste l'information dont un client
    // legitime a besoin pour se reconnecter. Le masquer casserait le
    // parcours normal sans rien proteger.
    //
    // Tout le reste -- 403 non-proprietaire, 404 site introuvable -- devient
    // la MEME reponse, au caractere pres, que les deux echecs precedents.
    // ============================================================
    return auth.response.status === 401 ? { error: auth.response } : introuvable();
  }

  return { ok: true, article };
}
