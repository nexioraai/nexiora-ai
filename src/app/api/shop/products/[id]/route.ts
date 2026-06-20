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

/** PATCH /api/shop/products/[id] → met à jour un produit. */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const auth = await authProduct(req, id);
    if ('error' in auth) return auth.error;

    const patch = await req.json();
    delete patch.slug;
    delete patch.site_id;
    delete patch.id;

    const product = await updateProduct(id, patch);
    return NextResponse.json({ product });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
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
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
