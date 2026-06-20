import { NextResponse } from 'next/server';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAllProducts, createProduct } from '@/lib/shop';

/** Authentifie l'utilisateur et vérifie qu'il possède le site. Retourne le site_id. */
async function authSite(req: Request, slug: string): Promise<{ siteId: string } | { error: NextResponse }> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data: { user }, error: userError } = await supabaseAnon.auth.getUser(token);
  if (userError || !user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data: site, error: siteError } = await supabaseAdmin
    .from('sites')
    .select('id')
    .eq('slug', slug)
    .eq('owner_email', user.email)
    .single();
  if (siteError || !site) return { error: NextResponse.json({ error: 'Site not found or unauthorized' }, { status: 404 }) };

  return { siteId: site.id };
}

/** GET /api/shop/products?slug=... → liste tous les produits du site (gestion admin). */
export async function GET(req: Request) {
  try {
    const slug = new URL(req.url).searchParams.get('slug');
    if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });

    const auth = await authSite(req, slug);
    if ('error' in auth) return auth.error;

    const products = await getAllProducts(auth.siteId);
    return NextResponse.json({ products });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** POST /api/shop/products → crée un produit. Body: { slug, name, price, ... } */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { slug, ...productData } = body;
    if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
    if (!productData.name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

    const auth = await authSite(req, slug);
    if ('error' in auth) return auth.error;

    const product = await createProduct({ site_id: auth.siteId, ...productData });
    return NextResponse.json({ product });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
