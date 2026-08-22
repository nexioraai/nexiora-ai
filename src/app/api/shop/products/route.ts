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
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// Audit Mode 3 global (CRIT-2) -- `const { slug, ...productData } = body`
// spreadait tout le JSON client (type `any`, aucun excess-property-check
// TypeScript possible sur un spread de `any`) directement dans
// createProduct(). shop_products.cj_vid (declenche une VRAIE commande CJ
// reelle, cj/fulfill.ts:325-334) et cost_price (source du garde-fou
// financier Mode 3, checkout/route.ts) n'ont AUCUN chemin d'ecriture
// legitime dans toute l'application (grep exhaustif : aucune UI, aucune
// route de sync ne les ecrit jamais) -- seule cette route les exposait,
// sans le vouloir. Allowlist explicite desormais, miroir du patron deja
// utilise par catalog/selections PATCH (`const allowed = [...]`).
const ALLOWED_PRODUCT_FIELDS = ['name', 'description', 'price', 'currency', 'images', 'stock', 'published', 'position'] as const;

/** POST /api/shop/products → crée un produit. Body: { slug, name, price, ... } */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
    if (!body.name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

    const auth = await authSite(req, body.slug);
    if ('error' in auth) return auth.error;

    const productData: Record<string, unknown> = {};
    for (const field of ALLOWED_PRODUCT_FIELDS) {
      if (field in body) productData[field] = body[field];
    }

    const product = await createProduct({ site_id: auth.siteId, ...productData } as Parameters<typeof createProduct>[0]);
    return NextResponse.json({ product });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
