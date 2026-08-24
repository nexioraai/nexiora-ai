import { NextResponse } from 'next/server';
import { updateProduct, deleteProduct } from '@/lib/shop';
import { requireProductOwner } from '@/lib/auth/require-product-owner';

// ETAPE 7 du chantier catalogue canonique -- `authProduct()` vivait ICI, prive
// au module. La politique d'inventaire ajoute une seconde route partant d'un
// identifiant de produit ; la fonction a donc ete extraite telle quelle vers
// `@/lib/auth/require-product-owner` pour que les deux routes appliquent
// EXACTEMENT la meme regle. Aucun changement de comportement : memes controles,
// meme ordre, memes codes de reponse.

type Ctx = { params: Promise<{ id: string }> };

// Audit Mode 3 global (CRIT-2) -- voir shop/products/route.ts pour le
// raisonnement complet. Cette route excluait seulement 3 champs (`delete
// patch.slug/site_id/id`) et laissait passer tout le reste, y compris
// cj_vid/cost_price -- une liste noire de 3 champs sur une table qui en a
// bien plus est fragile par construction (tout NOUVEAU champ sensible
// ajoute plus tard resterait expose par defaut). Allowlist explicite.
// ETAPE 8, VOLET A -- `for_sale` est ADMIS ici, contrairement a
// `track_inventory` et `stock_counted_at` que l'etape 6 en a exclus. La
// difference n'est pas de degre, elle est de nature : rouvrir le suivi de
// stock est une AFFIRMATION sur un compteur peut-etre perime, qui exige une
// preuve (un horodatage de comptage qui avance) et donc un acte dedie.
// Declarer un produit vendable ou non n'affirme rien sur un etat anterieur :
// la valeur ne se perime jamais, il n'existe aucune condition sous laquelle
// elle deviendrait fausse d'elle-meme. Un PATCH generique est donc la forme
// exacte du besoin, et lui inventer une route dediee serait de la ceremonie.
const ALLOWED_PRODUCT_FIELDS = ['name', 'description', 'price', 'currency', 'images', 'stock', 'published', 'position', 'for_sale'] as const;

/** PATCH /api/shop/products/[id] → met à jour un produit. */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const auth = await requireProductOwner(req, id);
    if ('error' in auth) return auth.error;

    const body = await req.json();
    const patch: Record<string, unknown> = {};
    for (const field of ALLOWED_PRODUCT_FIELDS) {
      if (field in body) patch[field] = body[field];
    }

    const product = await updateProduct(id, patch);
    return NextResponse.json({ product });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** DELETE /api/shop/products/[id] → supprime un produit. */
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const auth = await requireProductOwner(req, id);
    if ('error' in auth) return auth.error;

    await deleteProduct(id);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
