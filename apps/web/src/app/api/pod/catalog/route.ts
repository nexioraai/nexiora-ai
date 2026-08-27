import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSiteOwner } from '@/lib/auth/require-site-owner';

// LOT K (Mode 3 global, fuites d'info) -- cause racine : aucune
// authentification, `price` renvoye est catalog_products.price, le COUT
// fournisseur reel (confirme via checkout/route.ts : `cost = Number(cp?.price)`),
// jamais un prix de vente. N'importe qui pouvait recuperer le cout Nexiora
// pour l'integralite du catalogue POD (tous supplier_parent_id confondus)
// d'une simple requete GET sans jeton. Seul appelant reel : edit/[slug]/page.tsx
// (l'editeur marchand, deja proprietaire verifie pour toutes les autres
// actions de cette page) -- jamais destine a un visiteur public, contrairement
// a catalog/search (storefront) qui affiche un prix DEJA marque. Meme garde
// que les routes catalog/curate et catalog/enhance (requireSiteOwner).
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const supplier = searchParams.get('supplier') || 'printful';
    const slug = searchParams.get('slug');
    if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
    const auth = await requireSiteOwner(req, slug, 'id, dropship_type');
    if (!auth.ok) return auth.response;

    // ============================================================
    // LOT 2 -- LA MEME GARDE QUE SON JUMEAU, SUR LA MEME MECANIQUE.
    //
    // Cette route et `pod/generate-mockups` forment les DEUX surfaces du
    // catalogue de SUPPORTS : choisir un blanc, puis y imprimer un design.
    // `generate-mockups` refuse deja tout site non `pod_brand` en 403 (garde
    // N13, verifiee par test). Celle-ci n'avait que la propriete : tout
    // proprietaire -- Mode 1, Mode 2, `reseller`, `pod_custom` -- pouvait
    // lister le catalogue Printful/Gelato complet, cout fournisseur compris.
    //
    // CE N'EST PAS UNE REGLE NOUVELLE : c'est celle de son jumeau, appliquee
    // a l'autre moitie du meme mecanisme. Son unique appelant reel est le
    // bloc « Mes Designs POD » de l'editeur, rendu sous
    // `dropship_type === 'pod_brand'`.
    //
    // POURQUOI PAS `usesCatalogSelections` : c'est l'AUTRE mecanisme. Les
    // deux chaines Mode 3 sont disjointes -- `site_catalog_selections` pour
    // `reseller`/`pod_custom`, `pod_designs` + supports pour `pod_brand`.
    // Les confondre etait la cause racine de tout le LOT 2.
    // ============================================================
    if ((auth.site as { dropship_type?: unknown }).dropship_type !== 'pod_brand') {
      return NextResponse.json({ error: 'Cette action est réservée aux boutiques POD Brand.' }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from('catalog_products')
      .select('supplier_product_id, supplier_parent_id, name, price, currency, images')
      .eq('supplier_id', supplier)
      .eq('in_stock', true)
      .not('supplier_parent_id', 'is', null);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Group by parent product, collect variants
    const grouped: Record<string, any> = {};
    for (const row of (data || [])) {
      const pid = row.supplier_parent_id;
      const imgs = Array.isArray(row.images) ? row.images : [];
      const variantLabel = (row.name || '').replace(/^.+\u2014\s*/, '') || 'Default';
      const variant = {
        variant_id: row.supplier_product_id,
        label: variantLabel,
        price: row.price,
        currency: row.currency || 'USD',
        image: imgs[0] || null,
      };
      if (!grouped[pid]) {
        grouped[pid] = {
          product_id: pid,
          name: (row.name || '').replace(/\s*\u2014\s*.+$/, ''),
          price: row.price,
          currency: row.currency || 'USD',
          image: imgs[0] || null,
          variants: [variant],
        };
      } else {
        grouped[pid].variants.push(variant);
        if (row.price < grouped[pid].price) {
          grouped[pid].price = row.price;
          grouped[pid].currency = row.currency || 'USD';
          if (imgs[0]) grouped[pid].image = imgs[0];
        }
      }
    }

    const products = Object.values(grouped).sort((a: any, b: any) =>
      a.name.localeCompare(b.name)
    );

    return NextResponse.json({ products, total: products.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
