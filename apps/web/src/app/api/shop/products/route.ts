import { NextResponse } from 'next/server';
import { canTransact } from '@/lib/commerce-admission/canTransact';
import { requireSiteOwner } from '@/lib/auth/require-site-owner';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAllProducts, createProduct } from '@/lib/shop';

/** Authentifie l'utilisateur et vérifie qu'il possède le site. Retourne le site_id. */
/** GET /api/shop/products?slug=... → liste tous les produits du site (gestion admin). */
export async function GET(req: Request) {
  try {
    const slug = new URL(req.url).searchParams.get('slug');
    if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });

    // M2-02 -- la verification de propriete etait reimplementee ici (copie
    // verbatim de la meme fonction dans 5 routes, plus 2 controles inline).
    // Toutes portaient la MEME regle, mais sur `owner_email` SEUL, la ou la
    // primitive canonique priorise `owner_id` -- identite stable, insensible
    // a un changement d'adresse. Delegation : une seule regle, un seul
    // endroit, aucune divergence possible.
    const auth = await requireSiteOwner(req, slug, 'id');
    if (!auth.ok) return auth.response;

    const products = await getAllProducts((auth.site as any).id);
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

/** POST /api/shop/products → crée un produit. Body: { slug, name, price, ... } */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
    if (!body.name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

    // M2-02 -- la verification de propriete etait reimplementee ici (copie
    // verbatim de la meme fonction dans 5 routes, plus 2 controles inline).
    // Toutes portaient la MEME regle, mais sur `owner_email` SEUL, la ou la
    // primitive canonique priorise `owner_id` -- identite stable, insensible
    // a un changement d'adresse. Delegation : une seule regle, un seul
    // endroit, aucune divergence possible.
    // M1-4 — ADMISSION. La propriete dit QUI ; le mode dit SI. Les deux sont
    // requis, aucun ne remplace l'autre : un proprietaire legitime de vitrine
    // n'a pas plus le droit de creer un produit vendable qu'un inconnu.
    const auth = await requireSiteOwner(req, body.slug, 'id, mode');
    if (!auth.ok) return auth.response;

    const productData: Record<string, unknown> = {};
    for (const field of ALLOWED_PRODUCT_FIELDS) {
      if (field in body) productData[field] = body[field];
    }

    if (!canTransact((auth.site as { mode?: unknown }).mode)) {
      return NextResponse.json(
        { error: 'Ce site est une vitrine : il ne peut pas exercer d’activité commerciale.' },
        { status: 403 }
      );
    }

    const product = await createProduct({ site_id: (auth.site as any).id, ...productData } as Parameters<typeof createProduct>[0]);
    return NextResponse.json({ product });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
