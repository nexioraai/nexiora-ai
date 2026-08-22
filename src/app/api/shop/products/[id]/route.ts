import { NextResponse } from 'next/server';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getProduct, updateProduct, deleteProduct } from '@/lib/shop';

/** Authentifie l'utilisateur et vérifie qu'il possède le site du produit. */
async function authProduct(req: Request, productId: string): Promise<{ ok: true } | { error: NextResponse }> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data: { user }, error: userError } = await supabaseAnon.auth.getUser(token);
  if (userError || !user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const product = await getProduct(productId);
  if (!product) return { error: NextResponse.json({ error: 'Product not found' }, { status: 404 }) };

  // Vérifie que le site du produit appartient à l'utilisateur
  const { data: site, error: siteError } = await supabaseAdmin
    .from('sites')
    .select('id')
    .eq('id', product.site_id)
    .eq('owner_email', user.email)
    .single();
  if (siteError || !site) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 403 }) };

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
