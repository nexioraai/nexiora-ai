import { NextResponse } from 'next/server';
import { getProduct, type ShopProduct } from '@/lib/shop';
import { canTransact } from '@/lib/commerce-admission/canTransact';
import { requireSiteOwnerById } from './require-site-owner';

/**
 * M2-02 -- ce controle etait reimplemente dans `shop/products/[id]/route.ts`
 * (`owner_email` seul), comme dans 5 autres routes. Il reste specifique sur UN
 * point, qui justifie son existence : il part d'un identifiant de PRODUIT, pas
 * d'un slug. Il resout donc `product.site_id`, puis delegue la regle de
 * propriete a la primitive canonique -- qui priorise `owner_id`, identite
 * stable.
 *
 * ETAPE 7 du chantier catalogue canonique -- EXTRAIT ICI, sans changement de
 * comportement. La politique d'inventaire ajoute une SECONDE route partant
 * d'un identifiant de produit (`[id]/inventory`). Laisser cette fonction
 * privee au module `[id]/route.ts` aurait impose de la reecrire : c'est
 * exactement la divergence entre implementations que M2-02 avait servi a
 * defaire. Un seul point de decision -- propriete ET admission -- pour les
 * QUATRE ecritures produit (PATCH, DELETE, POST inventory, DELETE inventory).
 *
 * FAIL-CLOSED par construction : tout chemin qui n'aboutit pas a `ok: true`
 * renvoie une reponse d'erreur deja formee, jamais un booleen a interpreter.
 */
export type ProductOwnerCheck =
  | { ok: true; product: ShopProduct }
  | { error: NextResponse };

/**
 * DETTE 6d -- LA FORME DE L'IDENTIFIANT, VERIFIEE AVANT TOUTE REQUETE.
 *
 * `shop_products.id` est de type `uuid`. Un segment d'URL qui n'en est pas un
 * faisait echouer PostgREST (« invalid input syntax for type uuid »),
 * `getProduct` levait, et le `catch` de chaque route rendait :
 *
 *     500  {"error":"getProduct: invalid input syntax for type uuid: \"xyz\""}
 *
 * DEUX DEFAUTS DANS UNE SEULE REPONSE :
 *   1. une entree malformee est une erreur du CLIENT, jamais du serveur. Un
 *      500 la fait entrer dans la supervision comme un incident, et un simple
 *      balayage d'URL suffisait a en fabriquer autant qu'on voulait ;
 *   2. le message brut livrait le moteur (Postgres), le type de la colonne et
 *      le nom de la fonction interne. Aucune autre route de ce depot ne rend
 *      un message de base non controle.
 *
 * POURQUOI 404 ET LE MEME MESSAGE QUE « INTROUVABLE ». Un identifiant qui
 * n'est pas un uuid ne designe aucun produit -- exactement comme un uuid bien
 * forme qui n'existe pas. Les distinguer n'apprendrait rien a un appelant
 * legitime et confirmerait a un rodeur que la forme testee est la bonne. Le
 * repli est d'ailleurs celui que les trois routes voisines atteignent deja :
 * `produits/[id]/fetchProduct.ts`, `shipping-estimate` et `shop/orders`
 * rendent toutes 404 sur un identifiant malforme.
 *
 * FORME CANONIQUE UNIQUEMENT (8-4-4-4-12, casse indifferente). PostgreSQL
 * accepte aussi des variantes -- sans tirets, entre accolades. Elles sont
 * desormais refusees, et c'est un RETRECISSEMENT DELIBERE : tout identifiant
 * de ce systeme est produit par `gen_random_uuid()` et rendu par PostgREST
 * sous cette seule forme, aucun client n'en fabrique. Le signaler ici plutot
 * que de le decouvrir plus tard.
 *
 * PLACE : avant `getProduct`, donc avant toute requete, toute decision de
 * propriete et toute ecriture. Ce point de passage etant unique, les QUATRE
 * ecritures produit (PATCH, DELETE, POST inventory, DELETE inventory) sont
 * couvertes d'un seul controle.
 */
const UUID_CANONIQUE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function requireProductOwner(
  req: Request,
  productId: string
): Promise<ProductOwnerCheck> {
  const introuvable = () =>
    ({ error: NextResponse.json({ error: 'Product not found' }, { status: 404 }) });

  if (typeof productId !== 'string' || !UUID_CANONIQUE.test(productId)) {
    return introuvable();
  }

  const product = await getProduct(productId);
  if (!product) return introuvable();

  const auth = await requireSiteOwnerById(req, product.site_id, 'id, mode');
  if (!auth.ok) return { error: auth.response };

  // M1-4 — ADMISSION, posee ICI plutot que dans chaque verbe separement :
  // un seul point de decision pour toutes les ecritures produit.
  if (!canTransact((auth.site as { mode?: unknown }).mode)) {
    return {
      error: NextResponse.json(
        { error: 'Ce site est une vitrine : il ne peut pas exercer d’activité commerciale.' },
        { status: 403 }
      ),
    };
  }

  return { ok: true, product };
}
