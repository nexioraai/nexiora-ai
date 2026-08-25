import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { usesCatalogSelections } from '@/lib/dropship/catalogAdmission';
import { suppliersForDropshipType } from '@/lib/dropship/suppliers';
import { calcSellPrice, sitePricing, resolveDisplayPrice } from '@/lib/pricing';

export const maxDuration = 10;

/**
 * GET /api/catalog/search?q=bracelet&slug=my-shop&sort=price_asc&page=1&country=CA
 * Recherche visiteur : d'abord les produits cures du marchand, puis le catalogue global.
 * 100% Supabase, zero appel API fournisseur.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const q = url.searchParams.get('q')?.trim();
  const slug = url.searchParams.get('slug');
  const supplier = url.searchParams.get('supplier');
  const maxDays = url.searchParams.get('max_days');
  const sort = url.searchParams.get('sort') || 'relevance';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const country = url.searchParams.get('country')?.toUpperCase();
  const pageSize = 24;

  if (!slug) {
    return NextResponse.json({ error: 'slug requis' }, { status: 400 });
  }

  const { data: site } = await supabaseAdmin
    .from('sites')
    .select('id, type, mode, dropship_type, cj_margin_percent, cj_round_mode')
    .eq('slug', slug)
    .single();

  if (!site) {
    return NextResponse.json({ error: 'Site introuvable' }, { status: 404 });
  }

  // ============================================================
  // ETAPE 2 -- CETTE GARDE N'EXISTAIT PAS, ET C'ETAIT UN TROU.
  //
  // Cette route selectionnait `mode` puis ne le lisait JAMAIS : elle s'en
  // remettait entierement a `suppliersForDropshipType(dropship_type)`. Or ce
  // dernier retombe sur `['cj']` quand le sous-type est absent -- « par
  // securite, aucun melange », dit son commentaire, ce qui est juste POUR UN
  // SITE MODE 3. Consequence mesuree : un site Mode 1 ou Mode 2, dont le
  // sous-type est null, obtenait le catalogue CJ complet des lors qu'on
  // connaissait son slug.
  //
  // AUCUN CLIENT LEGITIME N'EST TOUCHE : `CatalogSearch` n'est rendu que
  // lorsque `site.mode === 3` (sites/[slug]/page.tsx). Seuls les appelants
  // directs voient la difference -- et c'est precisement le point.
  //
  // FORME DE REPONSE INCHANGEE : meme objet que le succes, simplement vide.
  // Un 403 aurait appris a un rodeur que le slug existe ; ce silence
  // n'apprend rien de plus qu'une boutique sans resultat.
  // ============================================================
  // LOT 2 -- LA GARDE DESCEND DU MODE AU MECANISME.
  //
  // Elle ne regardait que le mode, donc `pod_brand` obtenait ici la recherche
  // visiteur du catalogue Printful -- alors que ses produits viennent de ses
  // mockups, que sa vitrine ne monte aucune barre de recherche
  // (`showsVisitorCatalogSearch`) et que son agent n'a aucun outil de
  // curation (`CATALOG_SUBTYPES`). Trois couches disaient deja non ; cette
  // route repondait oui. AUCUN APPELANT LEGITIME N'EST TOUCHE : la barre
  // n'est jamais montee pour lui.
  //
  // FORME DE REPONSE RIGOUREUSEMENT INCHANGEE (voir ci-dessus) : meme objet
  // que le succes, simplement vide. Un 403 apprendrait a un rodeur que le
  // slug existe.
  if (!usesCatalogSelections((site as { mode?: unknown }).mode, (site as { dropship_type?: unknown }).dropship_type)) {
    return NextResponse.json({
      products: [],
      total: 0,
      page,
      page_size: pageSize,
      has_more: false,
    });
  }

  const { margin, roundMode } = sitePricing(site);
  const calcPrice = (cost: number) => calcSellPrice(cost, margin, roundMode);

  // Split query into words for ilike matching
  const words = q ? q.toLowerCase().split(/\s+/).filter(w => w.length >= 2) : [];

  // ====== 1. Search curated products first ======
  let curatedResults: any[] = [];
  if (words.length > 0) {
    let cQuery = supabaseAdmin
      .from('site_catalog_selections')
      .select('id, sell_price, custom_name, custom_description, catalog_product_id, catalog_products(id, name, description, price, currency, images, supplier_id, supplier_product_id, supplier_parent_id, shipping_days_min, shipping_days_max, warehouse_country, in_stock)')
      .eq('site_id', site.id)
      .eq('merchant_approved', true);

    const { data: curatedSels } = await cQuery;

    if (curatedSels && curatedSels.length > 0) {
      curatedResults = curatedSels
        .filter((s: any) => {
          const cp = s.catalog_products;
          // in_stock null = jamais verifie : le produit reste visible.
          // Seul un false explicite (pose par supplier-watch) le masque.
          if (!cp || cp.in_stock === false) return false;
          const name = (s.custom_name || cp.name || '').toLowerCase();
          const desc = (s.custom_description || cp.description || '').toLowerCase();
          return words.every(w => name.includes(w) || desc.includes(w));
        })
        .map((s: any) => {
          const cp = s.catalog_products;
          const cost = cp.price ? Number(cp.price) : 0;
          return {
            id: `catalog-${cp.id}`,
            supplier_id: cp.supplier_id,
            supplier_product_id: cp.supplier_product_id,
            // LOT 4 / R4-02 -- voir themes/shared.tsx : une ligne sans parent
            // designe un PRODUIT, donc la variante doit etre choisie.
            requires_variant: !cp.supplier_parent_id,
            name: s.custom_name || cp.name,
            description: s.custom_description || cp.description || '',
            price: resolveDisplayPrice(cost, s.sell_price, margin, roundMode),
            currency: cp.currency || 'CAD',
            images: cp.images || [],
            shipping_days_min: cp.shipping_days_min,
            shipping_days_max: cp.shipping_days_max,
            warehouse_country: cp.warehouse_country,
            _curated: true,
          };
        });
    }
  }

  // ====== 2. Search global catalog ======
  // LOT K (Mode 3 global, fuites d'info) -- cause racine : `.select('*')` +
  // `{...p}` plus bas exposaient TOUT catalog_products au visiteur public de
  // ce storefront, y compris `_cost` (le cout fournisseur reel, jamais
  // destine au client final -- seul l'editeur marchand a besoin de voir sur
  // quoi la marge s'applique, cf. commentaire d'origine ligne 144) et toute
  // colonne future ajoutee a cette table sans jamais etre revue pour cet
  // endpoint precis. Liste explicite desormais (meme convention que
  // catalog/image-search/route.ts, deja correcte) : seules les colonnes
  // reellement necessaires a l'affichage storefront quittent la DB.
  let query2 = supabaseAdmin
    .from('catalog_products')
    .select('id, supplier_id, supplier_product_id, supplier_parent_id, name, description, category, images, variants, price, currency, shipping_days_min, shipping_days_max, warehouse_country', { count: 'exact' })
    // Meme regle qu'ailleurs : seul un false explicite masque le produit.
    .not('in_stock', 'is', false);

  // ilike for each word in name
  if (words.length > 0) {
    for (const w of words) {
      query2 = query2.ilike('name', `%${w}%`);
    }
  } else {
    const niche = extractNicheKeyword(site.type);
    if (niche) {
      const nicheWords = niche.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
      for (const w of nicheWords) {
        query2 = query2.ilike('name', `%${w}%`);
      }
    }
  }

  // Cloisonnement STRICT par sous-type : une boutique pod_brand/pod_custom ne
  // montre que du POD (Printful/Gelato), une boutique reseller que du CJ. La
  // regle vient du dropship_type de la boutique, PAS d'un parametre d'URL.
  const allowedSuppliers = suppliersForDropshipType((site as any).dropship_type);
  query2 = query2.in('supplier_id', allowedSuppliers);
  // Filtre additionnel optionnel (ex. restreindre a un seul fournisseur autorise).
  if (supplier && allowedSuppliers.includes(supplier)) {
    query2 = query2.eq('supplier_id', supplier);
  }
  if (maxDays) {
    query2 = query2.lte('shipping_days_min', parseInt(maxDays, 10));
  }

  switch (sort) {
    case 'price_asc': query2 = query2.order('price', { ascending: true }); break;
    case 'price_desc': query2 = query2.order('price', { ascending: false }); break;
    case 'shipping': query2 = query2.order('shipping_days_min', { ascending: true }); break;
    default: query2 = query2.order('last_synced_at', { ascending: false });
  }

  const from = (page - 1) * pageSize;
  query2 = query2.range(from, from + pageSize - 1);

  const { data: globalProducts, count, error } = await query2;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Apply pricing to global results
  const curatedIds = new Set(curatedResults.map((p: any) => p.id));
  const globalMapped = (globalProducts || [])
    .filter((p: any) => !curatedIds.has(`catalog-${p.id}`))
    .map((p: any) => {
      const cost = p.price ? Number(p.price) : 0;
      // LOT K -- objet de reponse construit explicitement (jamais `{...p}`) :
      // seul `price` (marque, calcPrice(cost)) est renvoye, jamais `cost`/
      // `_cost` ni aucune colonne non listee ici. Le cout fournisseur reste
      // consultable par l'editeur marchand via ses propres routes
      // authentifiees (catalog/curate, catalog/enhance -- requireSiteOwner),
      // jamais via un endpoint public.
      return {
        id: `catalog-${p.id}`,
        supplier_id: p.supplier_id,
        supplier_product_id: p.supplier_product_id,
        requires_variant: !p.supplier_parent_id,
        name: p.name,
        description: p.description || '',
        category: p.category,
        images: p.images || [],
        variants: p.variants,
        price: calcPrice(cost),
        currency: p.currency || 'CAD',
        shipping_days_min: p.shipping_days_min,
        shipping_days_max: p.shipping_days_max,
        warehouse_country: p.warehouse_country,
        _curated: false,
      };
    });

  // ====== 3. Merge: curated first, then global ======
  let merged = [...curatedResults, ...globalMapped];

  // Warehouse priority sorting
  const warehousePriority: Record<string, string[]> = {
    US: ['US', 'CA', 'MX', 'DE', 'CN', 'TH'],
    CA: ['US', 'CA', 'MX', 'DE', 'CN', 'TH'],
    MX: ['US', 'CA', 'MX', 'DE', 'CN', 'TH'],
    GB: ['DE', 'US', 'CN', 'TH'],
    DE: ['DE', 'US', 'CN', 'TH'],
    FR: ['DE', 'US', 'CN', 'TH'],
    JP: ['JP', 'TH', 'CN', 'US', 'DE'],
    AU: ['AU', 'TH', 'CN', 'US', 'DE'],
    BR: ['BR', 'US', 'CN', 'DE'],
  };
  const defaultPriority = ['US', 'DE', 'CN', 'TH'];
  const priority = country ? (warehousePriority[country] || defaultPriority) : null;

  if (priority) {
    // Keep curated first, then sort global by warehouse
    const curated = merged.filter((p: any) => p._curated);
    const global = merged.filter((p: any) => !p._curated);
    global.sort((a: any, b: any) => {
      const aIdx = priority.indexOf(a.warehouse_country);
      const bIdx = priority.indexOf(b.warehouse_country);
      return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
    });
    merged = [...curated, ...global];
  }

  // Remove internal flag
  const final = merged.map(({ _curated, ...rest }) => rest);

  return NextResponse.json({
    products: final,
    total: (count || 0) + curatedResults.length,
    page,
    page_size: pageSize,
    has_more: (count || 0) > from + pageSize,
  });
}

function extractNicheKeyword(type: string | null): string | null {
  if (!type) return null;
  const cleaned = type
    .replace(/\b(dropshipping|retailer|store|shop|boutique|online|e-commerce|ecommerce|print-on-demand|print on demand|pod|marketplace|fashion brand)\b/gi, '')
    .replace(/[&.]/g, ' ')
    .trim();
  return cleaned || null;
}
