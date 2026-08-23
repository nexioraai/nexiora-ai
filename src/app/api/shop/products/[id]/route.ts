import { NextResponse } from 'next/server';
import { getProduct, updateProduct, deleteProduct } from '@/lib/shop';
import { requireSiteOwnerById } from '@/lib/auth/require-site-owner';

/**
 * M2-02 -- ce controle etait reimplemente ici (`owner_email` seul), comme dans
 * 5 autres routes. Il reste specifique sur UN point, qui justifie son
 * existence : cette route part d'un identifiant de PRODUIT, pas d'un slug.
 * Elle resout donc `product.site_id`, puis delegue la regle de propriete a la
 * primitive canonique -- qui priorise `owner_id`, identite stable.
 */
async function authProduct(req: Request, productId: string): Promise<{ ok: true } | { error: NextResponse }> {
  const product = await getProduct(productId);
  if (!product) return { error: NextResponse.json({ error: 'Product not found' }, { status: 404 }) };

  const auth = await requireSiteOwnerById(req, product.site_id);
  if (!auth.ok) return { error: auth.response };

  return { ok: true };
}

type Ctx = { params: Promise<{ id: string }> };

// Audit Mode 3 global (CRIT-2) -- voir shop/products/route.ts pour le
// raisonnement complet. Cette route excluait seulement 3 champs (`delete
// patch.slug/site_id/id`) et laissait passer tout le reste, y compris
// cj_vid/cost_price -- une liste noire de 3 champs sur une table qui en a
// bien plus est fragile par construction (tout NOUVEAU champ sensible
// ajoute plus tard resterait expose par defaut). Allowlist explicite.
const ALLOWED_PRODUCT_FIELDS = ['name', 'description', 'price', 'currency', 'images', 'stock', 'published', 'position'] as const;

/** PATCH /api/shop/products/[id] → met à jour un produit. */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const auth = await authProduct(req, id);
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
    const auth = await authProduct(req, id);
    if ('error' in auth) return auth.error;

    await deleteProduct(id);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
