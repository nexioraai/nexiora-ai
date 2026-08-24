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

export async function requireProductOwner(
  req: Request,
  productId: string
): Promise<ProductOwnerCheck> {
  const product = await getProduct(productId);
  if (!product) return { error: NextResponse.json({ error: 'Product not found' }, { status: 404 }) };

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
