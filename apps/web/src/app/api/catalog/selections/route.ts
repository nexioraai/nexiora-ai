import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSiteOwner } from '@/lib/auth/require-site-owner';
import { suppliersForDropshipType } from '@/lib/dropship/suppliers';
import { usesCatalogSelections } from '@/lib/dropship/catalogAdmission';

export const maxDuration = 10;

/**
 * GET /api/catalog/selections?slug=my-shop
 * Retourne les produits sélectionnés pour un site avec les détails catalog_products.
 *
 * DELETE /api/catalog/selections?slug=my-shop&id=<selection_id>
 * Supprime une sélection.
 *
 * PATCH /api/catalog/selections
 * Body: { slug, id, sell_price?, merchant_approved?, custom_name?, custom_description? }
 * Met à jour une sélection.
 */
// LOT 2 -- LES QUATRE VERBES INTERROGENT LE MECANISME, PLUS SEULEMENT LE MODE.
//
// Cette route EST le mecanisme `site_catalog_selections` : elle le lit, l'ecrit,
// le modifie et le supprime. `pod_brand` y etait admis -- son POST creait meme
// une selection `merchant_approved: true` du premier coup, donc publiable au
// sitemap et achetable, tout en restant invisible sur sa propre vitrine, qui
// refuse de charger les selections d'un pod_brand. C'etait la chaine complete
// de DEBT-049, et elle se ferme ici.
//
// Le POST conserve EN PLUS son controle d'eligibilite fournisseur
// (`suppliersForDropshipType`) : les deux questions restent distinctes --
// « ce site utilise-t-il le mecanisme ? » et « ce produit vient-il du bon
// fournisseur ? ».
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug requis' }, { status: 400 });

  const auth = await requireSiteOwner(req, slug, 'id, mode, dropship_type');
  if (!auth.ok) return auth.response;
  const site = auth.site;

  // ============================================================
  // CHANTIER 6 (MODE 1) -- L'ADMISSION AU CATALOGUE PASSE PAR LA PRIMITIVE.
  //
  // AUCUN DES QUATRE VERBES NE POSAIT LA QUESTION DU MODE. Ce qui en tenait
  // lieu differait d'un verbe a l'autre, et aucun n'etait une regle :
  //   * GET / PATCH / DELETE : rien du tout. Un site Mode 1 obtenait
  //     `{selections: []}` -- « sur » uniquement parce que la table etait
  //     vide pour lui.
  //   * POST : `suppliersForDropshipType(dropship_type)`. C'est la question
  //     du SOUS-MODE (« quels fournisseurs »), jamais celle du MODE (« ce
  //     site a-t-il un catalogue »). Mesure : un Mode 1 a `dropship_type`
  //     null, et ce repli rend `RESELLER_SUPPLIERS` -- donc CJ. Un produit CJ
  //     passait le controle et entrait dans `site_catalog_selections` d'une
  //     vitrine. La ligne creee y rendait ensuite les trois autres verbes
  //     operants : la protection « par absence de donnee » se detruisait
  //     elle-meme au premier appel.
  //
  // La primitive tranche AVANT le sous-mode : « ce site a-t-il un catalogue »
  // precede « lequel ». Meme contrat de reponse que `curate` et `enhance`.
  // ============================================================
  if (!usesCatalogSelections(auth.site.mode, (auth.site as { dropship_type?: unknown }).dropship_type)) {
    return NextResponse.json({ error: 'Site non-dropshipping' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('site_catalog_selections')
    .select(`
      id,
      sell_price,
      custom_name,
      custom_description,
      ai_suggested,
      merchant_approved,
      ai_reason,
      sort_order,
      catalog_product_id,
      catalog_products (
        id,
        supplier_id,
        supplier_product_id,
        name,
        description,
        category,
        price,
        currency,
        images,
        shipping_days_min,
        shipping_days_max,
        warehouse_country,
        in_stock
      )
    `)
    .eq('site_id', site.id)
    .order('sort_order', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ selections: data || [] });
}

export async function PATCH(req: NextRequest) {
  try {
    const { slug, id, ...updates } = await req.json();
    if (!slug || !id) return NextResponse.json({ error: 'slug et id requis' }, { status: 400 });

    const auth = await requireSiteOwner(req, slug, 'id, mode, dropship_type');
    if (!auth.ok) return auth.response;

    // CHANTIER 6 -- meme garde, meme primitive, meme contrat de reponse. La
    // question du mode precede toujours celle du sous-mode.
    if (!usesCatalogSelections(auth.site.mode, (auth.site as { dropship_type?: unknown }).dropship_type)) {
      return NextResponse.json({ error: 'Site non-dropshipping' }, { status: 400 });
    }

    const allowed = ['sell_price', 'merchant_approved', 'custom_name', 'custom_description', 'sort_order'];
    const clean: Record<string, any> = {};
    for (const k of allowed) {
      if (k in updates) clean[k] = updates[k];
    }

    if (Object.keys(clean).length === 0) {
      return NextResponse.json({ error: 'Rien à mettre à jour' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('site_catalog_selections')
      .update(clean)
      .eq('id', id)
      .eq('site_id', auth.site.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ selection: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  const id = req.nextUrl.searchParams.get('id');
  if (!slug || !id) return NextResponse.json({ error: 'slug et id requis' }, { status: 400 });

  const auth = await requireSiteOwner(req, slug, 'id, mode, dropship_type');
  if (!auth.ok) return auth.response;

  // CHANTIER 6 -- meme garde, meme primitive, meme contrat de reponse. La
  // question du mode precede toujours celle du sous-mode.
  if (!usesCatalogSelections(auth.site.mode, (auth.site as { dropship_type?: unknown }).dropship_type)) {
    return NextResponse.json({ error: 'Site non-dropshipping' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('site_catalog_selections')
    .delete()
    .eq('id', id)
    .eq('site_id', auth.site.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

/**
 * POST /api/catalog/selections
 * Body: { slug, catalogProductId }
 * Ajout manuel d'un produit du catalogue a la boutique du marchand.
 * Approuve d'emblee : le marchand l'a choisi lui-meme.
 * Le prix reste calcule live depuis la marge du site (sell_price null).
 */
export async function POST(req: NextRequest) {
  try {
    const { slug, catalogProductId } = await req.json();
    if (!slug || !catalogProductId) {
      return NextResponse.json({ error: 'slug et catalogProductId requis' }, { status: 400 });
    }

    const auth = await requireSiteOwner(req, slug, 'id, mode, dropship_type');
    if (!auth.ok) return auth.response;

    // CHANTIER 6 -- meme garde, meme primitive, meme contrat de reponse. La
    // question du mode precede toujours celle du sous-mode.
    if (!usesCatalogSelections(auth.site.mode, (auth.site as { dropship_type?: unknown }).dropship_type)) {
      return NextResponse.json({ error: 'Site non-dropshipping' }, { status: 400 });
    }

    const { data: product } = await supabaseAdmin
      .from('catalog_products')
      .select('id, supplier_id')
      .eq('id', catalogProductId)
      .maybeSingle();

    if (!product) {
      return NextResponse.json({ error: 'Produit introuvable au catalogue' }, { status: 404 });
    }

    // Audit Mode 3 global (N2, meme cause racine que N1) -- cette route
    // n'importait pas suppliersForDropshipType (source unique deja utilisee
    // par curate/search), permettant a un marchand reseller d'ajouter
    // manuellement un produit Printful/Gelato a sa selection -- visible
    // ensuite dans la recherche "curated" et achetable en contradiction avec
    // l'invariant du sous-mode.
    const eligibleSuppliers = suppliersForDropshipType((auth.site as any).dropship_type);
    if (!product.supplier_id || !eligibleSuppliers.includes(product.supplier_id)) {
      return NextResponse.json({ error: 'Ce produit ne correspond pas au sous-mode de cette boutique' }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin
      .from('site_catalog_selections')
      .upsert(
        {
          site_id: auth.site.id,
          catalog_product_id: catalogProductId,
          ai_suggested: false,
          merchant_approved: true,
          sort_order: 0,
        },
        { onConflict: 'site_id,catalog_product_id' }
      )
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ selection: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
